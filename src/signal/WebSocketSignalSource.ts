import type { ConnectionState, DeviceReading, SignalSample, SignalSource } from "./types";

/** dB fields: a number, or null/"-inf" for digital silence (dead channel). Anything else = field absent. */
function parseDb(v: unknown): number | undefined {
  if (v === null || v === "-inf" || v === "-Infinity") return -Infinity;
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function withQuality(base: DeviceReading, nasalDb: unknown, oralDb: unknown, clip: unknown): DeviceReading {
  const n = parseDb(nasalDb);
  const o = parseDb(oralDb);
  const out: DeviceReading = { ...base };
  // Level fields only count as a pair: one channel alone cannot tell a dead mic from a quiet room.
  if (n !== undefined && o !== undefined) {
    out.nasalDb = n;
    out.oralDb = o;
  }
  if (clip === true || clip === 1 || clip === "1") out.clip = true;
  else if (clip === false || clip === 0 || clip === "0") out.clip = false;
  return out;
}

/**
 * แปลงข้อความหนึ่งข้อความจาก ESP32 เป็นค่าหนึ่งชุด (รายละเอียด docs/DEVICE_PROTOCOL.md)
 *   {"nasalPercent": 28.5, "speechDetected": true, "nasalDb": -31.2, "oralDb": -24.0, "clip": false}
 *   หรือ CSV "28.5,1" / "28.5,1,-31.2,-24.0,0"  (ช่องระดับเสียงและ clip ไม่บังคับ)
 */
export function parseReading(raw: string): DeviceReading | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const n = Number(obj.nasalPercent);
      const s = obj.speechDetected;
      if (!Number.isFinite(n) || typeof s !== "boolean") return null;
      return withQuality({ nasalPercent: n, speechDetected: s }, obj.nasalDb, obj.oralDb, obj.clip);
    } catch {
      return null;
    }
  }
  const [a, b, c, d, e] = text.split(",").map((x) => x.trim());
  const n = Number(a);
  if (!Number.isFinite(n) || (b !== "0" && b !== "1")) return null;
  return withQuality({ nasalPercent: n, speechDetected: b === "1" }, c, d, e);
}

/**
 * ESP32 ผ่าน WebSocket — ใช้ได้จากหน้า http (เช่น npm run dev ในวง Wi-Fi เดียวกับอุปกรณ์)
 * หน้า https บังคับให้ใช้ wss:// เท่านั้น · ยังไม่ได้ทดสอบกับฮาร์ดแวร์จริง
 */
export class WebSocketSignalSource implements SignalSource {
  readonly kind = "websocket" as const;
  private ws: WebSocket | null = null;
  private sample: SignalSample | null = null;
  private conn: ConnectionState = "disconnected";
  private listeners = new Set<() => void>();
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  latest(): SignalSample | null {
    return this.sample;
  }

  connection(): ConnectionState {
    return this.conn;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.ws) return;
    this.setConn("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      // Invalid URL or ws:// blocked on an https page.
      this.setConn("disconnected");
      return;
    }
    this.ws = ws;
    ws.onopen = () => this.setConn("connected");
    ws.onclose = () => {
      this.ws = null;
      this.setConn("disconnected");
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      const reading = typeof ev.data === "string" ? parseReading(ev.data) : null;
      if (reading) this.sample = { ...reading, t: performance.now() };
    };
  }

  stop(): void {
    this.ws?.close();
    this.ws = null;
    this.setConn("disconnected");
  }

  private setConn(c: ConnectionState): void {
    // Packets from before a drop are never read after it: start every link state with no sample.
    if (c !== "connected") this.sample = null;
    this.conn = c;
    for (const l of this.listeners) l();
  }
}
