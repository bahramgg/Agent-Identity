# Running Agent Identity

> A Ledger makes an agent real.

Two ways to run it:

- **DEMO mode** — no emulator. The page and the software-credential animation
  work and are clearly labelled as a scenario. The "Prove with Ledger" button is
  disabled. No signature, device screen, or verification is ever fabricated.
- **LIVE mode** — a Speculos emulator is reachable. "Prove with Ledger" does a
  real EIP-191 `personal_sign` round-trip on the emulated Ledger Ethereum app,
  the human approves on the device, and the signature is verified to recover to
  the device address. The fingerprint fills green only on real success.

LIVE mode is local only. On Render it always runs in DEMO mode.

---

## Prerequisites

- Node.js 22+
- Docker (LIVE mode only)
- Ubuntu / WSL2 recommended

```bash
git clone <this repo>
cd Agent-Identity
npm install
```

---

## DEMO mode

```bash
npm run build
npm run start
# open http://localhost:3000
```

`SPECULOS_URL` is unset, so the header shows **Demo**. You can step through the
agent's intro, but **Prove with Ledger** is disabled — no signature is ever
fabricated without a reachable device.

For development with hot reload: `npm run dev`.

---

## LIVE mode (two terminals)

A ready-to-run **Ethereum app ELF** for **Nano S Plus** is bundled at
[`speculos/ethereum.elf`](../speculos/ethereum.elf), so `npm run live` works out
of the box with `MODEL=nanosp` (the default). It is the official Ledger Ethereum
app built for the emulator; emulator / testnet use only.

To emulate a different model, drop in the matching build (from the
[app-ethereum](https://github.com/LedgerHQ/app-ethereum) CI artifacts or
[ledger-app-builder](https://github.com/LedgerHQ/ledger-app-builder)) and set
`MODEL` accordingly.

> The Speculos `-m / --model` must match the model the ELF was built for
> (`nanox`, `nanosp`, `stax`, `flex`, …) or Speculos exits with
> `Invalid model in ethereum.elf (<elf> vs <given>)`. The bundled ELF is
> `nanosp`; a Nano X build uses `nanox`.

### Easiest — one command

Boot the emulator and the app together, fully locally, with a single command:

```bash
npm run live
# open http://localhost:3000  (header shows "Live")
# Ctrl-C stops both the app and the emulator
```

`npm run live` runs [`scripts/local-live.sh`](../scripts/local-live.sh). It picks a
Speculos runner automatically:

- the native **`speculos`** CLI if it is installed (see Option B), or
- the official **Speculos Docker image** if Docker is available — this bundles
  qemu + python + speculos, so nothing has to compile (handy on newer distros
  where the pip build of `pygame`/`pillow` fails).

It waits until Speculos is reachable, starts the app pointed at it, and tears the
emulator down cleanly on exit. Override with env vars, e.g.
`SPECULOS_RUNNER=docker npm run live`, `MODEL=nanox npm run live`, or
`ELF=/path/to/ethereum.elf npm run live`.

The two-terminal setup below is the manual equivalent if you prefer to run the
pieces yourself.

### Terminal 1 — Speculos (keep this open the whole time)

You can run Speculos with **Docker** or, if you cannot pull the image, with
**pip** (both verified to work for this demo).

**Option A — Docker**

```bash
mkdir -p speculos   # put ethereum.elf here

docker run --rm -it \
  -v "$PWD/speculos:/speculos/apps" \
  -p 5000:5000 \
  ghcr.io/ledgerhq/speculos:latest \
  --model nanosp \
  --display headless \
  --api-port 5000 \
  apps/ethereum.elf
```

**Option B — pip (no Docker)**

```bash
pip install speculos
sudo apt-get install -y qemu-user-static   # provides qemu-arm-static

speculos -m nanosp --display headless --api-port 5000 ./speculos/ethereum.elf
```

- The Speculos REST API (screen + buttons + APDU) is now on
  `http://localhost:5000`. You can watch/drive the device at that URL too.
- With **no `--seed`** Speculos uses its built-in default seed. At derivation
  path `44'/60'/0'/0/0` that yields the known address
  **`0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D`**, which is what this app's
  signature verification recovers to. (Pass `--seed "<mnemonic>"` to use a
  different key; the app reads whatever address the device reports, so
  verification still works.)

**Do not close this terminal.** If it stops, the app drops back to DEMO mode.

#### Blind signing

Plain EIP-191 personal messages are **clear-signed**: the Ethereum app shows the
message text and the human approves. **Blind signing does not need to be
enabled** for this demo (verified live: the device shows
`Review message → Message → Sign message → Message signed`).

The only time you would need it is if the device returns status `0x6a80` ("Blind
signing not enabled"). If that happens, on the Speculos screen open the Ethereum
app **Settings → Blind signing → Enabled** (navigate with the on-screen buttons,
or use the buttons inside this app while signing), then sign again.

### Terminal 2 — the app, pointed at Speculos

```bash
SPECULOS_URL=http://localhost:5000 npm run dev
# or, against a production build:
# npm run build && SPECULOS_URL=http://localhost:5000 npm run start
# open http://localhost:3000
```

The header now shows **Live**. Step through the agent's intro, then click
**Prove with Ledger**:

1. The app generates a short identity message
   (`I am agent-7f3a. Identity challenge: 0x….`) and sends it to the device.
2. Click **Open Ledger signer ↗** to open the Speculos window, review the message
   on the device, and approve it there.
3. On approval the signature is verified to recover to the device address and the
   fingerprint fills green.

### Quick CLI check (no browser)

```bash
SPECULOS_URL=http://localhost:5000 npm run test-sign
```

Approve on the device when prompted. It prints the device address, the recovered
signer, the signature, and `VERIFIED: YES ✓`.

---

## Environment variables

| Variable                 | Purpose                                                        | Default              |
| ------------------------ | ------------------------------------------------------------- | -------------------- |
| `SPECULOS_URL`           | Speculos REST URL. Set it to enable LIVE mode.                | _(unset → DEMO)_     |
| `LEDGER_DERIVATION_PATH` | BIP-32 path for the identity key.                             | `44'/60'/0'/0/0`     |
| `LEDGER_TRANSPORT`       | `auto` (DMK, fall back to raw APDU), `dmk`, or `apdu`.        | `auto`               |
| `PORT`                   | Port for `npm run start`.                                     | `3000`               |

### How signing works

By default the app signs through the **Ledger Device Management Kit** (`signMessage`)
with the Speculos transport. The DMK path follows the official **DMK Signing Flow**
skill (installed under [`.agents/skills/`](../.agents/skills)): device-session →
device-state gate → Ethereum app management → the signing operation, with a
human-confirmation timeout and DMK Skills error classification.

If DMK fails to load (for example an ESM resolution issue), it automatically falls
back to talking to Speculos directly over its HTTP APDU endpoint
(`POST {SPECULOS_URL}/apdu`) using the app-ethereum `SIGN ETH PERSONAL MESSAGE`
command (`E0 08 …`). Force one path with `LEDGER_TRANSPORT=dmk` or
`LEDGER_TRANSPORT=apdu`.

### DMK Skills

The official Ledger DMK Skills are installed in this repo:

```bash
npx skills add ledgerhq/agent-skills -s ledger-dmk-implementation dmk-intent-vocabulary dmk-business-logic
```

They are build-time guidance for coding agents (Cursor, Claude Code, etc.) that
encode Ledger's prescribed DMK integration patterns. They do not run at app
runtime; the running behaviour lives in `src/lib/ledger/bridge.ts`, which
implements the flow they describe.
