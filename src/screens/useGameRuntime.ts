import { useCallback, useRef, useState } from "react";
import { useFrameRender, useGameLoop, useOnHidden } from "../lib/hooks";
import { recordRenderDelay } from "../signal/latency";
import { mockSource } from "../signal/mock";
import { SignalProcessor, type SignalFrame } from "../signal/SignalProcessor";

export const IDLE_FRAME: SignalFrame = {
  status: "silent",
  valid: true,
  speaking: false,
  nasalRaw: null,
  nasal: null,
  oral: null,
  sampleT: null,
};

export type PauseReason = "user" | "hidden";

interface Interruptible {
  interrupt(): void;
}

/**
 * Shared runtime for the game screens:
 * - one rAF loop; stops while paused or after the round ends (so nothing is scored then)
 * - pausing interrupts the game (open speech segment is dropped, never scored)
 * - the tab becoming hidden auto-pauses
 * - restart builds a fresh game object (no listeners are re-attached)
 */
export function useGameRuntime<G extends Interruptible>(
  create: () => G,
  onFrame: (game: G, frame: SignalFrame, now: number, dtMs: number) => boolean | void,
) {
  const createRef = useRef(create);
  createRef.current = create;
  const gameRef = useRef<G | null>(null);
  if (gameRef.current === null) gameRef.current = create();
  const processorRef = useRef(new SignalProcessor());
  const frameRef = useRef<SignalFrame>(IDLE_FRAME);
  const [paused, setPaused] = useState<PauseReason | null>(null);
  const [ended, setEnded] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const render = useFrameRender();

  useGameLoop((now, dt) => {
    const frame = processorRef.current.step(mockSource.latest(), mockSource.connection(), now);
    frameRef.current = frame;
    if (frame.valid && frame.sampleT !== null) recordRenderDelay(now - frame.sampleT);
    const done = onFrame(gameRef.current as G, frame, now, dt);
    if (done) setEnded(true);
    render();
  }, paused === null && !ended);

  const pause = useCallback((reason: PauseReason = "user") => {
    gameRef.current?.interrupt();
    processorRef.current.reset();
    setPaused((p) => p ?? reason);
  }, []);

  useOnHidden(() => {
    if (!ended) pause("hidden");
  });

  const resume = useCallback(() => setPaused(null), []);

  const restart = useCallback(() => {
    gameRef.current = createRef.current();
    processorRef.current.reset();
    frameRef.current = IDLE_FRAME;
    setEnded(false);
    setPaused(null);
    setRoundKey((k) => k + 1);
  }, []);

  const end = useCallback(() => {
    gameRef.current?.interrupt();
    setEnded(true);
  }, []);

  return {
    game: gameRef.current as G,
    frame: frameRef.current,
    paused,
    ended,
    roundKey,
    pause,
    resume,
    restart,
    end,
  };
}
