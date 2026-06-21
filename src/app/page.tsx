"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  idle: "This agent can think and act in software, but it has no identity it can prove.",
  copyable:
    "A software credential is not an identity. It can be copied, so anyone could present the same token. The fingerprint stays hollow.",
  signing:
    "Signing the identity message on the Ledger. Review it on the device and approve.",
  real: "Identity verified. It is anchored in the Secure Element and cannot be copied.",
  rejected: "Approval was declined on the device. The identity stays unproven.",
  error: "The signing attempt did not complete.",
};

export default function Page() {
  const [mode, setMode] = useState<Mode>("checking");
  const [print, setPrint] = useState<PrintState>("hollow");
  const [status, setStatus] = useState<string>(STATUS.idle);
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const screenTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [screenTick, setScreenTick] = useState(0);

  // The status line turns green exactly when the print is real; no separate state.
  const statusReal = print === "real";

  useEffect(() => {
    setMessage(newIdentityMessage());
    let alive = true;
    fetch("/api/health/device")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setMode(d.mode === "live" ? "live" : "demo");
      })
      .catch(() => alive && setMode("demo"));
    return () => {
      alive = false;
    };
  }, []);

  // While signing in live mode, poll the real device screen.
  useEffect(() => {
    if (print === "signing" && mode === "live") {
      screenTimer.current = setInterval(() => setScreenTick((t) => t + 1), 700);
    } else if (screenTimer.current) {
      clearInterval(screenTimer.current);
      screenTimer.current = null;
    }
    return () => {
      if (screenTimer.current) clearInterval(screenTimer.current);
    };
  }, [print, mode]);

  const useSoftware = useCallback(() => {
    setError("");
    setResult(null);
    setPrint("copyable");
    setStatus(STATUS.copyable);
    setMessage(newIdentityMessage());
  }, []);

  const pressButton = useCallback(async (which: "left" | "right" | "both") => {
    try {
      await fetch(`/api/device/button/${which}`, { method: "POST" });
    } catch {
      /* device gone; the sign call will surface the error */
    }
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
        // signature did not recover to the device address (handled by the card)
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
  }, []);

  return (
    <main className="wrap">
      <header className="topbar">
        <span className="brand">Agent Identity</span>
        <span className={`mode-pill ${mode === "live" ? "live" : ""}`}>
          <span className="dot" />
          {mode === "checking" ? "checking" : mode === "live" ? "Live" : "Demo"}
        </span>
      </header>

      <section className="hero">
        <h1>An agent is only as real as what it can prove.</h1>
        <p className="tagline">A Ledger makes an agent real.</p>
        <p className="subtle">
          An agent can think, talk, and act in software. But proving who it is
          cannot come from software, because software can be copied. Identity has
          to be anchored in hardware.
        </p>
      </section>

      <section className="stage">
        <div className="print-frame">
          <Fingerprint state={print} />
        </div>
        <p className={`status-line ${statusReal ? "real" : ""}`}>{status}</p>
      </section>

      <section className="controls">
        <button
          className={`btn ${print === "signing" ? "busy" : ""}`}
          onClick={useSoftware}
          disabled={busy}
        >
          Use software credential
        </button>
        {print === "real" ? (
          <button className="btn" onClick={reset}>
            Reset
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={proveWithLedger}
            disabled={mode !== "live" || busy}
            title={mode !== "live" ? "Speculos required for live signing" : ""}
          >
            {busy ? "Waiting for device…" : "Prove with Ledger"}
          </button>
        )}
      </section>

      {mode === "demo" && (
        <p className="note" style={{ marginTop: 10, textAlign: "center" }}>
          Live signing needs a reachable Speculos emulator. On this hosted demo
          the Ledger button is disabled and no signature is ever fabricated.
        </p>
      )}

      {/* Signing card: shows the exact identity message that gets clear-signed */}
      <section className="card">
        <div className="card-head">
          <span className="tag">Identity message</span>
          <span>EIP-191 personal_sign · Ethereum</span>
        </div>
        <div className="card-body">
          <div>
            <div className="field-label">The agent asks the human to sign</div>
            <div className="msg">{message || "…"}</div>
          </div>

          {print === "signing" && mode === "live" && (
            <div>
              <div className="field-label">Live device — approve to continue</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/device/screen?t=${screenTick}`}
                alt="Ledger device screen"
                style={{
                  width: "100%",
                  borderRadius: 9,
                  border: "1px solid var(--line)",
                  background: "#000",
                }}
              />
              <div className="controls" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => pressButton("left")}>
                  ◀
                </button>
                <button className="btn" onClick={() => pressButton("right")}>
                  ▶
                </button>
                <button className="btn primary" onClick={() => pressButton("both")}>
                  Approve
                </button>
              </div>
            </div>
          )}

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

          {error && <div className="err">{error}</div>}

          {print === "copyable" && (
            <p className="note">
              This is an illustrative animation of a known limitation: a copyable
              secret proves nothing about who is presenting it.
            </p>
          )}
        </div>
      </section>

      <footer className="footer">
        Agents propose, humans sign, hardware enforces. Agent Identity anchors an
        agent to the Secure Element rather than to spoofable software
        credentials.
        <br />
        <br />
        Independent demonstration. Not an official Ledger product and not
        affiliated with or endorsed by Ledger. Emulator and testnet only. The
        software-credential state is an illustrative animation, not a live
        cryptographic operation.
      </footer>
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
