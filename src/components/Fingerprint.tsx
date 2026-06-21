"use client";

export type PrintState = "hollow" | "copyable" | "signing" | "real";

/**
 * A clean, line-art fingerprint. It is one element with several visual states:
 *  - hollow:   faint outline only (a copyable software secret is not an identity)
 *  - copyable: hollow + a duplicate outline peeling away (anyone can present it)
 *  - signing:  a scan sweep while the Ledger round-trip is in flight
 *  - real:     filled, green, with a small verified mark (anchored in hardware)
 *
 * The ridges are generated from a small set of parameters so the line-art stays
 * consistent and the file stays small.
 */

// Concentric loop ridges, opening downward, centred near the top third.
const RIDGES = buildRidges();

function buildRidges(): string[] {
  const cx = 100;
  const cy = 96;
  const paths: string[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const rx = 16 + i * 8.4;
    const ry = 20 + i * 9.6;
    const openY = cy + ry * 0.55; // where the loop trails open at the bottom
    const leftX = cx - rx;
    const rightX = cx + rx;
    // arch up and over the top, then the two legs trail down with a gentle bow
    const d =
      `M ${leftX.toFixed(1)} ${openY.toFixed(1)} ` +
      `C ${leftX.toFixed(1)} ${(cy - ry).toFixed(1)}, ${rightX.toFixed(1)} ${(cy - ry).toFixed(1)}, ${rightX.toFixed(1)} ${openY.toFixed(1)} ` +
      // little inward hooks so the legs read like fingerprint ridges
      `M ${leftX.toFixed(1)} ${openY.toFixed(1)} ` +
      `C ${(leftX + 2).toFixed(1)} ${(openY + 14).toFixed(1)}, ${(leftX + 8).toFixed(1)} ${(openY + 20).toFixed(1)}, ${(leftX + 13).toFixed(1)} ${(openY + 22).toFixed(1)} ` +
      `M ${rightX.toFixed(1)} ${openY.toFixed(1)} ` +
      `C ${(rightX - 2).toFixed(1)} ${(openY + 14).toFixed(1)}, ${(rightX - 8).toFixed(1)} ${(openY + 20).toFixed(1)}, ${(rightX - 13).toFixed(1)} ${(openY + 22).toFixed(1)}`;
    paths.push(d);
  }
  // a small central core (the innermost loop / delta)
  paths.push(`M 92 92 C 92 84, 108 84, 108 92 C 108 100, 92 100, 92 96`);
  return paths;
}

export function Fingerprint({ state }: { state: PrintState }) {
  return (
    <svg
      className={`fp ${state}`}
      width="210"
      height="210"
      viewBox="0 0 200 200"
      role="img"
      aria-label="Agent identity fingerprint"
    >
      <defs>
        <clipPath id="fpClip">
          {RIDGES.map((d, i) => (
            <path key={`c${i}`} d={d} />
          ))}
        </clipPath>
      </defs>

      {/* soft fill that only shows in the "real" state */}
      <circle className="fp-fill" cx="100" cy="104" r="86" />

      {/* the ridges themselves */}
      <g>
        {RIDGES.map((d, i) => (
          <path key={i} className="fp-path" d={d} />
        ))}
      </g>

      {/* duplicate outline that peels away in software / copyable mode */}
      <g className="fp-ghost-group">
        {RIDGES.slice(0, 6).map((d, i) => (
          <path key={`g${i}`} className="fp-ghost" d={d} />
        ))}
      </g>

      {/* scan sweep while signing */}
      <g clipPath="url(#fpClip)">
        <rect className="scan" x="20" y="96" width="160" height="6" fill="var(--green)" />
      </g>

      {/* verified badge, bottom-right, appears only in real state */}
      <g className="verify-badge" transform="translate(150 150)">
        <circle cx="0" cy="0" r="20" fill="var(--green)" />
        <path
          d="M -8 0 L -2 7 L 9 -7"
          fill="none"
          stroke="#04130c"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
