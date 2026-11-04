import { useRef, useState } from "react";
import { Frog, LilyPad } from "../components/Art";
import { DemoPanel } from "../components/DemoPanel";
import { DoneSheet, GameHud, PauseOverlay, PromptCard } from "../components/GameParts";
import { Icon } from "../components/Icon";
import { Meter } from "../components/Meter";
import { StageNote } from "../components/StageNote";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { signalProblem, type MeterStatus } from "../signal/status";
import { showToast } from "../lib/toast";
import { fmtPct } from "../data/format";
import { promptInstruction } from "../data/plan";
import { finishRound } from "../data/rounds";
import { LEVEL_LABEL } from "../data/schema";
import { useActiveChild } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { FROG_STEPS, FrogGame, type FrogState } from "../logic/frog";
import { useGameRuntime } from "./useGameRuntime";

const PAD_X = [50, 30, 64, 36, 62, 32, 66, 42];
const STEP_PX = 62;
const BASE_PX = 26;

interface LastEvent {
  kind: "jump" | "splash";
  at: number;
  meanOral: number;
}

/** The original 2D pond, kept as the fallback when 3D is unavailable or switched off. */
function Frog2D({ s, N, reduced, dunking, splashes }: { s: FrogState; N: number; reduced: boolean; dunking: boolean; splashes: number }) {
  const cam = Math.max(0, s.step - 1) * STEP_PX;
  const frogX = s.step >= N ? 50 : PAD_X[s.step];
  const frogBottom = s.step * STEP_PX + BASE_PX + 10;
  return (
    <div className="stage2d">
      <div className="frog__world" style={{ transform: `translateY(${cam}px)` }}>
        {PAD_X.map((x, i) => (
          <div key={i} className="frog__pad" style={{ left: `${x}%`, bottom: i * STEP_PX + BASE_PX }} aria-hidden="true">
            <LilyPad size={i === s.step + 1 ? 84 : 76} target={i === s.step + 1} />
          </div>
        ))}
        <div className="frog__bank" style={{ bottom: N * STEP_PX + BASE_PX - 6 }}>
          <Icon name="flag" size={18} /> ฝั่งปลายทาง
        </div>
        <div className={`frog__frog${reduced ? " no-motion" : ""}`} style={{ left: `${frogX}%`, bottom: frogBottom }} aria-hidden="true">
          <div key={s.step} className={`frog__inner${s.step > 0 && !reduced ? " is-hopping" : ""}${dunking ? " is-dunk" : ""}${s.inSegment ? " is-crouch" : ""}`}>
            <Frog size={50} />
          </div>
          {splashes > 0 && dunking ? <span key={splashes} className="frog__splash" /> : null}
        </div>
      </div>
    </div>
  );
}

