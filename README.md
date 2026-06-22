# Agent Identity

**A Ledger makes an agent real.**

A minimal, serious demonstration of one idea: an AI agent's identity must be
anchored in hardware. Software credentials can be copied, so an agent that can
only present software has no identity it can actually prove. Only a hardware
signature, anchored in the Secure Element and confirmed by a human on the
device's trusted display, gives an agent a real, unforgeable identity.

One central line-art fingerprint is the whole demo. It starts **hollow** (a
software credential proves nothing) and becomes **full and green** only when the
agent proves its identity by signing a short message on a Ledger device, with a
human approving and the signature verified to recover to the device address.

> Agents propose, humans sign, hardware enforces.

This illustrates the **Agent Identity** pillar of Ledger's 2026 AI roadmap, built
on the **Ledger Agent Stack**.

## What it shows

- **Use software credential** — the fingerprint stays a faint outline, with a
  duplicate peeling away. A copyable token is not an identity; anyone could
  present the same one. (An illustrative animation, not a live operation.)
- **Prove with Ledger** — the agent signs `I am agent-7f3a. Identity challenge:
  0x….` (EIP-191 `personal_sign`) on the Ledger Ethereum app. The message text is
  shown on the device (clear signing), the human approves, and the signature is
  verified to recover to the device address. The fingerprint fills green. This is
  the "a Ledger makes an agent real" moment.

## Built on the Ledger Agent Stack

This project uses the **foundational layer of the Ledger Agent Stack** and follows
its standards. Concretely:

| Agent Stack component | How this project uses it |
| --- | --- |
| **Device Management Kit** (`@ledgerhq/device-management-kit`) | All device interaction: session, device-state gate, app management, the signing device action. |
| **Ethereum Signer Kit** (`@ledgerhq/device-signer-kit-ethereum`) | `SignerEthBuilder(...).signMessage(path, message)` for EIP-191 personal-message signing. |
| **Speculos transport** (`@ledgerhq/device-transport-kit-speculos`) | Reaches the emulated Ledger over HTTP in LIVE mode. |
| **DMK Skills** (`ledgerhq/agent-skills`) | Installed into [`.agents/skills/`](.agents/skills); the server bridge implements the official **DMK Signing Flow** gate-by-gate. |

The signing bridge in [`src/lib/ledger/bridge.ts`](src/lib/ledger/bridge.ts)
follows the DMK Skills "DMK Signing Flow" step by step:

1. **SDK init** — one DMK instance per process.
2. **Device session** — discover and connect (the `listenToAvailableDevices`
   pattern prescribed for Node contexts).
3. **Device-state gate** — check `getDeviceSessionState`; a locked or
   disconnected device is escalated, never worked around.
4. **App management** — ensure the Ethereum app is the open app.
5. **Operation** — `signMessage`, surfacing the required user interaction and
   enforcing a 60-second human-confirmation timeout.

Standards we follow from the Agent Stack docs:

- **The device screen is the only trusted display.** The signature cannot be
  produced without the human physically approving the message on the device.
- **Clear signing, not blind signing.** The identity message is plain
  human-readable text, so the Ethereum app displays exactly what is signed. Blind
  signing is not required.
- **The agent never holds keys.** It only proposes the message; the key lives in
  the Secure Element.
- **User rejection is a distinct outcome**, not an error; errors are classified
  per the DMK Skills table.
- **No stub, no mock, no fabrication.** If no device is reachable the app shows
  DEMO mode and refuses to fake a signature, screen, or verification.

### What this project does **not** use, and why

The Agent Stack also includes the **Ledger Wallet CLI** and the **Enterprise
Multisig CLI**. Those are USB tools for *moving value* and for enterprise quorum
flows. This demo is about *identity* (signing a challenge), so they are out of
scope here; bolting them on would be artificial.

## Modes

- **DEMO** — no emulator. The page and software animation work; the Ledger
  button is disabled. Nothing is ever fabricated. This is how it runs on Render.
- **LIVE** — a Speculos emulator is reachable; a real signing round-trip happens
  and the fingerprint fills green only on real success.

See **[docs/RUN.md](docs/RUN.md)** for exact DEMO and LIVE steps.

## Honest limitations and the path to real hardware

This is a faithful **emulator / testnet** demonstration. It is **not** wired for a
real Ledger as-is:

- The only transport configured is **Speculos**. Signing on a real device needs a
  real transport — `@ledgerhq/device-transport-kit-web-hid` (browser) or a
  Node-HID transport.
- Signing here runs **server-side** against the emulator. A real Ledger is plugged
  into the *user's* machine, so a production build must sign **client-side** (e.g.
  browser WebHID next to the device), not on the server.
- **Genuine Check** (device authenticity attestation) is the Agent Stack's
  real-hardware authenticity gate. It requires a live connection to Ledger's
  backend and a genuine device, so it is not exercised against Speculos.

## Stack

Next.js + TypeScript. Server-side-only signing via the Ledger Device Management
Kit and Ethereum Signer Kit (with a direct-APDU fallback to Speculos for
robustness), and `ethers` for signature verification.

## References

- Ledger Agent Stack overview — https://developers.ledger.com/docs/ai-tools/overview
- DMK Skills — https://developers.ledger.com/docs/ai-tools/ledger-dmk-skills
- Agent skills repo — https://github.com/LedgerHQ/agent-skills
- Ethereum Signer Kit — https://developers.ledger.com/docs/device-interaction/references/signers/eth
- Speculos — https://github.com/LedgerHQ/speculos

## Disclaimer

Independent demonstration. Not an official Ledger product and not affiliated with
or endorsed by Ledger. Emulator and testnet only. The software-credential state
is an illustrative animation of a known limitation, not a live cryptographic
operation.
