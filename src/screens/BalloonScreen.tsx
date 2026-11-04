import "../styles/balloon.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bunny, StarShape } from "../components/Art";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { Meter } from "../components/Meter";
import { StageNote } from "../components/StageNote";
import { TripBalloon, TripLandmark, TripPicture, TripPin } from "../components/TripArt";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { fmtSec1 } from "../data/format";
import { promptFor } from "../data/plan";
import { finishRound } from "../data/rounds";
import { useActiveChild } from "../data/store";
import { TRIPS, tripById, type Trip, type TripId } from "../data/trips";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices, type ExampleKind } from "../lib/speech";
import { showToast } from "../lib/toast";
import { BALLOONS_PER_ROUND, BalloonGame, type BalloonIssue } from "../logic/balloon";
import { useConnection } from "../signal/mock";
import type { SignalFrame } from "../signal/SignalProcessor";
import { signalProblem, type MeterStatus } from "../signal/status";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { useGameRuntime } from "./useGameRuntime";

type Tone = "listen" | "speak" | "heard" | "retry" | "warn" | "done";

interface Line {
  tone: Tone;
  icon: IconName;
  text: string;
  sub?: string;
}

/** Calm lines for voice the game cannot use: never "louder", never a failure; the balloon simply waits. */
const ISSUE_LINE: Record<BalloonIssue, Line> = {
  loud: { tone: "retry", icon: "ear", text: "เบาลงหน่อยก็ได้ยินนะ", sub: "พูดเสียงสบาย ๆ บอลลูนรออยู่ที่เดิม" },
  quiet: { tone: "retry", icon: "ear", text: "ยังได้ยินไม่ชัด", sub: "พูดเสียงปกติสบาย ๆ ก็พอ ไม่ต้องตะโกน" },
};

/** Trip colours and sky for CSS (picker card, stage sky, name tag). */
const tripVars = (t: Trip) =>
  ({ "--trip-ink": t.ink, "--trip-sky-top": t.sky[0], "--trip-sky-mid": t.sky[1], "--trip-sky-low": t.sky[2] }) as CSSProperties;

/** One short line the child can follow: is the game playing a sound, listening, resting, or does the balloon rise? */
function statusLine(g: BalloonGame, frame: SignalFrame, adultModel: boolean, kind: ExampleKind, place: string): Line {
  const s = g.state;
  if (s.done) return { tone: "done", icon: "star", text: s.completed === g.cfg.balloonsPerRound ? "ส่งบอลลูนครบแล้ว!" : "จบรอบแล้ว" };
  if (s.phase === "playing") {
    return adultModel
      ? { tone: "listen", icon: "user", text: "ผู้ใหญ่พูดคำนี้ให้ฟังนะ", sub: "เกมยังไม่ฟังไมค์ระหว่างนี้" }
      : { tone: "listen", icon: "speaker", text: "ฟังนะ…", sub: "เกมยังไม่ฟังไมค์ระหว่างเล่นเสียง" };
  }
  if (frame.status === "disconnected") return { tone: "warn", icon: "unplug", text: "อุปกรณ์หลุด", sub: "บอลลูนรออยู่ที่เดิม รอผู้ใหญ่ต่อใหม่" };
  if (frame.status === "connecting") return { tone: "warn", icon: "plug", text: "กำลังต่ออุปกรณ์…", sub: "บอลลูนรออยู่ที่เดิม" };
  if (frame.status === "stale") return { tone: "warn", icon: "alert", text: "สัญญาณยังไม่มา", sub: "รอแป๊บหนึ่ง บอลลูนรออยู่ที่เดิม" };
  if (frame.status === "channel") return { tone: "warn", icon: "alert", text: "ไมค์ยังไม่พร้อม", sub: "รอผู้ใหญ่ช่วยดูสายไมค์" };
  if (g.resting) return { tone: "heard", icon: "star", text: `ส่งถึง${place}แล้ว!`, sub: "พักหายใจสบาย ๆ พร้อมแล้วค่อยส่งลูกถัดไป" };
  if (s.phase === "settle") return { tone: "speak", icon: "ear", text: "ถึงตาหนูแล้ว" };
  if (!s.armed && frame.speaking) return { tone: "speak", icon: "ear", text: "หยุดแป๊บหนึ่ง แล้วค่อยเริ่มพูด" };
  if (s.issue) return ISSUE_LINE[s.issue];
  if (s.inZone) return { tone: "heard", icon: "check", text: "บอลลูนลอยขึ้นแล้ว", sub: "พูดต่อสบาย ๆ หยุดหายใจได้ บอลลูนไม่ตก" };
  if (s.speaking) return { tone: "speak", icon: "ear", text: "กำลังฟัง…", sub: "ให้เสียงออกทางปาก บอลลูนจะลอยขึ้น" };
  if (s.holdMs > 0) return { tone: "speak", icon: "ear", text: "บอลลูนรออยู่ ไม่ตก", sub: "หายใจแล้วพูดต่อได้เลย" };
  if (s.listens > 0 || kind === "none") return { tone: "speak", icon: "ear", text: "พูดได้เลย", sub: "บอลลูนจะลอยขึ้นตามเสียงพูด" };
  return { tone: "listen", icon: "speaker", text: "ฟังคำก่อนนะ" };
}

