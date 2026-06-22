// Server-side bridge to a Ledger device via the Device Management Kit (DMK) +
// the Speculos transport — the foundational layer of the Ledger Agent Stack.
// The DMK path follows the official "DMK Signing Flow" skill
// (.agents/skills/ledger-dmk-implementation): SDK init -> device session ->
// device-state gate -> Ethereum app management -> the signing operation, with
// the device screen as the only trusted display and the human approving every
// signature. One DMK instance per process, memoized and self-healing. Nothing
// here is ever fabricated: if Speculos is unreachable the signing call throws
// and the UI shows DEMO mode instead.
//
// We load the DMK CJS build via createRequire because its ESM build uses
// directory imports that Node's strict ESM resolver rejects. Next keeps these
// packages external via serverExternalPackages in next.config.ts.
//
// If DMK cannot load or LEDGER_TRANSPORT=apdu is set, we fall back to talking
// to Speculos directly over its HTTP APDU endpoint (see speculos.ts).

import { createRequire } from "module";
import { firstValueFrom, filter, take, timeout } from "rxjs";
import {
  getAddressViaApdu,
  signMessageViaApdu,
  speculosReachable as apduReachable,
  SPECULOS_URL,
} from "./speculos";

export { SPECULOS_URL };

const TRANSPORT = (process.env.LEDGER_TRANSPORT || "auto").toLowerCase();

export type Signature = { r: string; s: string; v: number };

// ---- DMK path -------------------------------------------------------------

type Bridge = { dmk: any; sessionId: string; signer: any };
let bridgePromise: Promise<Bridge> | null = null;

function loadDmk() {
  const req = createRequire(import.meta.url);
  const DMK = req("@ledgerhq/device-management-kit");
  const SpeculosTransport = req("@ledgerhq/device-transport-kit-speculos");
  const EthSigner = req("@ledgerhq/device-signer-kit-ethereum");
  return {
    DeviceManagementKitBuilder: DMK.DeviceManagementKitBuilder,
    DeviceActionStatus: DMK.DeviceActionStatus,
    DeviceStatus: DMK.DeviceStatus,
    UserInteractionRequired: DMK.UserInteractionRequired,
    OpenAppCommand: DMK.OpenAppCommand,
    speculosTransportFactory: SpeculosTransport.speculosTransportFactory,
    SignerEthBuilder: EthSigner.SignerEthBuilder,
  };
}

let dmkApi: ReturnType<typeof loadDmk> | null = null;

async function buildBridge(): Promise<Bridge> {
  dmkApi = loadDmk();
  const { DeviceManagementKitBuilder, speculosTransportFactory, SignerEthBuilder } =
    dmkApi;
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(speculosTransportFactory(SPECULOS_URL))
    .build();

  const devices = (await firstValueFrom(
    dmk.listenToAvailableDevices({}).pipe(
      filter((list: unknown[]) => list.length > 0),
      take(1),
      timeout(5_000),
    ),
  )) as any[];
  const sessionId = await dmk.connect({ device: devices[0] });
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();
  return { dmk, sessionId, signer };
}

function getBridge(): Promise<Bridge> {
  if (!bridgePromise) {
    bridgePromise = buildBridge().catch((err) => {
      bridgePromise = null;
      throw err;
    });
  }
  return bridgePromise;
}

async function resetBridge(): Promise<void> {
  const prev = bridgePromise;
  bridgePromise = null;
  if (!prev) return;
  try {
    const { dmk, sessionId } = await prev;
    await dmk.disconnect({ sessionId });
  } catch {
    /* connection already gone */
  }
}

