import type { ConnectionState, DeviceReading, SignalSample, SignalSource } from "./types";

/**
 * โครงสำหรับต่อ ESP32 ผ่าน WebSocket ในอนาคต — ยังไม่ได้ทดสอบกับฮาร์ดแวร์จริง และยังไม่ได้ผูกกับ UI
 * รูปแบบข้อความที่รองรับ (หนึ่งข้อความต่อหนึ่งค่า):
 *   {"nasalPercent": 28.5, "speechDetected": true}
 *   หรือ CSV "28.5,1"
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
      return { nasalPercent: n, speechDetected: s };
    } catch {
      return null;
    }
  }
  const [a, b] = text.split(",");
  const n = Number(a);
  if (!Number.isFinite(n) || (b !== "0" && b !== "1")) return null;
  return { nasalPercent: n, speechDetected: b === "1" };
}

export class WebSocketSignalSource implements SignalSource {
  readonly kind = "websocket" as const;
  private ws: WebSocket | null = null;
  private sample: SignalSample | null = null;
  private conn: ConnectionState = "disconnected";
  private listeners = new Set<() => void>();
  private url: string;

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
    const ws = new WebSocket(this.url);
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
    this.conn = c;
    for (const l of this.listeners) l();
  }
}
