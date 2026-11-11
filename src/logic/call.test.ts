import { describe, expect, it } from "vitest";
import { CALL_WORDS, orderFrom } from "../data/callWords";
import { MOCK_DEFAULTS, mockReading, type MicChannels, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { ConnectionState, DeviceReading } from "../signal/types";
import { parseReading } from "../signal/WebSocketSignalSource";
import { CallGame, wordSummary, type CallEvent } from "./call";

interface Phase {
  ms: number;
  speech: boolean;
  /** Nasal % the device reports while speaking (default 25 = an oral-sounding call). */
  nasal?: number;
  level?: VoiceLevel;
  channels?: MicChannels;
  conn?: ConnectionState;
  /** Device without level fields: quality cannot be judged. */
  noLevels?: boolean;
  /** Device stops sending (stuck): the last sample is kept and ages out. */
  freeze?: boolean;
}

/** Drive the call game at 60 fps through a script of device phases (levels come from the demo device model). */
function run(game: CallGame, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: CallEvent[] = [];
  let sample: (DeviceReading & { t: number }) | null = null;
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const conn = p.conn ?? "connected";
      if (conn !== "connected") sample = null;
      else if (!p.freeze) {
        const r = mockReading({ ...MOCK_DEFAULTS, level: p.level ?? "normal", channels: p.channels ?? "both" }, 100 - (p.nasal ?? 25), p.speech);
        sample = p.noLevels ? { nasalPercent: r.nasalPercent, speechDetected: r.speechDetected, t } : { ...r, t };
      }
      events.push(...game.update(proc.step(sample, conn, t), t, dt));
    }
  }
  return { events, t };
}

const call = (ms = 500, extra: Partial<Phase> = {}): Phase => ({ ms, speech: true, ...extra });
const hush = (ms = 400, extra: Partial<Phase> = {}): Phase => ({ ms, speech: false, ...extra });
const make = () => new CallGame(CALL_WORDS);

describe("CallGame: detection is separate from judging the word", () => {
  it("a usable call makes the friend hear: one star, one usable attempt", () => {
    const g = make();
    const { events } = run(g, [hush(), call(), hush()]);
    expect(events).toContainEqual(expect.objectContaining({ type: "heard", index: 0, first: true }));
    expect(g.state.phase).toBe("heard");
    expect(g.state.stars).toBe(1);
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 1, heard: true });
  });

  it("answers any usable call whatever its nasal value — no 'lower nasal is better' rule", () => {
    const g = make();
    run(g, [hush(), call(500, { nasal: 70 }), hush()]); // ปู said with high nasal %: still heard
    expect(g.state.words[0].heard).toBe(true);
    g.next();
    run(g, [hush(), call(500, { nasal: 55 }), hush()], 5_000); // หมา: nasal word, nasal value expected
    expect(g.state.words[1].heard).toBe(true);
    expect(g.state.words[0].nasalSum).toBeCloseTo(70, 0);
    expect(g.state.words[1].nasalSum).toBeCloseTo(55, 0);
  });

  it("one long hold is one attempt", () => {
    const g = make();
    run(g, [hush(), call(3000), hush()]);
    expect(g.state.words[0].attempts).toBe(1);
  });

  it("silence is not an attempt; after a while it only nudges gently", () => {
    const g = make();
    const { events } = run(g, [hush(9000)]);
    expect(g.state.words[0].attempts).toBe(0);
    expect(events.filter((e) => e.type === "nudge")).toHaveLength(1);
    expect(g.state.stars).toBe(0);
  });

  it("a blip shorter than an attempt is ignored", () => {
    const g = make();
    run(g, [hush(), call(80), hush()]);
    expect(g.state.words[0].attempts).toBe(0);
  });
});

describe("CallGame: example audio never scores", () => {
  it("speech picked up while the example plays (and its echo) is ignored; listening restarts after silence", () => {
    const g = make();
    run(g, [hush(200)]);
    g.listenStart("model");
    const a = run(g, [call(900)], 200); // the speaker leaks into the mics
    g.listenEnd(a.t);
    const b = run(g, [call(600)], a.t); // still voiced after the example ended: not the child's turn yet
    expect(g.state.words[0].attempts).toBe(0);
    expect(g.state.words[0].listens).toBe(1);
    run(g, [hush(300), call(500), hush()], b.t);
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 1, heard: true });
  });

  it("the friend's spoken reply is ignored too and does not add a listen", () => {
    const g = make();
    const a = run(g, [hush(), call(), hush()]);
    g.listenStart("reply");
    const b = run(g, [call(800)], a.t);
    g.listenEnd(b.t);
    run(g, [call(300), hush(600)], b.t);
    expect(g.state.words[0]).toMatchObject({ attempts: 1, listens: 0 });
    expect(g.state.phase).toBe("heard");
  });
});

