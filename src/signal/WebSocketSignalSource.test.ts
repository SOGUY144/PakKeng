import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameQuality } from "./quality";
import { parseReading, WebSocketSignalSource } from "./WebSocketSignalSource";

/** A stand-in for the browser WebSocket: the test opens, closes and sends messages by hand. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  send(data: string) {
    this.onmessage?.({ data });
  }
  /** The link is lost (device reset, Wi-Fi dropped): the browser fires close. */
  drop() {
    this.close();
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const MSG = '{"nasalPercent":31.5,"speechDetected":true,"nasalDb":-30.2,"oralDb":-22.0,"clip":false}';

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parseReading — the exact text the firmware sends", () => {
  it("reads a full message", () => {
    expect(parseReading(MSG)).toEqual({ nasalPercent: 31.5, speechDetected: true, nasalDb: -30.2, oralDb: -22, clip: false });
  });

  it("reads a dead channel as -Infinity", () => {
    const r = parseReading('{"nasalPercent":100.0,"speechDetected":false,"nasalDb":-41.3,"oralDb":null,"clip":false}');
    expect(r?.oralDb).toBe(-Infinity);
    expect(r?.nasalDb).toBe(-41.3);
    expect(r && frameQuality(r).channels).toBe("oral-missing");
  });

  it("the firmware's lowest number (-150 dBFS) also counts as a missing mic", () => {
    const r = parseReading('{"nasalPercent":0.0,"speechDetected":false,"nasalDb":-150.0,"oralDb":-60.2,"clip":false}');
    expect(r && frameQuality(r).channels).toBe("nasal-missing");
  });
});

describe("WebSocketSignalSource", () => {
  it("connects and keeps the latest reading", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    expect(src.connection()).toBe("connecting");
    last().open();
    expect(src.connection()).toBe("connected");
    last().send(MSG);
    expect(src.latest()?.nasalPercent).toBe(31.5);
  });

  it("after a drop: clears the old reading, reports disconnected, and reconnects by itself", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().open();
    last().send(MSG);
    last().drop();
    expect(src.connection()).toBe("disconnected");
    expect(src.latest()).toBeNull();
    expect(FakeSocket.all).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    // still "disconnected" while it retries: the adult keeps seeing the fix tip, no flicker to "connecting"
    expect(src.connection()).toBe("disconnected");
    last().open();
    expect(src.connection()).toBe("connected");
    expect(src.latest()).toBeNull(); // a new message is needed after reconnecting
  });

  it("waits longer after each failed try (1, 2, 4, then every 5 s)", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().drop(); // device is off: the first try fails
    const waits = [1000, 2000, 4000, 5000, 5000];
    for (const wait of waits) {
      const before = FakeSocket.all.length;
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.all).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(before + 1);
      last().drop();
    }
  });

  it("starts the waits over after a good connection", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().drop();
    vi.advanceTimersByTime(1000);
    last().drop();
    vi.advanceTimersByTime(2000);
    last().open();
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it("stop() ends the retries", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().open();
    last().drop();
    src.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(src.connection()).toBe("disconnected");
  });

  it("gives up on a try that has not opened after 4 s (wrong or sleeping address) and tries again", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    vi.advanceTimersByTime(3999);
    expect(src.connection()).toBe("connecting");
    vi.advanceTimersByTime(1);
    expect(last().closed).toBe(true);
    expect(src.connection()).toBe("disconnected");
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    vi.advanceTimersByTime(10_000); // an open link is never cut by the timer
    expect(last().closed).toBe(false);
    expect(src.connection()).toBe("connected");
  });

  it("an error then close retries once", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().open();
    last().onerror?.();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("start() while waiting to retry does not open a second link", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    last().drop();
    src.start();
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("an address the browser refuses (e.g. ws:// on an https page) does not retry", () => {
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          throw new Error("SecurityError");
        }
      },
    );
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    expect(src.connection()).toBe("disconnected");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a late message or close from a socket it has already replaced", () => {
    const src = new WebSocketSignalSource("ws://192.168.4.1:81");
    src.start();
    const first = last();
    first.open();
    first.drop();
    vi.advanceTimersByTime(1000);
    const second = last();
    second.open();
    first.send(MSG); // the old socket must not feed the game
    expect(src.latest()).toBeNull();
    first.onclose?.(); // nor change the link state
    expect(src.connection()).toBe("connected");
  });
});
