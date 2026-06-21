// Direct-APDU fallback path: talk to the Speculos emulator over its HTTP APDU
// endpoint, exactly like a raw transport. This is used only if the Ledger
// Device Management Kit fails to load (e.g. an ESM/Node resolution issue) or
// when LEDGER_TRANSPORT=apdu is set. The DMK signer in bridge.ts is preferred.
//
// Speculos exposes:  POST {SPECULOS_URL}/apdu  {"data":"<apduHex>"}
//                ->  {"data":"<responseHex>"}   (response ends in a 2-byte SW)
//
// app-ethereum "SIGN ETH PERSONAL MESSAGE" (EIP-191):
//   CLA=E0 INS=08 P1=00(first)/80(next) P2=00
//   first data block: <pathLen><path...><4-byte msgLen><message chunk>
//   next  data blocks: <message chunk>
//   response: v(1) || r(32) || s(32), SW 9000

export const SPECULOS_URL = process.env.SPECULOS_URL || "http://127.0.0.1:5000";

const HARDENED = 0x80000000;

function encodePath(path: string): Buffer {
  const parts = path.replace(/^m\//, "").split("/").filter(Boolean);
  const buf = Buffer.alloc(1 + parts.length * 4);
  buf.writeUInt8(parts.length, 0);
  parts.forEach((p, i) => {
    const hardened = p.endsWith("'") || p.endsWith("h");
    const n = parseInt(p.replace(/['h]$/, ""), 10);
    buf.writeUInt32BE((hardened ? n | HARDENED : n) >>> 0, 1 + i * 4);
  });
  return buf;
}

async function exchange(apduHex: string, timeoutMs = 60_000): Promise<Buffer> {
  const r = await fetch(`${SPECULOS_URL}/apdu`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: apduHex }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`Speculos APDU HTTP ${r.status}`);
  const json = (await r.json()) as { data: string };
  const resp = Buffer.from(json.data ?? "", "hex");
  if (resp.length < 2) throw new Error("Malformed APDU response from device.");
  const sw = resp.readUInt16BE(resp.length - 2);
  if (sw !== 0x9000) {
    const map: Record<number, string> = {
      0x6985: "Action cancelled on device.",
      0x5501: "Action cancelled on device.",
      0x6982: "Device locked.",
      0x6a80: "Blind signing not enabled in the device's Ethereum app.",
      0x6807: "Ethereum app not installed on the device.",
      0x6e00: "Wrong app open on device.",
    };
    throw new Error(map[sw] || `Device returned status 0x${sw.toString(16)}`);
  }
  return resp.subarray(0, resp.length - 2);
}

export async function speculosReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${SPECULOS_URL}/screenshot`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function getAddressViaApdu(path: string): Promise<string> {
  const data = encodePath(path);
  // E0 02 00 00 — get address, no on-device confirmation
  const apdu = Buffer.concat([
    Buffer.from([0xe0, 0x02, 0x00, 0x00, data.length]),
    data,
  ]);
  const resp = await exchange(apdu.toString("hex"), 5_000);
  // response: <pubKeyLen><pubKey><addrLen><addressAsciiHex>...
  const pubKeyLen = resp.readUInt8(0);
  const addrLenOffset = 1 + pubKeyLen;
  const addrLen = resp.readUInt8(addrLenOffset);
  const addrAscii = resp
    .subarray(addrLenOffset + 1, addrLenOffset + 1 + addrLen)
    .toString("ascii");
  return "0x" + addrAscii;
}

export async function signMessageViaApdu(
  path: string,
  message: string,
): Promise<{ r: string; s: string; v: number }> {
  const pathData = encodePath(path);
  const msg = Buffer.from(message, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msg.length, 0);

  // First payload = path + 4-byte message length + as much message as fits.
  const header = Buffer.concat([pathData, lenBuf]);
  const MAX = 255;
  let offset = 0;
  let firstChunkLen = Math.min(msg.length, MAX - header.length);
  let payload = Buffer.concat([header, msg.subarray(0, firstChunkLen)]);
  offset = firstChunkLen;

  let resp: Buffer | null = null;
  let p1 = 0x00;
  // first APDU
  resp = await exchange(
    Buffer.concat([
      Buffer.from([0xe0, 0x08, p1, 0x00, payload.length]),
      payload,
    ]).toString("hex"),
  );
  // subsequent chunks
  p1 = 0x80;
  while (offset < msg.length) {
    const chunkLen = Math.min(msg.length - offset, MAX);
    const chunk = msg.subarray(offset, offset + chunkLen);
    offset += chunkLen;
    resp = await exchange(
      Buffer.concat([
        Buffer.from([0xe0, 0x08, p1, 0x00, chunk.length]),
        chunk,
      ]).toString("hex"),
    );
  }

  if (!resp || resp.length < 65) throw new Error("Short signature from device.");
  const v = resp.readUInt8(0);
  const r = "0x" + resp.subarray(1, 33).toString("hex");
  const s = "0x" + resp.subarray(33, 65).toString("hex");
  return { r, s, v };
}
