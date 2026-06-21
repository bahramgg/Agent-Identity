import { randomBytes } from "crypto";

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