describe("CallGame: bad signal asks to try again, nothing is taken away", () => {
  it("too quiet: retry message, counted as unusable, no star — the next normal call is heard", () => {
    const g = make();
    const { events, t } = run(g, [hush(), call(500, { level: "quiet" }), hush()]);
    expect(events).toContainEqual({ type: "retry", index: 0, issue: "quiet" });
    expect(g.state.issue).toBe("quiet");
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 0, heard: false });
    expect(g.state.words[0].issues.quiet).toBe(1);
    run(g, [call(), hush()], t);
    expect(g.state.words[0]).toMatchObject({ attempts: 2, usable: 1, heard: true });
    expect(g.state.stars).toBe(1);
  });

  it("clipping: counted as 'loud', not usable", () => {
    const g = make();
    run(g, [hush(), call(500, { level: "loud" }), hush()]);
    expect(g.state.issue).toBe("loud");
    expect(g.state.words[0].usable).toBe(0);
  });

  it("device drops mid-call: a signal problem (lost), never a heard call; a fresh call after reconnect counts", () => {
    const g = make();
    const { events, t } = run(g, [hush(), call(400), { ms: 600, speech: true, conn: "disconnected" }]);
    expect(events).toContainEqual({ type: "retry", index: 0, issue: "lost" });
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 0, heard: false });
    // Reconnected while the child is still talking: that tail is not counted; listening restarts after silence.
    run(g, [call(500), hush(300), call(500), hush()], t);
    expect(g.state.words[0]).toMatchObject({ attempts: 2, usable: 1, heard: true });
  });

  it("a dead mic channel stops the frame before the game (no 0 % / 100 % values reach it)", () => {
    const p = new SignalProcessor();
    const r = mockReading({ ...MOCK_DEFAULTS, channels: "nasal-missing" }, 80, true);
    expect(r.nasalPercent).toBe(0);
    const f = p.step({ ...r, t: 0 }, "connected", 0);
    expect(f.status).toBe("channel");
    expect(f.valid).toBe(false);
    expect(f.nasal).toBeNull();
    const g = make();
    run(g, [hush(), call(600, { channels: "oral-missing" }), hush()]);
    expect(g.state.words[0].attempts).toBe(0);
  });

  it("a stuck device (stale data mid-call) is a signal problem, never a heard call", () => {
    const g = make();
    const { events, t } = run(g, [hush(), call(300), { ms: 800, speech: true, freeze: true }]);
    expect(events.some((e) => e.type === "heard")).toBe(false);
    expect(events).toContainEqual({ type: "retry", index: 0, issue: "lost" });
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 0, heard: false });
    // fresh data again: listening resumes only after silence, then a real call counts
    run(g, [hush(300), call(500), hush()], t);
    expect(g.state.words[0]).toMatchObject({ attempts: 2, usable: 1, heard: true });
  });

  it("a device without level fields is judged on detection only", () => {
    const g = make();
    run(g, [hush(200, { noLevels: true }), call(500, { noLevels: true }), hush(400, { noLevels: true })]);
    expect(g.state.words[0]).toMatchObject({ usable: 1, heard: true });
  });
});

describe("CallGame: child controls", () => {
  it("pausing drops the open attempt instead of scoring it", () => {
    const g = make();
    const { t } = run(g, [hush(), call(500)]);
    g.interrupt();
    run(g, [call(300), hush(600)], t);
    expect(g.state.words[0].attempts).toBe(0);
  });

  it("skip moves on without penalty; finishing every word ends the round", () => {
    const g = make();
    run(g, [hush(), call(), hush()]);
    g.next();
    const ends: CallEvent[] = [];
    for (let i = 1; i < CALL_WORDS.length; i++) ends.push(...g.skip());
    expect(ends.at(-1)).toEqual({ type: "done" });
    expect(g.state.phase).toBe("done");
    expect(g.state.stars).toBe(1);
    expect(g.state.words.filter((w) => w.skipped)).toHaveLength(CALL_WORDS.length - 1);
    expect(g.state.words[0].skipped).toBe(false);
  });

  it("next is only possible after the friend has heard", () => {
    const g = make();
    expect(g.next()).toEqual([]);
    expect(g.state.index).toBe(0);
  });
});

