import { SPECULOS_URL } from "@/lib/ledger/bridge";

export const dynamic = "force-dynamic";

// Proxy the live Speculos device screen so the user can watch the real device
// while approving. Returns 503 when no device is present (DEMO mode).
export async function GET() {
  try {
    const r = await fetch(`${SPECULOS_URL}/screenshot?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return new Response("speculos error", { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        "content-type": r.headers.get("content-type") || "image/png",
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return new Response("no-device", { status: 503 });
  }
}
