// Standalone LIVE check: connect to Speculos, sign the identity message on the
// Ledger Ethereum app, and verify the signature recovers to the device address.
//
//   SPECULOS_URL=http://localhost:5000 npm run test-sign
//
// Approve the message on the Speculos screen (or via the device buttons) when
// prompted. Keep the Speculos terminal open in parallel.

import { Signature, verifyMessage } from "ethers";
import {
  getAddress,
  signMessage,
  speculosReachable,
} from "../src/lib/ledger/bridge";
import { makeChallenge, DERIVATION_PATH } from "../src/lib/identity";

async function main() {
  if (!(await speculosReachable())) {
    console.error(
      "Speculos is not reachable. Start it first, then set SPECULOS_URL.",
    );
    process.exit(1);
  }

  const { message } = makeChallenge();
  console.log("Derivation path :", DERIVATION_PATH);
  console.log("Identity message:", message);
  console.log("\nApprove the message on the device…\n");

  const address = await getAddress(DERIVATION_PATH);
  const sig = await signMessage(DERIVATION_PATH, message);
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const serialized = Signature.from({ r: sig.r, s: sig.s, v }).serialized;
  const recovered = verifyMessage(message, serialized);
  const verified = recovered.toLowerCase() === address.toLowerCase();

  console.log("Device address  :", address);
  console.log("Recovered signer:", recovered);
  console.log("Signature       :", serialized);
  console.log("\nVERIFIED        :", verified ? "YES ✓" : "NO ✗");
  process.exit(verified ? 0 : 2);
}

main().catch((err) => {
  console.error("\nError:", err?.message || err);
  process.exit(1);
});
