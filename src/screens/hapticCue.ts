import { haptics } from "../lib/haptics";
import { isPlaying } from "../lib/speech";
import type { Cue } from "../logic/hapticCues";
import type { SignalFrame } from "../signal/SignalProcessor";

/**
 * Buzz for a game cue (optional vibration) right after the voice segment closed, then keep the game's mics closed
 * until the pattern and its guard are over (`hold`), after which listening waits for a silent frame (re-arm).
 * Both happen in the same frame, so no signal is processed while the motor runs. With vibration off, unsupported or
 * refused, nothing changes in the game. `collecting` = an attempt is being collected right now (never buzz then).
 */
export function playCue(cue: Cue | null, frame: SignalFrame, hold: (until: number) => void, collecting = false): boolean {
  if (!cue) return false;
  const r = haptics.buzz(cue.kind, {
    key: cue.key,
    listening: collecting,
    playing: isPlaying(),
    signal: { valid: frame.valid, clipping: frame.quality.clip },
  });
  if (r.fired) hold(r.holdUntil);
  return r.fired;
}

/** A tap on a choice (route, door, team, friend, trip, game card): 10 ms, only outside a listening turn. */
export function tapCue(listening = false): void {
  haptics.buzz("tap", { listening, playing: isPlaying() });
}