/** The adult's reading under the meter: what the game is counting right now, and why not when it is not. */
function meterStatus(g: BalloonGame, frame: SignalFrame): MeterStatus {
  const s = g.state;
  const problem = signalProblem(frame);
  if (problem) return problem;
  if (s.done) return { kind: "done", text: "จบรอบแล้ว · เกมหยุดนับแล้ว" };
  if (s.phase === "playing" || s.phase === "settle") return { kind: "idle", text: "เสียงตัวอย่าง · ไม่นับเสียงช่วงนี้และอีก 0.45 วินาทีหลังจากนั้น" };
  if (g.resting) return { kind: "idle", text: "พักระหว่างลูก · ไม่นับเสียงจนกว่าจะกด “ส่งลูกถัดไป”" };
  if (!s.armed) return { kind: "idle", text: "รอช่วงเงียบก่อนเริ่มนับ (หลังเสียงตัวอย่าง)" };
  if (s.issue === "loud") return { kind: "warn", text: "สัญญาณล้น · ไม่นับช่วงนี้ เวลาที่สะสมไว้ไม่หาย" };
  if (s.issue === "quiet") return { kind: "warn", text: "เสียงเบาเกินกว่าจะใช้ค่า · ไม่นับช่วงนี้ เวลาที่สะสมไว้ไม่หาย" };
  if (s.inZone) return { kind: "pass", text: "อยู่ในโซน: กำลังสะสมเวลา" };
  if (s.speaking) return { kind: "try", text: `มีเสียง · ออกปากยังต่ำกว่าเกณฑ์ ${g.cfg.oralThreshold}%` };
  return { kind: "idle", text: s.holdMs > 0 ? "ไม่มีเสียง · หยุดนับไว้ ไม่เริ่มใหม่" : "รอเสียงพูด" };
}