describe("The child's choice of who to visit first", () => {
  it("puts the chosen friend first and keeps every word exactly once", () => {
    expect(orderFrom(CALL_WORDS, "turtle").map((w) => w.id)).toEqual(["turtle", "crab", "dog", "fish", "bird"]);
    expect(orderFrom(CALL_WORDS, "crab").map((w) => w.id)).toEqual(CALL_WORDS.map((w) => w.id));
    expect(orderFrom(CALL_WORDS, null)).toBe(CALL_WORDS);
  });

  it("a different order keeps word, picture id and stats together (no swapping)", () => {
    const g = new CallGame(orderFrom(CALL_WORDS, "turtle"));
    const a = run(g, [hush(), call(500, { nasal: 30 }), hush()]); // turtle heard
    g.next();
    g.skip(); // crab skipped
    run(g, [hush(), call(500, { nasal: 60 }), hush()], a.t + 1_000); // dog heard
    const sum = g.state.words.map(wordSummary);
    expect(sum.map((w) => w.id)).toEqual(["turtle", "crab", "dog", "fish", "bird"]);
    expect(sum[0]).toMatchObject({ id: "turtle", word: "เต่า", resonance: "oral", heard: true, usable: 1, meanNasal: 30 });
    expect(sum[1]).toMatchObject({ id: "crab", word: "ปู", skipped: true, attempts: 0, heard: false });
    expect(sum[2]).toMatchObject({ id: "dog", word: "หมา", resonance: "nasal", heard: true, meanNasal: 60 });
    expect(g.state.stars).toBe(2);
  });

  it("picking who is next moves only waiting friends; stats stay with their word", () => {
    const g = make(); // crab, dog, fish, bird, turtle
    const a = run(g, [hush(), call(500, { nasal: 28 }), hush()]); // crab heard
    expect(g.chooseNext("crab")).toBe(false); // already met: not a choice
    expect(g.chooseNext("bird")).toBe(true);
    g.next();
    expect(g.current?.id).toBe("bird");
    expect(g.state.words.map((w) => w.id)).toEqual(["crab", "bird", "dog", "fish", "turtle"]);
    expect(g.words.map((w) => w.id)).toEqual(g.state.words.map((w) => w.id));
    run(g, [hush(), call(500, { nasal: 55 }), hush()], a.t + 1_000); // bird heard
    const sum = g.state.words.map(wordSummary);
    expect(sum[0]).toMatchObject({ id: "crab", word: "ปู", heard: true, meanNasal: 28 });
    expect(sum[1]).toMatchObject({ id: "bird", word: "นก", resonance: "nasal", heard: true, meanNasal: 55 });
    expect(sum.slice(2).every((w) => w.attempts === 0 && !w.heard)).toBe(true);
  });

  it("playing again with another first friend starts a clean round", () => {
    const first = new CallGame(orderFrom(CALL_WORDS, "fish"));
    run(first, [hush(), call(), hush()]);
    const again = new CallGame(orderFrom(CALL_WORDS, "bird"));
    expect(again.state.words[0]).toMatchObject({ id: "bird", attempts: 0, heard: false });
    expect(again.state.words.find((w) => w.id === "fish")).toMatchObject({ attempts: 0, heard: false });
    expect(first.state.words[0]).toMatchObject({ id: "fish", heard: true });
  });
});

describe("Device message parsing (ESP32 → web)", () => {
  it("reads the optional level and clip fields", () => {
    expect(parseReading('{"nasalPercent":31.5,"speechDetected":true,"nasalDb":-30.2,"oralDb":-22,"clip":false}')).toEqual({
      nasalPercent: 31.5,
      speechDetected: true,
      nasalDb: -30.2,
      oralDb: -22,
      clip: false,
    });
    expect(parseReading("12.5,1,-40,-25,1")).toEqual({ nasalPercent: 12.5, speechDetected: true, nasalDb: -40, oralDb: -25, clip: true });
  });

  it("null / -inf means a silent (dead) channel; a single level field is ignored", () => {
    expect(parseReading('{"nasalPercent":0,"speechDetected":true,"nasalDb":null,"oralDb":-20}')?.nasalDb).toBe(-Infinity);
    expect(parseReading('{"nasalPercent":20,"speechDetected":true,"nasalDb":-30}')).toEqual({ nasalPercent: 20, speechDetected: true });
    expect(parseReading("20,1")).toEqual({ nasalPercent: 20, speechDetected: true });
  });
});

describe("CallGame: re-arm guard after a vibration", () => {
  it("after a buzz the mics stay closed until the guard ends, then listening waits for silence (the buzz never becomes an attempt)", () => {
    const g = make();
    const a = run(g, [hush(), call(), hush()]);
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 1 });
    // the screen buzzed right after the attempt closed: hold the mics for the pattern + guard
    g.holdUntil(a.t + 268);
    // the motor's rattle reaches the mics during the hold and runs on past it: not the child, not even a retry
    const b = run(g, [call(600)], a.t);
    expect(b.events.filter((e) => e.type === "heard" || e.type === "retry")).toEqual([]);
    expect(g.state.words[0].attempts).toBe(1);
    expect(g.state.armed).toBe(false);
    // a silent frame re-arms; the next real call counts again
    run(g, [hush(300), call(), hush()], b.t);
    expect(g.state.words[0]).toMatchObject({ attempts: 2, usable: 2 });
  });

  it("a hold changes nothing when no vibration played (the game behaves exactly as before)", () => {
    const g = make();
    g.holdUntil(-1);
    run(g, [hush(), call(), hush()]);
    expect(g.state.words[0]).toMatchObject({ attempts: 1, usable: 1, heard: true });
  });
});

