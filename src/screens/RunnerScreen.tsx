import { useRef, useState } from "react";
import { Bunny, CloudPal, Obstacle, StarShape, Tree } from "../components/Art";
import { DemoPanel } from "../components/DemoPanel";
import { DoneSheet, GameHud, PauseOverlay, PromptCard } from "../components/GameParts";
import { Icon } from "../components/Icon";
import { Meter } from "../components/Meter";
import { StageNote } from "../components/StageNote";
import { signalProblem, type MeterStatus } from "../signal/status";
import type { SignalFrame } from "../signal/SignalProcessor";
import { showToast } from "../lib/toast";
import { COLLECTIBLES, outfitFor, totalStars } from "../data/analytics";
import { fmtPct } from "../data/format";
import { promptFor, promptInstruction } from "../data/plan";
import { finishRound, setPendingRunner } from "../data/rounds";
import { LEVEL_LABEL } from "../data/schema";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { RUNNER_ATTEMPTS_PER_ROUND, RunnerGame, type RunnerAttempt, type RunnerState } from "../logic/runner";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { useGameRuntime } from "./useGameRuntime";

const DECOR: { kind: "tree" | "rock" | "bush" | "log"; x: number; y0: number }[] = [
  { kind: "tree", x: 7, y0: 0.05 },
  { kind: "tree", x: 93, y0: 0.42 },
  { kind: "tree", x: 6, y0: 0.72 },
  { kind: "tree", x: 94, y0: 0.98 },
  { kind: "rock", x: 27, y0: 0.18 },
  { kind: "bush", x: 73, y0: 0.6 },
  { kind: "log", x: 27, y0: 0.9 },
];

interface Flash {
  attempt: RunnerAttempt;
  index: number;
  at: number;
}

const FLASH_MS = 1800;

const gapLabelFor = (gap: number) => (gap >= 0.66 ? "ไกล" : gap >= 0.33 ? "กลาง" : "ใกล้");

/** The original 2D scene, kept as the fallback when 3D is unavailable or switched off. */
function Runner2D({ s, frame, reduced, capOn }: { s: RunnerState; frame: SignalFrame; reduced: boolean; capOn: boolean }) {
  const chaserCenter = 57 + s.gap * 29;
  const scrollPx = reduced ? 0 : s.scroll * 220;
  return (
    <div className="stage2d" style={{ ["--scroll" as string]: `${scrollPx % 40}px`, ["--bob" as string]: `${0.55 / Math.max(0.5, s.speed)}s` }}>
      <div className="runner__path" aria-hidden="true">
        <span className="runner__lane runner__lane--a" />
        <span className="runner__lane runner__lane--b" />
      </div>
      {DECOR.map((d, i) => {
        const y = ((d.y0 * 100 + (reduced ? 0 : s.scroll * 55)) % 120) - 10;
        return (
          <div key={i} className="runner__decor" style={{ left: `${d.x}%`, top: `${y}%` }} aria-hidden="true">
            {d.kind === "tree" ? <Tree size={38} /> : <Obstacle kind={d.kind} />}
          </div>
        );
      })}
      <div className="runner__stars" aria-hidden="true">
        <StarShape size={26} />
        <StarShape size={22} />
      </div>
      <div className={`runner__hero${frame.valid && s.speed > 0.2 ? " is-running" : ""}`} aria-hidden="true">
        <Bunny size={54} cap={capOn} />
      </div>
      <div className="runner__gap" style={{ top: "50%", height: `${Math.max(0, chaserCenter - 9 - 50)}%` }} aria-hidden="true" />
      <span className="runner__gaplabel" style={{ top: `${(50 + chaserCenter - 9) / 2}%` }}>
        ห่างเพื่อนเมฆ: {gapLabelFor(s.gap)}
      </span>
      <div className={`runner__chaser${frame.valid ? " is-floating" : ""}`} style={{ top: `${chaserCenter}%` }} aria-hidden="true">
        <CloudPal size={66} />
      </div>
    </div>
  );
}

