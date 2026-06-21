import { randomBytes } from "crypto";
import { Signature, verifyMessage } from "ethers";

export type LedgerSignature = { r: string; s: string; v: number };

// The standard Ethereum account-0 derivation path. Overridable via env so the
// same path can be matched against the seeded Speculos device.
export const DERIVATION_PATH =
  process.env.LEDGER_DERIVATION_PATH || "44'/60'/0'/0/0";

// A short, stable-ish agent id for the demo. Not a secret; just a label that
// goes into the identity message the human approves on the device.
export const AGENT_ID = "agent-7f3a";

export type IdentityChallenge = {
  agentId: string;
  nonce: string;
  message: string;
};

/**
 * Build the short EIP-191 personal_message the agent asks the Ledger to sign.
 * It is plain human-readable text so the device can clear-sign it: the human
 * reads exactly what they approve. No transaction, no payment.
 */
export function makeChallenge(agentId: string = AGENT_ID): IdentityChallenge {
  const nonce = "0x" + randomBytes(8).toString("hex");
  const message = `I am ${agentId}. Identity challenge: ${nonce}.`;
  return { agentId, nonce, message };
}

/**
 * The security-critical core: normalise the Ledger signature (v may come back
 * as 0/1 or 27/28) and verify it recovers to the device's own address. Shared
 * by the /api/sign route and the test-sign script so they cannot drift.
 */
export function verifyIdentitySignature(
  message: string,
  sig: LedgerSignature,
  deviceAddress: string,
): { serialized: string; recovered: string; verified: boolean } {
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const serialized = Signature.from({ r: sig.r, s: sig.s, v }).serialized;
  const recovered = verifyMessage(message, serialized);
  const verified = recovered.toLowerCase() === deviceAddress.toLowerCase();
  return { serialized, recovered, verified };
}
