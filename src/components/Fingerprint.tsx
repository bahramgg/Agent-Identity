"use client";

export type PrintState = "hollow" | "signing" | "real";

/**
 * A clean, line-art fingerprint. One element with three visual states:
 *  - hollow:   faint outline only (no proven identity yet)
 *  - signing:  a scan sweep while the Ledger round-trip is in flight
 *  - real:     filled and green (the identity is anchored in hardware)
 *
 * The ridges are generated from a small set of parameters so the line-art stays
 * consistent and the file stays small.
 */

// Nested vertical-oval ridges, each nearly closed with a small opening at the
// bottom, plus a central core loop. Reads as a thumbprint rather than arches.
const RIDGES = buildRidges();

function buildRidges(): string[] {
  const cx = 100;
  const cy = 100;
  const paths: string[] = [];
  const count = 8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (rx: number, ry: number, deg: number): [number, number] => [
    +(cx + rx * Math.cos(rad(deg))).toFixed(2),
    +(cy + ry * Math.sin(rad(deg))).toFixed(2),
  ];
  for (let i = 0; i < count; i++) {
    const rx = 12 + i * 8.4;
    const ry = 16 + i * 9.6;
    const gap = 20 + (i % 2) * 6; // small opening at the bottom, lightly staggered
    const [x0, y0] = pt(rx, ry, 90 + gap); // lower-left
    const [x1, y1] = pt(rx, ry, 90 - gap); // lower-right
    // large-arc=1, sweep=1 -> the long way up and over the top
    paths.push(`M ${x0} ${y0} A ${rx} ${ry} 0 1 1 ${x1} ${y1}`);
  }
  // central core: a small loop with a hook (the print's centre)
  paths.push(`M 106 96 C 108 88, 95 86, 94 95 C 93 103, 104 105, 106 99`);
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
          <ellipse cx="100" cy="100" rx="62" ry="78" />
        </clipPath>
      </defs>

      {/* soft fill that only shows in the "real" state */}
      <circle className="fp-fill" cx="100" cy="102" r="84" />

      {/* the ridges themselves */}
      <g>
        {RIDGES.map((d, i) => (
          <path key={i} className="fp-path" d={d} />
        ))}
      </g>

      {/* scan sweep while signing */}
      <g clipPath="url(#fpClip)">
        <rect className="scan" x="20" y="96" width="160" height="6" fill="var(--green)" />
      </g>
    </svg>
  );
}
