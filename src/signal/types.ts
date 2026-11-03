/**
 * ข้อมูลที่เกมต้องใช้จากอุปกรณ์มีเพียงสองค่านี้ (ตาม brief)
 * nasalPercent = ค่าประมาณจากสัญญาณอุปกรณ์ ไม่ใช่เปอร์เซ็นต์การไหลของอากาศ
 * oralPercent = 100 - nasalPercent เป็นค่าคำนวณเพื่อแสดงผล ไม่ใช่การวัดอีกช่อง
 */
export interface DeviceReading {
  nasalPercent: number;
  speechDetected: boolean;
}

/** Reading plus receipt time (performance.now()) so the game can detect stale data. */
export interface SignalSample extends DeviceReading {
  t: number;
}

export type ConnectionState = "connected" | "connecting" | "disconnected";

/**
 * Transport-agnostic source. Game logic only reads `latest()` + `connection()`,
 * so a WebSocket or Web Serial source can replace the mock without touching games.
 */
export interface SignalSource {
  readonly kind: "mock" | "websocket" | "serial";
  latest(): SignalSample | null;
  connection(): ConnectionState;
  /** Notified on connection/parameter changes (not on every sample). */
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
}
