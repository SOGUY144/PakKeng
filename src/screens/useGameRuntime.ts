import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { haptics } from "../lib/haptics";
import { useFrameRender, useGameLoop, useOnHidden } from "../lib/hooks";
import { recordRenderDelay } from "../signal/latency";
import { signalSource } from "../signal/mock";
import { UNKNOWN_QUALITY } from "../signal/quality";
import { SignalProcessor, type SignalFrame } from "../signal/SignalProcessor";

export const IDLE_FRAME: SignalFrame = {
  status: "silent",
  valid: true,
  speaking: false,
  nasalRaw: null,
  nasal: null,
  oral: null,
  quality: UNKNOWN_QUALITY,
  sampleT: null,
};

export type PauseReason = "user" | "hidden";

let rounds = 0;
/** A token unique to one round in this visit (haptic event keys: the same event never buzzes twice, a new round does). */
function nextRoundToken(): string {
  rounds += 1;
  return `${Date.now().toString(36)}-${rounds}`;
}

interface Interruptible {
  interrupt(): void;
}

/**
 * Shared runtime for the game screens:
 * - one rAF loop; stops while paused or after the round ends (so nothing is scored then)
 * - pausing interrupts the game (open speech segment is dropped, never scored)
 * - the tab becoming hidden auto-pauses
 * - restart builds a fresh game object (no listeners are re-attached)
 * - pause, restart and leaving the screen cancel a vibration that may still be running
 */
export function useGameRuntime<G extends Interruptible>(
  create: () => G,
  /** `round` = this round's token (the round part of haptic event keys). */
  onFrame: (game: G, frame: SignalFrame, now: number, dtMs: number, round: string) => boolean | void,
) {
  const createRef = useRef(create);
  createRef.current = create;
  const gameRef = useRef<G | null>(null);
  if (gameRef.current === null) gameRef.current = create();
  const processorRef = useRef(new SignalProcessor());
  const tokenRef = useRef<string | null>(null);
  if (tokenRef.current === null) tokenRef.current = nextRoundToken();
  const frameRef = useRef<SignalFrame>(IDLE_FRAME);
  const [paused, setPaused] = useState<PauseReason | null>(null);
  const [ended, setEnded] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const render = useFrameRender();

  useGameLoop((now, dt) => {
    const src = signalSource();
    const frame = processorRef.current.step(src.latest(), src.connection(), now);
    frameRef.current = frame;
    if (frame.valid && frame.sampleT !== null) recordRenderDelay(now - frame.sampleT);
    const done = onFrame(gameRef.current as G, frame, now, dt, tokenRef.current as string);
    if (done) setEnded(true);
    render();
  }, paused === null && !ended);

  const pause = useCallback((reason: PauseReason = "user") => {
    haptics.cancel();
    gameRef.current?.interrupt();
    processorRef.current.reset();
    setPaused((p) => p ?? reason);
  }, []);

  useOnHidden(() => {
    if (!ended) pause("hidden");
  });

  const resume = useCallback(() => setPaused(null), []);

  const restart = useCallback(() => {
    haptics.cancel();
    gameRef.current = createRef.current();
    tokenRef.current = nextRoundToken();
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

  // leaving the screen (navigation, unmount): no pattern keeps running
  useEffect(() => () => haptics.cancel(), []);

  // dev builds only: QA reads the live game state next to the screenshot (the scene must follow this, never the reverse)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __pakkengGame?: RefObject<G | null> };
    w.__pakkengGame = gameRef;
    return () => {
      if (w.__pakkengGame === gameRef) delete w.__pakkengGame;
    };
  }, []);

  return {
    game: gameRef.current as G,
    frame: frameRef.current,
    /** Stable refs for the 3D scene, which reads the live state every animation frame. */
    gameRef,
    frameRef,
    paused,
    ended,
    roundKey,
    pause,
    resume,
    restart,
    end,
  };
}
