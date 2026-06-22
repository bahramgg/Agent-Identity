import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Agent Identity",
  description:
    "What Agent Identity demonstrates, how it uses the Ledger Agent Stack, and its limitations.",
};

export default function About() {
  return (
    <main className="wrap about">
      <header className="topbar">
        <span className="brand">Agent Identity</span>
        <Link className="about-link" href="/">
          ← Back to demo
        </Link>
      </header>

      <article className="prose">
        <h1>A Ledger makes an agent real.</h1>
        <p>
          An agent can think, talk, and act in software. But proving who it is
          cannot come from software, because software can be copied. Identity has
          to be anchored in hardware. The demo proves an agent&apos;s identity by
          signing a short message on a Ledger device: the human reads the message
          on the device&apos;s trusted display and approves, and the signature is
          verified to recover to the device address.
        </p>

        <h2>Built on the Ledger Agent Stack</h2>
        <p>
          This project uses the foundational layer of the Ledger Agent Stack and
          follows its standards. The agent never holds keys; it only proposes the
          message. The key lives in the Secure Element, and the signature cannot
          be produced without a human physically approving on the device.
        </p>
        <ul>
          <li>
            <b>Device Management Kit</b> — session, device-state gate, app
            management, and the signing device action.
          </li>
          <li>
            <b>Ethereum Signer Kit</b> — <code>signMessage</code> for EIP-191
            personal-message signing.
          </li>
          <li>
            <b>Speculos transport</b> — reaches the emulated Ledger over HTTP in
            LIVE mode.
          </li>
          <li>
            <b>DMK Skills</b> — the signing bridge follows the official DMK
            Signing Flow gate by gate.
          </li>
        </ul>

        <h2>Standards followed</h2>
        <ul>
          <li>The device screen is the only trusted display.</li>
          <li>
            Clear signing, not blind signing: the identity message is plain text,
            so the device shows exactly what is signed.
          </li>
          <li>User rejection is a distinct outcome, not an error.</li>
          <li>
            No stub, no mock, no fabrication. With no device reachable the app
            shows DEMO mode and refuses to fake a signature, screen, or
            verification.
          </li>
        </ul>

        <h2>Modes</h2>
        <p>
          <b>DEMO</b> — no emulator; the button is disabled and nothing is
          fabricated (this is how it runs when hosted). <b>LIVE</b> — a Speculos
          emulator is reachable and a real signing round-trip happens; the
          fingerprint fills green only on real success.
        </p>

        <h2>Limitations</h2>
        <p>
          This is a faithful emulator / testnet demonstration. The only transport
          configured is Speculos, and signing runs server-side against the
          emulator. A production build for a real Ledger would sign client-side
          (e.g. browser WebHID next to the device) and add device authenticity
          (Genuine Check).
        </p>

        <h2>References</h2>
        <ul>
          <li>
            <a href="https://developers.ledger.com/docs/ai-tools/overview" target="_blank" rel="noopener noreferrer">
              Ledger Agent Stack overview
            </a>
          </li>
          <li>
            <a href="https://developers.ledger.com/docs/ai-tools/ledger-dmk-skills" target="_blank" rel="noopener noreferrer">
              DMK Skills
            </a>
          </li>
          <li>
            <a href="https://developers.ledger.com/docs/device-interaction/references/signers/eth" target="_blank" rel="noopener noreferrer">
              Ethereum Signer Kit
            </a>
          </li>
        </ul>

        <hr />
        <p className="disclaimer">
          Independent demonstration. Not an official Ledger product and not
          affiliated with or endorsed by Ledger. Emulator and testnet only.
        </p>
      </article>
    </main>
  );
}
