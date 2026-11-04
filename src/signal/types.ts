/**
 * ข้อมูลที่เกมต้องใช้จากอุปกรณ์: สองค่าหลักตาม brief + ค่าคุณภาพสัญญาณที่ไม่บังคับ
 * nasalPercent = ค่าประมาณจากสัญญาณอุปกรณ์ ไม่ใช่เปอร์เซ็นต์การไหลของอากาศ
 * oralPercent = 100 - nasalPercent เป็นค่าคำนวณเพื่อแสดงผล ไม่ใช่การวัดอีกช่อง
 * ช่องเสียง: ไมค์บน (เหนือแผ่นกั้น) = จมูก, ไมค์ล่าง = ปาก — รูปแบบข้อความดู docs/DEVICE_PROTOCOL.md
 */
export interface DeviceReading {
  nasalPercent: number;
  speechDetected: boolean;
  /**
   * ระดับเสียงช่องจมูก (ไมค์บน) เป็น dBFS ในหน้าต่างเดียวกับ nasalPercent — ไม่บังคับ
   * -Infinity = ช่องเงียบสนิทแบบดิจิทัล (มักแปลว่าไมค์หลุด)
   */
  nasalDb?: number;
  /** ระดับเสียงช่องปาก (ไมค์ล่าง) เป็น dBFS — ไม่บังคับ */
  oralDb?: number;
  /** มีตัวอย่างเสียงชนค่าสูงสุดของ ADC ในหน้าต่างนี้ (สัญญาณล้น) — ไม่บังคับ */
  clip?: boolean;
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
