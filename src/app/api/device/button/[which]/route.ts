import { SPECULOS_URL } from "@/lib/ledger/bridge";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["left", "right", "both"]);

// Proxy a button press to the live Speculos device so the user can approve or
// reject from this page. Never simulates a press when no device is present.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ which: string }> },
) {
  const { which } = await params;
  if (!ALLOWED.has(which)) return new Response("bad button", { status: 400 });
  try {
    const r = await fetch(`${SPECULOS_URL}/button/${which}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "press-and-release" }),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return new Response("speculos error", { status: 502 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, message: "no-device" }, { status: 503 });
  }
}