export function RunnerScreen() {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const startedAt = useRef(new Date().toISOString());
  const [flash, setFlash] = useState<Flash | null>(null);
  const nowRef = useRef(0);

  const rt = useGameRuntime(
    () =>
      new RunnerGame({
        oralThreshold: plan.oralThreshold,
        prompts: plan.words.map((w) => promptFor(w, plan.level)),
        attemptsPerRound: RUNNER_ATTEMPTS_PER_ROUND,
      }),
    (game, frame, now, dt) => {
      nowRef.current = now;
      let done = false;
      for (const ev of game.update(frame, now, dt)) {
        if (ev.type === "attempt") setFlash({ attempt: ev.attempt, index: game.state.attempts.length, at: now });
        if (ev.type === "done") done = true;
      }
      return done;
    },
  );

  const { game, frame } = rt;
  const s = game.state;
  const thr = game.cfg.oralThreshold;
  const flashOn = flash !== null && nowRef.current - flash.at < FLASH_MS;
  const stars = totalStars(db, child);
  const capOn = stars >= COLLECTIBLES[0].stars;

  let status: MeterStatus = signalProblem(frame) ?? { kind: "idle", text: "พร้อมแล้ว พูดคำบนจอได้เลย" };
  if (!signalProblem(frame)) {
    if (s.speaking) {
      status = s.passing
        ? { kind: "pass", text: "ผ่านเกณฑ์: กระต่ายวิ่งเร็วขึ้น เพื่อนเมฆตามไม่ทัน" }
        : { kind: "try", text: "อีกนิด! ลองให้เสียงออกทางปากมากขึ้น" };
    } else if (flashOn && flash) {
      status = flash.attempt.passed
        ? { kind: "done", text: `ครั้งที่ ${flash.index}: ผ่านเกณฑ์ +1 ดาว` }
        : { kind: "try", text: `ครั้งที่ ${flash.index}: ออกปากเฉลี่ย ${fmtPct(100 - flash.attempt.meanNasal)} · ไปคำต่อไปกัน` };
    }
  }
  if (rt.ended) status = { kind: "done", text: "วิ่งครบรอบแล้ว! เกมหยุดนับแล้ว" };

  const goGateOrResult = () => {
    const st = game.state;
    if (plan.gateEnabled) {
      setPendingRunner({
        childId: child.id,
        startedAt: startedAt.current,
        attempts: st.attempts.map(({ meanNasal, passed, durationMs }) => ({ meanNasal, passed, durationMs })),
        stars: st.stars,
        practiceMs: st.practiceMs,
        completed: st.done,
      });
      navigate("gate");
      return;
    }
    finishRound({
      child,
      game: "runner",
      startedAt: startedAt.current,
      practiceMs: st.practiceMs,
      attempts: st.attempts,
      stars: st.stars,
      gate: null,
      endedEarly: !st.done,
    });
    navigate("result");
  };

  const finishEarly = () => {
    const st = game.state;
    if (st.attempts.length === 0) {
      showToast("ยังไม่มีการพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      navigate("home");
      return;
    }
    finishRound({
      child,
      game: "runner",
      startedAt: startedAt.current,
      practiceMs: st.practiceMs,
      attempts: st.attempts,
      stars: st.stars,
      gate: null,
      endedEarly: true,
    });
    navigate("result");
  };

  const passedCount = s.attempts.filter((a) => a.passed).length;
  const word = game.currentPrompt();
  const is3d = mode.kind === "3d";

  return (
    <div className="kid-screen kid-screen--game">
      <div className="kid-frame" inert={rt.paused !== null || rt.ended ? true : undefined}>
        <GameHud title="วิ่งหนี" sub={`ด่านที่ ${plan.level} · ${LEVEL_LABEL[plan.level]}`} stars={s.stars} onPause={() => rt.pause("user")} />
        <PromptCard
          label={promptInstruction("runner", plan.level)}
          word={word}
          sub={`คำที่ ${Math.min(s.attempts.length + 1, game.cfg.attemptsPerRound)} จาก ${game.cfg.attemptsPerRound}`}
        />
        <div className={`stage stage--runner${is3d ? " stage--3d" : ""}${frame.valid ? "" : " is-frozen"}${s.passing ? " is-passing" : ""}`}>
          {is3d ? (
            <World3D
              kind="runner"
              tier={mode.tier}
              active={rt.paused === null}
              reduced={reduced}
              gameRef={rt.gameRef}
              frameRef={rt.frameRef}
              outfit={outfitFor(stars)}
            />
          ) : (
            <Runner2D s={s} frame={frame} reduced={reduced} capOn={capOn} />
          )}
          {is3d ? (
            <span className={`pill stage__pill stage__pill--tl runner__distpill runner__distpill--${gapLabelFor(s.gap) === "ใกล้" ? "near" : "ok"}`}>
              <span className="runner__distswatch" aria-hidden="true" />
              ห่างเพื่อนเมฆ: {gapLabelFor(s.gap)}
            </span>
          ) : null}
          <span className="pill stage__pill stage__pill--tr">
            {frame.valid ? `ความเร็ว ×${Math.max(0.6, s.speed).toFixed(1)}` : "หยุดชั่วคราว"}
          </span>
          {flashOn && flash?.attempt.passed ? (
            <span key={flash.at} className="stage__pop" aria-hidden="true">
              +1 <StarShape size={18} />
            </span>
          ) : null}
          {!frame.valid ? (
            <div className="stage__frozen">
              <Icon name="alert" size={18} /> หยุดไว้ก่อน · ไม่นับคะแนนจนกว่าสัญญาณจะกลับมา
            </div>
          ) : null}
        </div>
        <StageNote mode={mode} />
        <Meter primary="oral" frame={frame} threshold={thr} thresholdLabel={`เกณฑ์ ${thr}%`} status={status} />
      </div>

      <DemoPanel target={{ kind: "oral", threshold: thr }} hint="เปิด “มีเสียง” หรือกดค้างเพื่อพูด แล้วลากแถบเพื่อดูกระต่ายวิ่ง">
        <button type="button" className="link-btn" onClick={goGateOrResult}>
          ข้ามไป{plan.gateEnabled ? "ด่านประตู" : "สรุปรอบ"} (เดโม) →
        </button>
      </DemoPanel>

      {rt.paused !== null ? (
        <PauseOverlay
          reason={rt.paused}
          onResume={rt.resume}
          onRestart={() => {
            startedAt.current = new Date().toISOString();
            setFlash(null);
            rt.restart();
          }}
          onFinish={finishEarly}
          onHome={() => navigate("home")}
        />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <DoneSheet
          title={plan.gateEnabled ? "วิ่งถึงประตูแล้ว!" : "วิ่งครบรอบแล้ว!"}
          text={`ผ่านเกณฑ์ออกปาก ${passedCount} จาก ${s.attempts.length} ครั้ง${plan.gateEnabled ? " · ต่อไปเป็นด่านประตูเสียงนาสิก" : ""}`}
          action={plan.gateEnabled ? "ไปด่านประตู" : "ดูสรุปรอบ"}
          onAction={goGateOrResult}
        />
      ) : null}
    </div>
  );
}
