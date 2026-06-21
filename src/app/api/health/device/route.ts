import { speculosReachable, SPECULOS_URL } from "@/lib/ledger/bridge";

export const dynamic = "force-dynamic";

// DEMO vs LIVE probe. LIVE only when a Speculos emulator is actually reachable.
export async function GET() {
  const reachable = await speculosReachable();
  return Response.json({
    mode: reachable ? "live" : "demo",
    reachable,
    speculosUrl: SPECULOS_URL,
  });
}
