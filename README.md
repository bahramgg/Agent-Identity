# Agent Identity

**A Ledger makes an agent real.**

A minimal, serious demonstration of one idea: an AI agent's identity must be
anchored in hardware. Software credentials can be copied, so an agent that can
only present software has no identity it can actually prove. Only a hardware
signature, anchored in the Secure Element and confirmed by a human on the
device's trusted display, gives an agent a real, unforgeable identity.

One central line-art fingerprint is the whole demo. It starts **hollow** and
becomes **full and green** only when the agent proves its identity by signing a
short message on a Ledger device, with a human approving and the signature
verified to recover to the device address.

> Agents propose, humans sign, hardware enforces.

This illustrates the **Agent Identity** pillar of Ledger's 2026 AI roadmap, built
on the **Ledger Agent Stack**.

## What it shows

- **The agent speaks first.** A short, in-character intro plays one message at a
  time, in a fixed box: the agent can act in software but cannot prove who it is,
  because software can be copied — so it asks to be anchored in your hardware
  wallet. Step through it to reach the action.
- **Prove with Ledger.** The agent signs `I am agent-7f3a. Identity challenge:
  0x….` (EIP-191 `personal_sign`) on the Ledger Ethereum app. You open the Ledger
  signer and approve the message on the device (clear signing); the signature is
  verified to recover to the device address, and the fingerprint fills green. This
  is the "a Ledger makes an agent real" moment.

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
   enforcing a human-confirmation timeout.

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
  DEMO mode and refuses to fake a signature or a verification.

### What this project does **not** use, and why

The Agent Stack also includes the **Ledger Wallet CLI** and the **Enterprise
Multisig CLI**. Those are USB tools for *moving value* and for enterprise quorum
flows. This demo is about *identity* (signing a challenge), so they are out of
scope here; bolting them on would be artificial.

## Modes

- **DEMO** — no emulator. The page and the agent intro work; the Ledger button
  is disabled. Nothing is ever fabricated. This is how it runs on Render.
- **LIVE** — a Speculos emulator is reachable; a real signing round-trip happens
  and the fingerprint fills green only on real success.

```bash
npm install
npm run build && npm run start    # DEMO mode → http://localhost:3000
npm run live                      # full LIVE mode: Speculos + app in one command
```

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
or endorsed by Ledger. Emulator and testnet only.
