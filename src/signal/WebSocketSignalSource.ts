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

/** Waits between reconnect tries after a drop: 1, 2, 4, then every 5 seconds. */
const RETRY_MS = [1000, 2000, 4000, 5000];
/** A try that has not opened by then is given up (an unreachable address can hang for a minute in the browser). */
const OPEN_TIMEOUT_MS = 4000;

/**
 * ESP32 ผ่าน WebSocket — ใช้ได้จากหน้า http (เช่น npm run dev ในวง Wi-Fi เดียวกับอุปกรณ์)
 * หน้า https บังคับให้ใช้ wss:// เท่านั้น · เฟิร์มแวร์: firmware/pakkeng_esp32
 * หลุดแล้วต่อใหม่เอง (รอ 1, 2, 4 แล้วทุก 5 วินาที) ระหว่างรอสถานะเป็น "disconnected" ให้ผู้ดูแลเห็นวิธีแก้
 */
export class WebSocketSignalSource implements SignalSource {
  readonly kind = "websocket" as const;
  private ws: WebSocket | null = null;
  private sample: SignalSample | null = null;
  private conn: ConnectionState = "disconnected";
  private listeners = new Set<() => void>();
  /** start() was called and stop() was not: keep the link up. */
  private wanted = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this.wanted) return;
    this.wanted = true;
    this.retries = 0;
    this.setConn("connecting");
    this.open();
  }

  stop(): void {
    this.wanted = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setConn("disconnected");
  }

  private open(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      // Invalid URL or ws:// blocked on an https page: retrying cannot help.
      this.wanted = false;
      this.setConn("disconnected");
      return;
    }
    this.ws = ws;
    let openTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      openTimer = null;
      if (this.ws === ws) ws.close();
    }, OPEN_TIMEOUT_MS);
    const clearOpenTimer = () => {
      if (openTimer !== null) clearTimeout(openTimer);
      openTimer = null;
    };
    // Events from a socket that has been replaced or stopped never touch the state.
    ws.onopen = () => {
      clearOpenTimer();
      if (this.ws !== ws) return;
      this.retries = 0;
      this.setConn("connected");
    };
    ws.onclose = () => {
      clearOpenTimer();
      if (this.ws !== ws) return;
      this.ws = null;
      this.setConn("disconnected");
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const reading = typeof ev.data === "string" ? parseReading(ev.data) : null;
      if (reading) this.sample = { ...reading, t: performance.now() };
    };
  }

  private scheduleRetry(): void {
    if (!this.wanted || this.retryTimer !== null) return;
    const wait = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted && !this.ws) this.open();
    }, wait);
  }

  private setConn(c: ConnectionState): void {
    // Packets from before a drop are never read after it: start every link state with no sample.
    if (c !== "connected") this.sample = null;
    this.conn = c;
    for (const l of this.listeners) l();
  }
}
