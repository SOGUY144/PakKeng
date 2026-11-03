import { useRef, useState } from "react";
import { HotAirBalloon, StarShape } from "../components/Art";
import { DemoPanel } from "../components/DemoPanel";
import { DoneSheet, GameHud, PauseOverlay, PromptCard } from "../components/GameParts";
import { Icon } from "../components/Icon";
import { Meter } from "../components/Meter";
import { signalProblem, type MeterStatus } from "../signal/status";
import { showToast } from "../lib/toast";
import { fmtSec1 } from "../data/format";
import { promptFor, promptInstruction } from "../data/plan";
import { finishRound } from "../data/rounds";
import { LEVEL_LABEL } from "../data/schema";
import { useActiveChild } from "../data/store";
import { navigate } from "../lib/router";
import { BALLOONS_PER_ROUND, BalloonGame } from "../logic/balloon";
import { useGameRuntime } from "./useGameRuntime";

/** Sky mapping: height 1 → 8% from top, height 0 → 84%. */
const SKY_TOP = 8;
const SKY_BOTTOM = 84;
const yFor = (h: number) => SKY_BOTTOM - h * (SKY_BOTTOM - SKY_TOP);

export function BalloonScreen() {
  const child = useActiveChild();
  const plan = child.plan;
  const startedAt = useRef(new Date().toISOString());
  const [popAt, setPopAt] = useState(0);
  const wordIndex = useRef(0);
  const nowRef = useRef(0);

  const rt = useGameRuntime(
    () =>
      new BalloonGame({
        oralThreshold: plan.oralThreshold,
        holdMs: plan.balloonHoldSec * 1000,
        balloonsPerRound: BALLOONS_PER_ROUND,
      }),
    (game, frame, now, dt) => {
      nowRef.current = now;
      let done = false;
      for (const ev of game.update(frame, now, dt)) {
        if (ev.type === "balloon-complete") {
          setPopAt(now);
          wordIndex.current += 1;
        }
        if (ev.type === "done") done = true;
      }
      return done;
    },
  );

  const { game, frame } = rt;
  const s = game.state;
  const thr = game.cfg.oralThreshold;
  const holdSec = game.cfg.holdMs / 1000;
  const word = promptFor(plan.words[wordIndex.current % plan.words.length] ?? "อา", plan.level === 3 ? 1 : plan.level);

  let status: MeterStatus = signalProblem(frame) ?? {
    kind: "idle",
    text: s.holdMs > 0 ? "ไม่ได้ยินเสียง · หยุดนับเวลาไว้ก่อน พูดต่อได้เลย" : "พูดลากเสียงค้างไว้ ให้บอลลูนลอยขึ้น",
  };
  if (!signalProblem(frame) && s.speaking) {
    status = s.inZone
      ? { kind: "pass", text: "บอลลูนอยู่ในโซน: กำลังสะสมเวลา" }
      : { kind: "try", text: "อีกนิด! ให้เสียงออกทางปากมากขึ้น บอลลูนจะลอยสูงขึ้น" };
  }
  if (rt.ended) status = { kind: "done", text: "บอลลูนลอยครบแล้ว! เกมหยุดนับแล้ว" };

  const save = (endedEarly: boolean) => {
    const st = game.state; // read fresh: finish() may have just replaced it
    if (st.attempts.length === 0 && st.totalInZoneMs === 0) {
      showToast("ยังไม่มีการพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      navigate("home");
      return;
    }
    finishRound({
      child,
      game: "balloon",
      startedAt: startedAt.current,
      practiceMs: st.practiceMs,
      attempts: st.attempts,
      stars: st.stars,
      balloon: {
        completed: st.completed,
        target: game.cfg.balloonsPerRound,
        inZoneSec: Math.round(st.totalInZoneMs / 100) / 10,
        speakingSec: Math.round(st.speakingMs / 100) / 10,
        holdSec,
      },
      endedEarly,
    });
    navigate("result");
  };

  const endNow = () => {
    game.finish();
    save(true);
  };

  const zoneTop = yFor(1);
  const zoneBottom = yFor(thr / 100);
  const ring = Math.min(1, s.holdMs / game.cfg.holdMs);

  return (
    <div className="kid-screen kid-screen--game">
      <div className="kid-frame" inert={rt.paused !== null || rt.ended ? true : undefined}>
        <GameHud title="บอลลูนลอยสูง" sub={`ด่านที่ ${plan.level} · ${LEVEL_LABEL[plan.level]}`} stars={s.stars} onPause={() => rt.pause("user")} />
        <PromptCard label={promptInstruction("balloon", plan.level)} word={word} />
        <div className={`stage stage--balloon${frame.valid ? "" : " is-frozen"}${s.inZone ? " is-inzone" : ""}`}>
          <div className="balloon__cloud balloon__cloud--a" aria-hidden="true" />
          <div className="balloon__cloud balloon__cloud--b" aria-hidden="true" />
          <div className="balloon__cloud balloon__cloud--c" aria-hidden="true" />
          <div className="balloon__zone" style={{ top: `${zoneTop}%`, height: `${zoneBottom - zoneTop}%` }}>
            <span className="balloon__zonelabel">
              โซนเป้าหมาย
              <br />
              ออกปาก ≥ {thr}%
            </span>
          </div>
          <div className="balloon__craft" style={{ top: `${yFor(s.height)}%` }} aria-hidden="true">
            <HotAirBalloon size={64} />
          </div>
          <div className="balloon__ground" aria-hidden="true" />
          <div className="stage__pill stage__pill--tl balloon__count" aria-label={`บอลลูนลูกที่ ${Math.min(s.completed + 1, game.cfg.balloonsPerRound)} จาก ${game.cfg.balloonsPerRound}`}>
            {Array.from({ length: game.cfg.balloonsPerRound }, (_, i) => (
              <span key={i} className={`balloon__dot${i < s.completed ? " is-done" : i === s.completed ? " is-current" : ""}`} />
            ))}
            <span>
              ลูกที่ {Math.min(s.completed + 1, game.cfg.balloonsPerRound)}/{game.cfg.balloonsPerRound}
            </span>
          </div>
          <div className="pill stage__pill stage__pill--br balloon__hold">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="8.5" fill="none" stroke="var(--surface-sunken)" strokeWidth="3.5" />
              <circle
                cx="11"
                cy="11"
                r="8.5"
                fill="none"
                stroke="var(--oral)"
                strokeWidth="3.5"
                strokeDasharray={`${ring * 53.4} 53.4`}
                transform="rotate(-90 11 11)"
                strokeLinecap="round"
              />
            </svg>
            <span>
              สะสมในโซน {fmtSec1(s.holdMs)} / {holdSec} วิ
            </span>
          </div>
          {popAt > 0 && nowRef.current - popAt < 1500 ? (
            <span key={popAt} className="stage__pop" aria-hidden="true">
              +1 <StarShape size={18} />
            </span>
          ) : null}
          {!frame.valid ? (
            <div className="stage__frozen">
              <Icon name="alert" size={18} /> หยุดไว้ก่อน · ไม่นับเวลาจนกว่าสัญญาณจะกลับมา
            </div>
          ) : null}
        </div>
        <Meter primary="oral" frame={frame} threshold={thr} thresholdLabel={`เกณฑ์ ${thr}%`} status={status} />
        <p className="kid-note">
          <Icon name="clock" size={16} /> เวลาเป็นแบบสะสม: นับเฉพาะตอนมีเสียงและบอลลูนอยู่ในโซน หลุดโซนแล้วไม่เริ่มใหม่
        </p>
        <div className="kid-actions kid-actions--row">
          <button type="button" className="btn btn--secondary" onClick={endNow}>
            จบรอบ
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              startedAt.current = new Date().toISOString();
              wordIndex.current = 0;
              rt.restart();
            }}
          >
            <Icon name="refresh" size={18} /> เริ่มใหม่
          </button>
        </div>
      </div>

      <DemoPanel target={{ kind: "oral", threshold: thr }} hint="เปิด “มีเสียง” แล้วลากแถบ บอลลูนจะลอยตามค่าออกปากทันที" />

      {rt.paused !== null ? (
        <PauseOverlay
          reason={rt.paused}
          onResume={rt.resume}
          onRestart={() => {
            startedAt.current = new Date().toISOString();
            wordIndex.current = 0;
            rt.restart();
          }}
          onFinish={endNow}
          onHome={() => navigate("home")}
        />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <DoneSheet
          title="บอลลูนลอยครบแล้ว!"
          text={`ค้างในโซนครบ ${s.completed} ลูก · สะสมในโซนรวม ${fmtSec1(s.totalInZoneMs)} วินาที`}
          action="ดูสรุปรอบ"
          onAction={() => save(false)}
        />
      ) : null}
    </div>
  );
}
