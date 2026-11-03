import { useSyncExternalStore } from "react";
import { MockSignalSource, type MockParams } from "./MockSignalSource";
import type { ConnectionState } from "./types";

/**
 * The app-wide signal source. Only the mock exists in this prototype; a real transport would
 * implement the same `SignalSource` interface and be swapped in here.
 */
export const mockSource = new MockSignalSource();

if (typeof window !== "undefined") mockSource.start();

export function useMockParams(): MockParams {
  return useSyncExternalStore(
    (cb) => mockSource.subscribe(cb),
    () => mockSource.getParams(),
  );
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    (cb) => mockSource.subscribe(cb),
    () => mockSource.connection(),
  );
}