export function FrogScreen() {
  const child = useActiveChild();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const startedAt = useRef(new Date().toISOString());
  const [last, setLast] = useState<LastEvent | null>(null);
  const [splashes, setSplashes] = useState(0);
  const nowRef = useRef(0);
  const syllable = plan.words[0] ?? "ปา";

  const rt = useGameRuntime(
    () => new FrogGame({ oralThreshold: plan.oralThreshold, steps: FROG_STEPS }),
    (game, frame, now, dt) => {
      nowRef.current = now;
      let done = false;
      for (const ev of game.update(frame, now, dt)) {
        const a = game.state.attempts[game.state.attempts.length - 1];
        const meanOral = a ? 100 - a.meanNasal : 0;
        if (ev.type === "jump") setLast({ kind: "jump", at: now, meanOral });
        if (ev.type === "splash") {
          setLast({ kind: "splash", at: now, meanOral });
          setSplashes((n) => n + 1);
        }
        if (ev.type === "done") done = true;
      }
      return done;
    },
  );

  const { game, frame } = rt;
  const s = game.state;
  const thr = game.cfg.oralThreshold;
  const N = game.cfg.steps;
  const recent = last !== null && nowRef.current - last.at < 1800;
  const dunking = last?.kind === "splash" && nowRef.current - last.at < 700;

  let status: MeterStatus = signalProblem(frame) ?? { kind: "idle", text: `พูด “${syllable}” หนึ่งครั้ง แล้วหยุดสั้น ๆ` };
  if (!signalProblem(frame)) {
    if (s.inSegment) {
      status = s.passingLive
        ? { kind: "pass", text: "เสียงออกปากดี กบเตรียมกระโดด… หยุดสั้น ๆ เมื่อพูดจบ" }
        : { kind: "try", text: "กำลังฟัง… ลองให้เสียงออกทางปากมากขึ้น" };
    } else if (recent && last) {
      status =
        last.kind === "jump"
          ? { kind: "done", text: `กบกระโดดได้หนึ่งก้าว (ออกปาก ${fmtPct(last.meanOral)})` }
          : { kind: "try", text: "จ๋อม! ไม่เป็นไร กบกลับขึ้นใบบัวแล้ว ลองพยางค์ต่อไปได้เลย" };
    }
  }
  if (rt.ended) status = { kind: "done", text: "กบข้ามบึงได้แล้ว! เกมหยุดนับแล้ว" };

  const save = (endedEarly: boolean) => {
    const st = game.state;
    if (st.attempts.length === 0) {
      showToast("ยังไม่มีการพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      navigate("home");
      return;
    }
    finishRound({
      child,
      game: "frog",
      startedAt: startedAt.current,
      practiceMs: st.practiceMs,
      attempts: st.attempts,
      stars: st.stars,
      frog: { steps: st.step, target: N },
      endedEarly,
    });
    navigate("result");
  };

  const restart = () => {
    startedAt.current = new Date().toISOString();
    setLast(null);
    rt.restart();
  };

  const group = Math.floor(Math.min(s.step, N - 1) / 4);
  const is3d = mode.kind === "3d";

  return (
    <div className="kid-screen kid-screen--game">
      <div className="kid-frame" inert={rt.paused !== null || rt.ended ? true : undefined}>
        <GameHud title="กบข้ามบึง" sub={`ด่านที่ ${plan.level} · ${LEVEL_LABEL[plan.level]}`} stars={s.stars} onPause={() => rt.pause("user")} />
        <PromptCard label={promptInstruction("frog", plan.level)} word={syllable}>
          <ol className="syllables" aria-label={`พยางค์ ${syllable} ก้าวที่ ${Math.min(s.step + 1, N)} จาก ${N}`}>
            {[0, 1, 2, 3].map((i) => {
              const idx = group * 4 + i;
              const state = idx < s.step ? "done" : idx === s.step ? "current" : "next";
              return (
                <li key={idx} className={`syllable syllable--${state}`} aria-current={state === "current" ? "step" : undefined}>
                  {syllable}
                  {state === "done" ? <Icon name="check" size={14} /> : null}
                </li>
              );
            })}
          </ol>
        </PromptCard>
        <div className={`stage stage--frog${is3d ? " stage--3d" : ""}${frame.valid ? "" : " is-frozen"}`}>
          {is3d ? (
            <World3D kind="frog" tier={mode.tier} active={rt.paused === null} reduced={reduced} gameRef={rt.gameRef} frameRef={rt.frameRef} />
          ) : (
            <Frog2D s={s} N={N} reduced={reduced} dunking={dunking} splashes={splashes} />
          )}
          <span className="pill stage__pill stage__pill--br">
            ก้าวที่ {s.step} / {N}
          </span>
          {!frame.valid ? (
            <div className="stage__frozen">
              <Icon name="alert" size={18} /> หยุดไว้ก่อน · ช่วงเสียงที่ค้างอยู่ไม่ถูกนับ
            </div>
          ) : null}
        </div>
        <StageNote mode={mode} />
        <Meter primary="oral" frame={frame} threshold={thr} thresholdLabel={`เกณฑ์ ${thr}%`} status={status} />
        <p className="kid-note">
          <Icon name="info" size={16} /> หนึ่งช่วงเสียง = หนึ่งครั้ง (เกมแบ่งจากการมี/ไม่มีเสียงเท่านั้น ไม่ได้ฟังว่าเป็นคำว่า “{syllable}” จริง)
        </p>
      </div>

      <DemoPanel target={{ kind: "oral", threshold: thr }} hint="กดค้างเพื่อพูดแล้วปล่อย = 1 ช่วงเสียง หรือเลือก “เป็นช่วง ๆ” ให้ส่งช่วงเสียงอัตโนมัติ" />

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={() => save(true)} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <DoneSheet
          title="กบข้ามบึงได้แล้ว!"
          text={`กระโดดครบ ${s.step} ก้าว จากการพูด ${s.attempts.length} ช่วงเสียง`}
          action="ดูสรุปรอบ"
          onAction={() => save(false)}
        />
      ) : null}
    </div>
  );
}
