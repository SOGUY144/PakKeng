import { useSyncExternalStore } from "react";
import { MockSignalSource, type MockParams } from "./MockSignalSource";
import type { ConnectionState, SignalSource } from "./types";
import { WebSocketSignalSource } from "./WebSocketSignalSource";

/**
 * แหล่งสัญญาณของทั้งแอป: ค่าเริ่มต้นคือโหมดสาธิต (สัญญาณจำลอง)
 * เกมอ่านผ่าน signalSource() เท่านั้น จึงสลับไปใช้ ESP32 ได้โดยไม่แก้ตรรกะเกม
 */
export const mockSource = new MockSignalSource();

if (typeof window !== "undefined") mockSource.start();

let active: SignalSource = mockSource;
const sourceListeners = new Set<() => void>();

export function signalSource(): SignalSource {
  return active;
}

function setActive(next: SignalSource): void {
  if (next === active) return;
  if (active !== mockSource) active.stop();
  active = next;
  if (next !== mockSource) next.start();
  for (const l of sourceListeners) l();
}

// Dev hot reload replaces this module: close the old device link, or it keeps reconnecting and holds one of the
// board's few WebSocket slots.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (active !== mockSource) active.stop();
  });
}

/** Switch to a real device over WebSocket (e.g. ws://192.168.4.1:81). */
export function connectDevice(url: string): void {
  setActive(new WebSocketSignalSource(url));
}

/** Back to the labelled demo mode. */
export function switchToDemo(): void {
  setActive(mockSource);
}

function subscribeSource(cb: () => void): () => void {
  sourceListeners.add(cb);
  return () => {
    sourceListeners.delete(cb);
  };
}

/** The active source; components re-render when it is switched. */
export function useSignalSource(): SignalSource {
  return useSyncExternalStore(subscribeSource, signalSource, signalSource);
}

export function useMockParams(): MockParams {
  return useSyncExternalStore(
    (cb) => mockSource.subscribe(cb),
    () => mockSource.getParams(),
  );
}

/** Connection state of the active source (follows source switches). */
export function useConnection(): ConnectionState {
  const src = useSignalSource();
  return useSyncExternalStore(
    (cb) => src.subscribe(cb),
    () => src.connection(),
  );
}
