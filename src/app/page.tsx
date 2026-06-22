"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, type PrintState } from "@/components/Fingerprint";

const AGENT_ID = "agent-7f3a";

type Mode = "checking" | "demo" | "live";

type SignResult = {
  ok: boolean;
  kind: string;
  message?: string;
  address?: string;
  recovered?: string;
  verified?: boolean;
  signature?: string;
};

function newIdentityMessage(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const nonce =
    "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `I am ${AGENT_ID}. Identity challenge: ${nonce}.`;
}

const STATUS = {
  idle: "This agent has no identity it can prove yet.",
  signing: "Open the Ledger signer and approve the message on the device.",
  real: "Identity verified. It is anchored in the Secure Element and cannot be copied.",
  rejected: "Approval was declined on the device. The identity stays unproven.",
  error: "The signing attempt did not complete.",
};

// Messages spoken by the agent, shown one at a time in a fixed box. "Continue"
// replaces the current message with the next, leading up to Prove with Ledger.
const SCRIPT: string[] = [
  "Hey. Before you let me act for you, there's something you should know about me.",
  "I can read, reason, and prepare anything you ask. But I can't actually prove that I'm me.",
  "Everything I hold is software, and software can be copied. Someone could clone my token and walk in wearing my face.",
  "So don't trust my software. Anchor me to your hardware wallet instead — that's something no one can copy.",
  "Let me sign an identity challenge on your Ledger. Approve it, and from now on it's provably me.",
];

const SIGNING_MSG =
  "The challenge is on your Ledger signer now. Open it, read the message on the device, and approve it. I'll know the moment you do.";
const VERIFIED_MSG =
  "That's it. My identity is anchored in your Secure Element now, signed by your hand on hardware. You can trust it's really me.";

export default function Page() {
  const [mode, setMode] = useState<Mode>("checking");
  const [print, setPrint] = useState<PrintState>("hollow");
  const [status, setStatus] = useState<string>(STATUS.idle);
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [speculosUrl, setSpeculosUrl] = useState("http://localhost:5000");
  const [step, setStep] = useState(0); // index of the agent message on screen

  const statusReal = print === "real";
  const isLast = step >= SCRIPT.length - 1;
  const advance = useCallback(
    () => setStep((s) => Math.min(s + 1, SCRIPT.length - 1)),
    [],
  );

  useEffect(() => {
    setMessage(newIdentityMessage());
    let alive = true;
    fetch("/api/health/device")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMode(d.mode === "live" ? "live" : "demo");
        if (d.speculosUrl) setSpeculosUrl(d.speculosUrl);
      })
      .catch(() => alive && setMode("demo"));
    return () => {
      alive = false;
    };
  }, []);

  const proveWithLedger = useCallback(async () => {
    if (mode !== "live" || busy) return;
    const msg = message || newIdentityMessage();
    setMessage(msg);
    setError("");
    setResult(null);
    setBusy(true);
    setPrint("signing");
    setStatus(STATUS.signing);
    try {
      const r = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data: SignResult = await r.json();
      setResult(data);
      if (data.ok && data.verified) {
        setPrint("real");
        setStatus(STATUS.real);
      } else if (data.kind === "rejected") {
        setPrint("hollow");
        setStatus(STATUS.rejected);
      } else if (data.ok && !data.verified) {
        setPrint("hollow");
        setStatus(STATUS.error);
      } else {
        setPrint("hollow");
        setStatus(STATUS.error);
        setError(data.message || "Signing failed.");
      }
    } catch (e) {
      setPrint("hollow");
      setStatus(STATUS.error);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [mode, busy, message]);

  const reset = useCallback(() => {
    setPrint("hollow");
    setStatus(STATUS.idle);
    setResult(null);
    setError("");
    setMessage(newIdentityMessage());
    setStep(SCRIPT.length - 1); // back to the final message / prove step
  }, []);

  return (
    <main className="wrap">
      <header className="topbar">
        <a
          className="about-link"
          href="/about"
          target="_blank"
          rel="noopener noreferrer"
        >
          About ↗
        </a>
        <span className="brand">Agent Identity</span>
        <span className={`mode-pill ${mode === "live" ? "live" : ""}`}>
          <span className="dot" />
          {mode === "checking" ? "checking" : mode === "live" ? "Live" : "Demo"}
        </span>
      </header>

      <div className="layout">
        <section className="stage">
          <div className="print-frame">
            <Fingerprint state={print} />
          </div>
          <p className={`status-line ${statusReal ? "real" : ""}`}>{status}</p>
        </section>

        <section className="panel">
          <p className="tagline">A Ledger makes an agent real.</p>

          {/* The agent speaks, one message at a time in a fixed box */}
          <section className="card convo">
            <div className="card-head">
              <span className="tag">
                <span className="who-dot" /> Agent
              </span>
              <span>
                {print === "signing"
                  ? "approving"
                  : print === "real"
                    ? "verified"
                    : `${step + 1} / ${SCRIPT.length}`}
              </span>
            </div>
            <div className="card-body">
              <div className={`convo-msg ${print === "real" ? "good" : ""}`}>
                {print === "signing" ? (
                  <p key="signing">{SIGNING_MSG}</p>
                ) : print === "real" ? (
                  <p key="real">{VERIFIED_MSG}</p>
                ) : (
                  <p key={step}>{SCRIPT[step]}</p>
                )}
              </div>

              {error && <div className="err">{error}</div>}

              <div className="convo-foot">
                {print === "real" ? (
                  <button className="btn block" onClick={reset}>
                    Start over
                  </button>
                ) : print === "signing" ? (
                  <a
                    className="btn primary block"
                    href={speculosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Ledger signer ↗
                  </a>
                ) : !isLast ? (
                  <button className="btn block" onClick={advance}>
                    Continue
                  </button>
                ) : (
                  <button
                    className="btn primary block"
                    onClick={proveWithLedger}
                    disabled={mode !== "live" || busy}
                    title={mode !== "live" ? "Speculos required for live signing" : ""}
                  >
                    {busy ? "Waiting for device…" : "Prove with Ledger"}
                  </button>
                )}
              </div>
            </div>
          </section>

          {mode === "demo" && isLast && (
            <p className="note">
              Live signing needs a reachable Speculos emulator. On this hosted
              demo the button is disabled and no signature is ever fabricated.
            </p>
          )}

          {/* The exact identity message that gets clear-signed, shown at the prove step */}
          {isLast && (
            <section className="card">
              <div className="card-head">
                <span className="tag">Identity message</span>
                <span>EIP-191 · Ethereum</span>
              </div>
              <div className="card-body">
                <div>
                  <div className="field-label">The agent asks the human to sign</div>
                  <div className="msg">{message || "…"}</div>
                </div>

                {result && result.ok && result.verified && (
                  <>
                    <div className="verified-row">
                      <Check /> Verified — recovers to the Ledger address
                    </div>
                    <div className="kv">
                      <b>Signer</b> {result.address}
                    </div>
                    <div className="kv">
                      <b>Signature</b> {shorten(result.signature)}
                    </div>
                  </>
                )}

                {result && result.ok && !result.verified && (
                  <div className="err">
                    Signature did not recover to the device address.
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function shorten(s?: string): string {
  if (!s) return "";
  return s.length > 26 ? `${s.slice(0, 14)}…${s.slice(-10)}` : s;
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="var(--green)" />
      <path
        d="M4.5 8.2 L7 10.5 L11.5 5.5"
        fill="none"
        stroke="#04130c"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
