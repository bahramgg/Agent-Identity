// Server-side bridge to a Ledger device via the Device Management Kit (DMK) +
// the Speculos transport, mirroring the FAILSAFE reference architecture. One
// DMK instance per process, memoized and self-healing. Nothing here is ever
// fabricated: if Speculos is unreachable the signing call throws and the UI
// shows DEMO mode instead.
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

function runAction<T = any>(action: { observable: any; cancel: () => void }): Promise<T> {
  const status = dmkApi!.DeviceActionStatus;
  return new Promise((resolve, reject) => {
    const sub = action.observable.subscribe({
      next: (state: any) => {
        if (state.status === status.Completed) {
          sub.unsubscribe();
          resolve(state.output);
        } else if (state.status === status.Error) {
          sub.unsubscribe();
          reject(state.error);
        } else if (state.status === status.Stopped) {
          sub.unsubscribe();
          reject(new Error("Action cancelled on device."));
        }
      },
      error: (err: unknown) => reject(err),
    });
  });
}

async function dmkGetAddress(path: string): Promise<string> {
  const { signer } = await getBridge();
  const out = await runAction<{ address: string }>(
    signer.getAddress(path, { checkOnDevice: false }),
  );
  return out.address;
}

async function dmkSignMessage(path: string, message: string): Promise<Signature> {
  try {
    const { signer } = await getBridge();
    const out = await runAction<Signature>(signer.signMessage(path, message));
    return { r: out.r, s: out.s, v: out.v };
  } catch (err) {
    if (isDeviceRejection(err)) throw err;
    // self-heal a stale session once
    await resetBridge();
    const { signer } = await getBridge();
    return runAction<Signature>(signer.signMessage(path, message));
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
      useApdu = true;
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
      useApdu = true;
    }
  }
  return signMessageViaApdu(path, message);
}

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
    /cancelled on device/i.test(msg)
  );
}

export function describeError(error: unknown): string {
  if (isDeviceRejection(error)) return "Action cancelled on the device.";
  const code = String((error as any)?.errorCode ?? "");
  if (code === "5515" || (error as any)?._tag === "DeviceLockedError")
    return "Device locked. Enter the PIN on the device.";
  if (code === "6807") return "Ethereum app is not open on the device.";
  if (code === "6a80") return "Blind signing is not enabled in the Ethereum app.";
  if (code === "6e00") return "Wrong app open on the device.";
  return (error as Error)?.message ?? "Unexpected device error.";
}
