# Agent Identity

**A Ledger makes an agent real.**

A minimal, serious demonstration of one idea: an AI agent's identity must be
anchored in hardware. Software credentials can be copied, so an agent that can
only present software has no identity it can actually prove. Only a hardware
signature gives an agent a real, unforgeable identity.

One central line-art fingerprint is the whole demo. It starts **hollow** (a
software credential proves nothing) and becomes **full and green** only when the
agent proves its identity by signing a short message on a Ledger device, with a
human approving and the signature verified to the device address.

> Agents propose, humans sign, hardware enforces.

## What it shows

- **Use software credential** — the fingerprint stays a faint outline, with a
  duplicate peeling away. A copyable token is not an identity; anyone could
  present the same one. (An illustrative animation, not a live operation.)
- **Prove with Ledger** — the agent signs `I am agent-7f3a. Identity challenge:
  0x….` (EIP-191 `personal_sign`) on the Ledger Ethereum app. On real approval
  the signature is verified to recover to the device address and the fingerprint
  fills green. This is the "a Ledger makes an agent real" moment.

## Modes

- **DEMO** — no emulator. The page and software animation work; the Ledger
  button is disabled. Nothing is ever fabricated. This is how it runs on Render.
- **LIVE** — a Speculos emulator is reachable; a real signing round-trip happens.

See **[docs/RUN.md](docs/RUN.md)** for exact DEMO and LIVE steps.

## Stack

Next.js + TypeScript. Server-side-only signing via the Ledger Device Management
Kit (with a direct-APDU fallback to Speculos) and `ethers` for verification.

## Disclaimer

Independent demonstration. Not an official Ledger product and not affiliated with
or endorsed by Ledger. Emulator and testnet only.
