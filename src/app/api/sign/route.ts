import { Signature, verifyMessage } from "ethers";
import {
  signMessage,
  getAddress,
  speculosReachable,
  isDeviceRejection,
  describeError,
} from "@/lib/ledger/bridge";
import { DERIVATION_PATH } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  // Honesty rule: if there is no reachable device, we do NOT fabricate a
  // signature. We tell the client this is DEMO mode and stop.
  if (!(await speculosReachable())) {
    return Response.json(
      { ok: false, kind: "no-device", message: "Speculos is not reachable." },
      { status: 503 },
    );
  }

  let message: string;
  try {
    const body = (await req.json()) as { message?: string };
    message = (body.message || "").trim();
  } catch {
    message = "";
  }
  if (!message) {
    return Response.json(
      { ok: false, kind: "error", message: "Missing identity message." },
      { status: 400 },
    );
  }

  try {
    // The agent proposes; the human signs on hardware.
    const deviceAddress = await getAddress(DERIVATION_PATH);
    const sig = await signMessage(DERIVATION_PATH, message);

    // Normalise v (Ledger may return 0/1 or 27/28) and verify the signature
    // recovers to the device's own address. This is the real check that the
    // identity is anchored in the Secure Element.
    const v = sig.v < 27 ? sig.v + 27 : sig.v;
    const serialized = Signature.from({ r: sig.r, s: sig.s, v }).serialized;
    const recovered = verifyMessage(message, serialized);
    const verified =
      recovered.toLowerCase() === deviceAddress.toLowerCase();

    return Response.json({
      ok: true,
      kind: verified ? "verified" : "mismatch",
      message,
      address: deviceAddress,
      recovered,
      verified,
      signature: serialized,
    });
  } catch (err) {
    if (isDeviceRejection(err)) {
      return Response.json(
        { ok: false, kind: "rejected", message: describeError(err) },
        { status: 200 },
      );
    }
    return Response.json(
      { ok: false, kind: "error", message: describeError(err) },
      { status: 500 },
    );
  }
}