/** "วันนี้จะส่งบอลลูนไปที่ไหน?" — the pick changes the destination, its pin and the balloons' colours (not the plan). */
function TripPicker({ onPick }: { onPick: (id: TripId) => void }) {
  return (
    <div className="kid-screen kid-screen--pick kid-screen--balloon">
      <div className="pick pick--sky">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะส่งบอลลูนไปที่ไหน?</h1>
        <ul className="pick__list">
          {TRIPS.map((t) => (
            <li key={t.id}>
              <button type="button" className="pick-trip" style={tripVars(t)} onClick={() => onPick(t.id)} aria-label={`ส่งบอลลูนไป${t.name}`}>
                <span className="pick-trip__pic">
                  <TripPicture trip={t} />
                </span>
                <span className="pick-trip__name" lang="th">
                  {t.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pick__note">แตะที่ที่อยากไป แล้วใช้เสียงพาบอลลูนลอยไปส่ง</p>
      </div>
    </div>
  );
}

/** 2D fallback: the same trip as flat pictures — the balloon rises with the progress to the pin at the destination. */
function Balloon2D({ g, trip }: { g: BalloonGame; trip: Trip }) {
  const s = g.state;
  const n = g.cfg.balloonsPerRound;
  const resting = g.resting;
  const progress = Math.min(1, g.cfg.holdMs > 0 ? s.holdMs / g.cfg.holdMs : 0);
  const arrived = resting || (s.done && s.results.at(-1) === "delivered");
  const delivered = s.results.filter((r) => r === "delivered").length;
  const tied = resting ? delivered - 1 : delivered;
  const onPad = !s.done && s.results.length < n;
  return (
    <div className="stage2d sky2d">
      <div className="sky2d__cloud sky2d__cloud--a" aria-hidden="true" />
      <div className="sky2d__cloud sky2d__cloud--b" aria-hidden="true" />
      <div className="sky2d__ground" aria-hidden="true" />
      <div className="sky2d__dest" aria-hidden="true">
        <TripLandmark trip={trip} className="sky2d__landmark" />
        <ul className="sky2d__tied">
          {Array.from({ length: Math.max(0, tied) }, (_, i) => (
            <li key={i}>
              <TripBalloon trip={trip} />
            </li>
          ))}
        </ul>
      </div>
      <span className="sky2d__tag">{trip.name}</span>
      <div className="sky2d__route" aria-hidden="true">
        <span className="sky2d__routefill" style={{ height: `${(arrived ? 1 : s.done ? 0 : progress) * 100}%` }} />
      </div>
      <TripPin className="sky2d__pin" />
      <div className="sky2d__pad" aria-hidden="true" />
      {resting ? (
        <div className="sky2d__craft sky2d__craft--docked" aria-hidden="true">
          <TripBalloon trip={trip} />
        </div>
      ) : null}
      {onPad ? (
        <div
          className={`sky2d__craft${resting ? " is-breathing" : ""}${s.inZone ? " is-inzone" : ""}${s.speaking ? " is-heard" : ""}`}
          style={{ "--p": resting ? 0 : progress } as CSSProperties}
          aria-hidden="true"
        >
          <TripBalloon trip={trip} />
        </div>
      ) : null}
      <div className="sky2d__bunny" aria-hidden="true">
        <Bunny size={42} />
      </div>
    </div>
  );
}

function TripRound({ trip, onPickAgain }: { trip: Trip; onPickAgain: () => void }) {
  const child = useActiveChild();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const conn = useConnection();
  const care = useCareDrawer();
  const startedAt = useRef(new Date().toISOString());
  const tagRef = useRef<HTMLSpanElement>(null);
  const [adultModel, setAdultModel] = useState(false);
  const [, setVoices] = useState(0);

  // Thai voices load asynchronously: re-render when the list changes so "ฟังคำ" knows what it can play.
  useEffect(() => subscribeVoices(() => setVoices((n) => n + 1)), []);
  useEffect(() => () => stopExample(), []);

  const rt = useGameRuntime(
    () =>
      new BalloonGame({
        oralThreshold: plan.oralThreshold,
        holdMs: plan.balloonHoldSec * 1000,
        balloonsPerRound: BALLOONS_PER_ROUND,
        restBetween: true,
      }),
    (game, frame, now, dt) => game.update(frame, now, dt).some((e) => e.type === "done"),
  );

  const { game, frame } = rt;
  const s = game.state;
  const N = game.cfg.balloonsPerRound;
  const thr = game.cfg.oralThreshold;
  const holdSec = game.cfg.holdMs / 1000;
  // level 3 (repeated syllables) does not fit holding a sound: the balloon uses the prolonged form, as before
  const level = plan.level === 3 ? 1 : plan.level;
  const wordAt = (i: number) => plan.words[i % plan.words.length] ?? "อา";
  const at = Math.min(s.results.length, N - 1);
  const word = promptFor(wordAt(at), level);
  const kind = exampleKind(wordAt(at));
  const playing = s.phase === "playing";
  const resting = game.resting;
  // only meaningful while the example is "playing" (pause / skip / next move the game out of that phase)
  const adultModelling = adultModel && playing;
  const line = statusLine(game, frame, adultModelling, kind, trip.name);
  const frozen = !frame.valid && !playing;

  // Pausing (button or tab hidden) stops any example that is still playing; the game itself has left "playing".
  useEffect(() => {
    if (rt.paused !== null) stopExample();
  }, [rt.paused]);

  const settleAudio = () => {
    stopExample();
    setAdultModel(false);
  };

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.state.done) return;
    g.listenStart();
    if (kind === "none") {
      setAdultModel(true);
      return;
    }
    setAdultModel(false);
    // the plain word (a recorded file or the device's Thai voice); the screen shows how long to hold it
    void playExample(wordAt(Math.min(g.index, N - 1))).then((r) => {
      if (rt.gameRef.current !== g) return;
      if (r === "ended") g.listenEnd(performance.now());
      else if (r === "error") setAdultModel(true);
    });
  };

  const adultDone = () => {
    setAdultModel(false);
    rt.gameRef.current?.listenEnd(performance.now());
  };

  /** "ส่งลูกถัดไป": the child ends the rest; a sound cut off here still gets its settle window in the logic. */
  const sendNext = () => {
    settleAudio();
    rt.gameRef.current?.nextBalloon();
  };

  const skip = () => {
    const g = rt.gameRef.current;
    if (!g) return;
    settleAudio();
    if (g.skip().some((e) => e.type === "done")) rt.end();
  };

  /** Save this round for the caregiver: today's balloon summary plus the child's trip. */
  const save = (endedEarly: boolean, then: "result" | "again") => {
    const st = game.state; // read fresh: finish() may have just replaced it
    if (st.attempts.length === 0 && st.totalInZoneMs === 0) {
      showToast("ยังไม่มีเสียงที่ใช้ได้ในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPickAgain();
      else navigate("home");
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
        target: N,
        inZoneSec: Math.round(st.totalInZoneMs / 100) / 10,
        speakingSec: Math.round(st.speakingMs / 100) / 10,
        holdSec,
      },
      choice: { kind: "trip", id: trip.id, label: trip.name },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกที่ส่งรอบใหม่ได้เลย");
      onPickAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    settleAudio();
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const restart = () => {
    settleAudio();
    startedAt.current = new Date().toISOString();
    rt.restart();
  };

  const is3d = mode.kind === "3d";
  const blocked = rt.paused !== null || rt.ended;

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean; after?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (resting) primary = { label: "ส่งลูกถัดไป", icon: "next", onClick: sendNext, after: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: s.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const listenIsSecondary = resting || adultModelling;

  return (
    <div className="kid-screen kid-screen--world kid-screen--balloon" data-trip={trip.id} style={tripVars(trip)}>
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--balloon stage--trip${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <>
                <World3D
                  kind="balloon"
                  destination={trip.id}
                  tier={mode.tier}
                  active={rt.paused === null}
                  reduced={reduced}
                  gameRef={rt.gameRef}
                  frameRef={rt.frameRef}
                  threshold={thr}
                  labelRef={tagRef}
                />
                <span ref={tagRef} className="balloon-dest" aria-hidden="true">
                  {trip.name}
                </span>
              </>
            ) : (
              <Balloon2D g={game} trip={trip} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="sky-trail" aria-label={`ส่งถึง${trip.name}แล้ว ${s.completed} จาก ${N} ลูก`}>
                {Array.from({ length: N }, (_, i) => {
                  const r = s.results[i];
                  const current = !s.done && i === s.results.length;
                  const cls = r === "delivered" ? " is-done" : r === "skipped" ? " is-skipped" : current ? " is-current" : " is-next";
                  return (
                    <li key={i} className={`sky-trail__balloon${cls}`} aria-current={current ? "step" : undefined}>
                      <TripBalloon trip={trip} />
                      {r === "delivered" ? (
                        <span className="sky-trail__check" aria-hidden="true">
                          <Icon name="check" size={12} />
                        </span>
                      ) : null}
                      <span className="sr-only">
                        ลูกที่ {i + 1} {r === "delivered" ? "ส่งถึงแล้ว" : r === "skipped" ? "ข้ามไว้" : current ? (resting ? "พร้อมส่ง" : "กำลังส่ง") : "ยังไม่ถึง"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${s.stars} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{s.stars}</span>
              </span>
            </header>
          </div>

          <section className="world-dock world-dock--sky" aria-label="บอลลูนที่จะส่ง">
            <button type="button" className="dock-glyph dock-glyph--balloon" onClick={listen} disabled={playing || s.done} aria-label={`ฟังคำ “${word}”`}>
              <TripBalloon trip={trip} />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-word" lang="th">
                {word}
              </p>
              <p className={`dock-state dock-state--${line.tone}`} role="status">
                <span className={`dock-state__icon${s.speaking ? " is-live" : ""}`} aria-hidden="true">
                  <Icon name={line.icon} size={18} />
                </span>
                <span>
                  <strong>{line.text}</strong>
                  {line.sub ? <small>{line.sub}</small> : null}
                </span>
              </p>
            </div>
            <div className="dock-actions">
              <button type="button" className="btn btn--primary btn--lg dock-main" onClick={primary.onClick} disabled={primary.disabled || s.done}>
                {primary.after ? null : <Icon name={primary.icon} size={22} />}
                {primary.label}
                {primary.after ? <Icon name={primary.icon} size={22} /> : null}
              </button>
              <div className="dock-quiet">
                {listenIsSecondary ? (
                  <button type="button" className="quiet-btn" onClick={listen} disabled={playing || s.done}>
                    <Icon name="speaker" size={18} /> {s.listens > 0 ? "ฟังซ้ำ" : "ฟังคำ"}
                  </button>
                ) : null}
                {resting ? null : (
                  <button type="button" className="quiet-btn" onClick={skip} disabled={s.done}>
                    <Icon name="skip" size={18} /> ข้ามลูกนี้
                  </button>
                )}
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="บอลลูนและผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="trip-title">
          <h2 id="trip-title" className="side-card__title">
            ส่งบอลลูนไป{trip.name}
          </h2>
          <div className="trip-side__pic">
            <TripPicture trip={trip} balloons={s.completed} label={`บอลลูนที่ส่งถึง${trip.name}แล้ว ${s.completed} ลูก`} />
          </div>
          <ol className="side-list">
            {Array.from({ length: N }, (_, i) => {
              const r = s.results[i];
              const current = !s.done && i === s.results.length;
              const state = r === "delivered" ? "ส่งถึงแล้ว" : r === "skipped" ? "ข้ามไว้" : current ? (resting ? "พร้อมส่ง" : "กำลังลอย") : "รอส่ง";
              return (
                <li key={i}>
                  <div className={`side-item${current ? " is-current" : ""}${r === "delivered" ? " is-done" : ""}`}>
                    <span className="side-item__pic" aria-hidden="true">
                      <TripBalloon trip={trip} />
                    </span>
                    <span className="side-item__name" lang="th">
                      {promptFor(wordAt(i), level)}
                    </span>
                    <span className="side-item__state">
                      ลูกที่ {i + 1} · {state}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <CareDrawer
          careRef={care.ref}
          frame={frame}
          conn={conn}
          issue={s.issue}
          demo={{
            target: { kind: "oral", threshold: thr },
            hint: "กดค้าง “กดค้างเพื่อพูด” = พูดค้างไว้ ค่าออกปากตามแถบเลื่อน · ผ่านเกณฑ์แล้วบอลลูนลอยขึ้น ครบเวลาในแผนแล้วพัก · หลังเสียงตัวอย่างต้องปล่อยแล้วกดใหม่ · เสียงล้น เบา ไมค์ช่องหาย หรืออุปกรณ์หลุด อยู่ใน “ตัวเลือกทดสอบเพิ่ม”",
          }}
        >
          <Meter primary="oral" frame={frame} threshold={thr} thresholdLabel={`เกณฑ์ ${thr}%`} status={meterStatus(game, frame)} />
          <p className="call-note">
            ลูกนี้สะสมในโซน {fmtSec1(s.holdMs)} / {holdSec} วินาที · รวมทั้งรอบ {fmtSec1(s.totalInZoneMs)} วินาที · ส่งถึงแล้ว {s.completed} จาก {N} ลูก
          </p>
          <p className="call-note">
            บอลลูนลอยขึ้นเมื่อมีเสียงที่ใช้ได้และออกปาก ≥ {thr}% (เกณฑ์ในแผน) ทุกค่าที่ผ่านเกณฑ์ลอยเท่ากัน เวลาเป็นแบบสะสม หยุดหายใจหรือหลุดโซนแล้วไม่เริ่มใหม่ ·
            ครบ {holdSec} วินาทีแล้วพัก ไม่นับเสียงระหว่างพัก ระหว่างเสียงตัวอย่าง และ 0.45 วินาทีหลังจากนั้น · เสียงล้นหรือเบาเกินไปไม่นับและไม่หัก
          </p>
          <p className="call-note">
            เสียงตัวอย่าง:{" "}
            {kind === "recording"
              ? "ไฟล์เสียงที่อัดไว้"
              : kind === "tts"
                ? "เสียงสังเคราะห์ภาษาไทยของเครื่อง (ชั่วคราว ควรแทนด้วยเสียงที่นักแก้ไขการพูดอัด)"
                : "เครื่องนี้ไม่มีเสียงภาษาไทย ให้ผู้ใหญ่พูดตัวอย่างแทน"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <TripDone trip={trip} delivered={s.completed} total={N} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} />
      ) : null}
    </div>
  );
}

/** End of the round: the balloons delivered at the destination, then see the summary or pick a new place. */
function TripDone({ trip, delivered, total, onResult, onAgain }: { trip: Trip; delivered: number; total: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div className="overlay__card overlay__card--done">
        <h2 id="done-title">{delivered === 0 ? "จบรอบแล้ว" : delivered === total ? "ส่งครบแล้ว!" : `ส่งถึง${trip.name}แล้ว!`}</h2>
        {delivered > 0 ? (
          <div className="trip-done__pic">
            <TripPicture trip={trip} balloons={delivered} label={`บอลลูน ${delivered} ลูกที่${trip.name}`} />
          </div>
        ) : null}
        <p className="overlay__text">{delivered > 0 ? `บอลลูนถึง${trip.name} ${delivered} จาก ${total} ลูก` : "ไว้รอบหน้ามาพาบอลลูนไปส่งกันใหม่นะ"}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onAgain}>
          <Icon name="refresh" size={20} /> เลือกที่ส่งใหม่
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={onResult}>
          ดูสรุปรอบ
        </button>
      </div>
    </div>
  );
}

export function BalloonScreen() {
  const [picked, setPicked] = useState<TripId | null>(null);
  const [round, setRound] = useState(0);
  const trip = tripById(picked);
  if (!trip) {
    return (
      <TripPicker
        onPick={(id) => {
          setPicked(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <TripRound key={round} trip={trip} onPickAgain={() => setPicked(null)} />;
}