// Drives a DMK device-action observable to its result, following the official
// DMK Skills "Step 5 — Operation" state machine: surface the required user
// interaction, escalate a mid-flow device lock, and enforce a confirmation
// timeout so we never wait on the human forever.
function runAction<T = any>(
  action: { observable: any; cancel: () => void },
  { timeoutMs = 60_000, label = "the operation" }: { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const status = dmkApi!.DeviceActionStatus;
  const UIR = dmkApi!.UserInteractionRequired;
  return new Promise((resolve, reject) => {
    let sub: { unsubscribe: () => void };
    const done = (fn: () => void) => {
      clearTimeout(timer);
      try {
        sub?.unsubscribe();
      } catch {
        /* already torn down */
      }
      fn();
    };
    const timer = setTimeout(() => {
      try {
        action.cancel();
      } catch {
        /* nothing to cancel */
      }
      done(() => reject(new Error(`Timed out waiting for ${label} on the device.`)));
    }, timeoutMs);

    sub = action.observable.subscribe({
      next: (state: any) => {
        if (state.status === status.Pending) {
          // The device screen is the only trusted display; a lock mid-flow is a
          // hard human-in-the-loop gate, not something we retry around.
          if (state.intermediateValue?.requiredUserInteraction === UIR.UnlockDevice) {
            done(() =>
              reject(
                Object.assign(new Error("Device locked. Enter your PIN on the device."), {
                  _tag: "DeviceLockedError",
                }),
              ),
            );
          }
          return;
        }
        if (state.status === status.Completed) done(() => resolve(state.output));
        else if (state.status === status.Error) done(() => reject(state.error));
        else if (state.status === status.Stopped)
          done(() => reject(new Error("Action cancelled on the device.")));
      },
      error: (err: unknown) => done(() => reject(err)),
    });
  });
}

// DMK Skills "Step 3 — Device State" and "Step 4 — App Management": before a
// signing operation, confirm the device is ready and the Ethereum app is open.
// Signer kits open the app automatically, so this is mainly an explicit gate and
// clearer errors; on Speculos the Ethereum app is already the running ELF.
async function preflight(dmk: any, sessionId: string): Promise<void> {
  const { DeviceStatus, OpenAppCommand } = dmkApi!;
  let state: any;
  try {
    state = await firstValueFrom(
      dmk.getDeviceSessionState({ sessionId }).pipe(take(1), timeout(5_000)),
    );
  } catch {
    return; // refresher not ready yet; let the signer drive the operation
  }

  // Step 3 — Device State
  if (state.deviceStatus === DeviceStatus.LOCKED)
    throw Object.assign(new Error("Device locked. Enter your PIN on the device."), {
      _tag: "DeviceLockedError",
    });
  if (state.deviceStatus === DeviceStatus.NOT_CONNECTED)
    throw Object.assign(new Error("Device disconnected."), {
      _tag: "DeviceDisconnectedWhileSendingError",
    });

  // Step 4 — App Management: ensure the Ethereum app is the open app.
  const appName: string | undefined = state.currentApp?.name;
  const onDashboard = appName === "BOLOS" || appName === "Dashboard";
  if (appName && appName !== "Ethereum") {
    if (onDashboard || true) {
      try {
        await dmk.sendCommand({ sessionId, command: new OpenAppCommand("Ethereum") });
      } catch {
        /* signer kits also open the app automatically; let it try */
      }
    }
  }
}

async function dmkGetAddress(path: string): Promise<string> {
  const { signer } = await getBridge();
  const out = await runAction<{ address: string }>(
    signer.getAddress(path, { checkOnDevice: false }),
    { timeoutMs: 15_000, label: "address retrieval" },
  );
  return out.address;
}

async function dmkSignMessage(path: string, message: string): Promise<Signature> {
  const sign = async (): Promise<Signature> => {
    const { dmk, sessionId, signer } = await getBridge();
    await preflight(dmk, sessionId);
    // The message is plain human-readable text, so the Ethereum app clear-signs
    // it (the user reads exactly what they approve) without needing originToken.
    const out = await runAction<Signature>(signer.signMessage(path, message), {
      timeoutMs: 120_000,
      label: "you to review and sign the message",
    });
    return { r: out.r, s: out.s, v: out.v };
  };
  try {
    return await sign();
  } catch (err) {
    if (isDeviceRejection(err)) throw err;
    // self-heal a stale session once (a new flow from discovery, per the skill)
    await resetBridge();
    return sign();
  }
}

// ---- public API: prefer DMK, fall back to direct APDU ---------------------

let useApdu = TRANSPORT === "apdu";

export async function speculosReachable(): Promise<boolean> {
  return apduReachable();
}

export async function getAddress(path: string): Promise<string> {
  if (!useApdu) {
    try {
      return await dmkGetAddress(path);
    } catch (err) {
      if (isDeviceRejection(err)) throw err;
      console.warn("[bridge] DMK getAddress failed, falling back to APDU:", err);
      // Latch to APDU permanently only if DMK never even loaded (the ESM/Node
      // resolution case). A transient device error falls back for this request
      // only, so DMK is retried next time.
      if (!dmkApi) useApdu = true;
    }
  }
  return getAddressViaApdu(path);
}

export async function signMessage(path: string, message: string): Promise<Signature> {
  if (!useApdu) {
    try {
      return await dmkSignMessage(path, message);
    } catch (err) {
      if (isDeviceRejection(err)) throw err;
      console.warn("[bridge] DMK signMessage failed, falling back to APDU:", err);
      if (!dmkApi) useApdu = true;
    }
  }
  return signMessageViaApdu(path, message);
}

// Error classification, following the DMK Skills tables. User rejection is a
// distinct outcome (neutral/amber UI), not an error. UnknownDeviceExchangeError
// buries errorCode inside originalError, so we check both. 6982 covers the
// "security status not satisfied / cancelled by user" code.
export function isDeviceRejection(error: unknown): boolean {
  const tag = (error as any)?._tag ?? "";
  const code = String(
    (error as any)?.errorCode ?? (error as any)?.originalError?.errorCode ?? "",
  );
  const msg = String((error as any)?.message ?? "");
  return (
    tag === "RefusedByUserDAError" ||
    code === "5501" ||
    code === "6985" ||
    code === "6982" ||
    /cancelled on (the )?device/i.test(msg)
  );
}

export function describeError(error: unknown): string {
  if (isDeviceRejection(error)) return "Action cancelled on the device.";
  const tag = (error as any)?._tag ?? "";
  const code = String(
    (error as any)?.errorCode ?? (error as any)?.originalError?.errorCode ?? "",
  );
  if (tag === "DeviceLockedError" || code === "5515")
    return "Device locked. Enter your PIN on the device to continue.";
  if (code === "6807")
    return "The Ethereum app is not installed on the device.";
  if (code === "6a80")
    return "Blind signing is not enabled in the Ethereum app settings.";
  if (code === "6e00" || code === "6d00")
    return "Wrong app open on the device. The Ethereum app must be open.";
  if (tag === "DeviceDisconnectedWhileSendingError")
    return "Lost connection to the device. Reconnect and try again.";
  if (tag === "SendApduTimeoutError")
    return "Communication with the device timed out. Check the connection.";
  if (tag === "NoAccessibleDeviceError")
    return "No device found, or access to it was denied.";
  return (error as Error)?.message ?? "Unexpected device error.";
}
