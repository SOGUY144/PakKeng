import { useEffect, useMemo, useRef } from "react";
import { Bunny, CloudPal, DoorPanel } from "../components/Art";
import { DemoPanel } from "../components/DemoPanel";
import { GameHud, PauseOverlay, PromptCard } from "../components/GameParts";
import { Icon } from "../components/Icon";
import { Meter } from "../components/Meter";
import { StageNote } from "../components/StageNote";
import { signalProblem, type MeterStatus } from "../signal/status";
import { outfitFor, totalStars } from "../data/analytics";
import { finishRound, getPendingRunner, summarizeGate } from "../data/rounds";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { GATE_OPEN_MS, GATE_SKIP_AFTER, GateGame, type GateState } from "../logic/gate";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { useGameRuntime } from "./useGameRuntime";

/** The original 2D gate, kept as the fallback when 3D is unavailable or switched off. */
function Gate2D({ s }: { s: GateState }) {
  return (
    <div className="stage2d">
      <div className="gate__wall" aria-hidden="true">
        <div className="gate__arch">
          <div className="gate__beyond" />
          <div className="gate__door gate__door--l" style={{ transform: `translateX(${-s.progress * 100}%)` }}>
            <DoorPanel side="left" />
          </div>
          <div className="gate__door gate__door--r" style={{ transform: `translateX(${s.progress * 100}%)` }}>
            <DoorPanel side="right" />
          </div>
          {s.progress > 0.12 && !s.open ? <span className="gate__gaplabel">ช่องที่เปิดแล้ว</span> : null}
        </div>
      </div>
      <div className="gate__hero" aria-hidden="true">
        <Bunny size={50} cap />
      </div>
      <div className="gate__chaser" aria-hidden="true">
        <CloudPal size={58} />
      </div>
    </div>
  );
}

export function GateScreen() {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const pending = useMemo(() => getPendingRunner(child.id), [child.id]);
  const startedAt = useRef(pending?.startedAt ?? new Date().toISOString());
  const word = plan.nasalWords[0] ?? "มา";
  const prompt = word.endsWith("า") ? `${word}าา` : word;

  const nextRef = useRef<HTMLButtonElement>(null);
  const rt = useGameRuntime(
    () => new GateGame({ nasalThreshold: plan.gateThreshold, openMs: GATE_OPEN_MS }),
    (game, frame, now, dt) => game.update(frame, now, dt).some((e) => e.type === "open"),
  );

  // When the door opens, bring the single next action into view (it can sit below the fold on phones).
  useEffect(() => {
    if (rt.ended) nextRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [rt.ended]);

  const { game, frame } = rt;
  const s = game.state;
  const thr = game.cfg.nasalThreshold;
  const pct = Math.round(s.progress * 100);
  const stars = (pending?.stars ?? 0) + (s.open ? 1 : 0);
  const canSkip = !s.open && s.attempts.length >= GATE_SKIP_AFTER;

  let status: MeterStatus = signalProblem(frame) ?? { kind: "idle", text: `พูด “${prompt}” ค้างไว้ เพื่อเปิดประตู` };
  if (s.open) status = { kind: "done", text: "ประตูเปิดแล้ว! ไปสรุปรอบกันเลย" };
  else if (!signalProblem(frame) && s.speaking) {
    status = s.inZone
      ? { kind: "pass", text: "ผ่านเกณฑ์: ประตูกำลังเปิด" }
      : { kind: "try", text: `ลองพูด “${prompt}” ให้เสียงก้องที่จมูกอีกนิด` };
  }

  const finish = (skipped: boolean) => {
    const st = game.state;
    finishRound({
      child,
      game: "runner",
      startedAt: startedAt.current,
      practiceMs: (pending?.practiceMs ?? 0) + st.practiceMs,
      attempts: pending?.attempts ?? [],
      stars: (pending?.stars ?? 0) + (st.open ? 1 : 0),
      gate: summarizeGate(st.attempts, st.open, skipped),
      endedEarly: pending ? !pending.completed : false,
    });
    navigate("result");
  };

  return (
    <div className="kid-screen kid-screen--game">
      <div className="kid-frame" inert={rt.paused !== null ? true : undefined}>
        <GameHud title="ด่านประตู" sub="เสียงนาสิก" stars={stars} onPause={() => rt.pause("user")} />
        <PromptCard label="ประตูนี้เปิดด้วยเสียงที่ก้องออกจมูก" word={prompt} sub={pending ? undefined : "เล่นด่านนี้เดี่ยว ๆ (ไม่มีรอบวิ่งหนีก่อนหน้า)"} />
        <div className={`stage stage--gate${mode.kind === "3d" ? " stage--3d" : ""}${s.open ? " is-open" : ""}${frame.valid ? "" : " is-frozen"}`}>
          {mode.kind === "3d" ? (
            <World3D
              kind="gate"
              tier={mode.tier}
              active={rt.paused === null}
              reduced={reduced}
              gameRef={rt.gameRef}
              frameRef={rt.frameRef}
              outfit={outfitFor(totalStars(db, child))}
            />
          ) : (
            <Gate2D s={s} />
          )}
          <div className="pill stage__pill stage__pill--tr gate__pill">
            <span>ประตูเปิด {pct}%</span>
            <span className="gate__pillbar" aria-hidden="true">
              <span style={{ transform: `scaleX(${s.progress})` }} />
            </span>
          </div>
          {!frame.valid ? (
            <div className="stage__frozen">
              <Icon name="alert" size={18} /> หยุดไว้ก่อน · ประตูไม่ขยับจนกว่าสัญญาณจะกลับมา
            </div>
          ) : null}
        </div>
        <StageNote mode={mode} />
        <Meter primary="nasal" frame={frame} threshold={thr} thresholdLabel={`โซนเป้าหมาย ≥ ${thr}%`} status={status} />
        <div className="kid-actions">
          <button
            ref={nextRef}
            type="button"
            className={`btn btn--primary btn--lg btn--block${s.open ? " is-ready" : ""}`}
            disabled={!s.open}
            onClick={() => finish(false)}
          >
            ผ่านด่าน <Icon name="next" size={20} /> สรุปรอบ
          </button>
          {!s.open ? <p className="kid-actions__hint">ประตูต้องเปิดครบ 100% ก่อน</p> : null}
          {canSkip ? (
            <button type="button" className="link-btn" onClick={() => finish(true)}>
              ยังเปิดไม่ได้ก็ไม่เป็นไร · ไปสรุปรอบก่อน
            </button>
          ) : null}
        </div>
        <p className="gate__explain">
          <Icon name="info" size={18} />
          <span>
            คำอย่าง “มา” “นา” มีเสียงออกจมูกเป็นส่วนหนึ่งของการพูดอยู่แล้ว ด่านนี้จึงตั้งเป้าให้เสียงจมูก<strong>ถึงเกณฑ์</strong> ไม่ได้ให้ลดเสียงจมูกในทุกคำ
          </span>
        </p>
      </div>

      <DemoPanel target={{ kind: "nasal", threshold: thr }} hint="ด่านนี้ใช้ค่าออกจมูก: ลากแถบไปทางซ้าย (ออกปากน้อยลง = ออกจมูกมากขึ้น) แล้วเปิด “มีเสียง”" />

      {rt.paused !== null ? (
        <PauseOverlay
          reason={rt.paused}
          onResume={rt.resume}
          onRestart={rt.restart}
          onFinish={() => finish(!s.open)}
          onHome={() => navigate("home")}
        />
      ) : null}
    </div>
  );
}
