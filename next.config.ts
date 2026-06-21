import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Ledger Device Management Kit and related native/ESM packages must stay
  // external to the server bundle so Next does not try to bundle them. This
  // mirrors the FAILSAFE reference structure: DMK is loaded at runtime on the
  // server only, never shipped to the client.
  serverExternalPackages: [
    "@ledgerhq/device-management-kit",
    "@ledgerhq/device-signer-kit-ethereum",
  ],
};

export default nextConfig;
