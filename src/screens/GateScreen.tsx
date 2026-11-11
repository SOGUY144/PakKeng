import "../styles/gate.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bunny, CloudPal, StarShape } from "../components/Art";
import { DoorArt } from "../components/DoorArt";
import { PauseOverlay } from "../components/GameParts";
import { RenderImg } from "../components/RenderImg";
import { Icon, type IconName } from "../components/Icon";
import { Meter } from "../components/Meter";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { outfitOf, rewardsOf } from "../data/rewards";
import { DOORS, LOCK_BEADS, doorById, type Door, type DoorId } from "../data/doors";
import { fmtPct } from "../data/format";
import { finishRound, getPendingRunner, summarizeGate, type PendingRunner } from "../data/rounds";
import type { Child } from "../data/schema";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices, type ExampleKind } from "../lib/speech";
import { showToast } from "../lib/toast";
import { totals } from "../logic/common";
import { GATE_OPEN_MS, GATE_SKIP_AFTER, GateGame, type GateState } from "../logic/gate";
import { useConnection, signalKind } from "../signal/mock";
import type { SignalFrame } from "../signal/SignalProcessor";
import { signalProblem, type MeterStatus } from "../signal/status";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";

type Tone = "listen" | "speak" | "heard" | "retry" | "warn" | "done";

interface Line {
  tone: Tone;
  icon: IconName;
  text: string;
  sub?: string;
}

/** One short line the child can follow: is the game playing the word, listening, opening the door, or waiting for the device? */
function gateLine(s: GateState, frame: SignalFrame, adultModel: boolean, kind: ExampleKind, place: string): Line {
  if (s.open) return { tone: "done", icon: "star", text: "ประตูเปิดแล้ว!", sub: `ข้างหลังคือ${place}` };
  if (s.phase === "playing") {
    return adultModel
      ? { tone: "listen", icon: "user", text: "ผู้ใหญ่พูดคำนี้ให้ฟังนะ", sub: "เกมยังไม่ฟังไมค์ระหว่างนี้" }
      : { tone: "listen", icon: "speaker", text: "ฟังนะ…", sub: "เกมยังไม่ฟังไมค์ระหว่างเล่นเสียง" };
  }
  // device trouble: the door just waits — nothing is counted and nothing is taken away
  if (frame.status === "disconnected") return { tone: "warn", icon: "unplug", text: "อุปกรณ์หลุด", sub: "ประตูรออยู่ รอผู้ใหญ่ต่อใหม่นะ" };
  if (frame.status === "connecting") return { tone: "warn", icon: "plug", text: "กำลังต่ออุปกรณ์…", sub: "ประตูรออยู่" };
  if (frame.status === "stale") return { tone: "warn", icon: "alert", text: "สัญญาณยังไม่มา", sub: "รอแป๊บหนึ่ง ประตูรออยู่" };
  if (frame.status === "channel") return { tone: "warn", icon: "alert", text: "ไมค์ยังไม่พร้อม", sub: "รอผู้ใหญ่ช่วยดูสายไมค์" };
  if (s.phase === "settle") return { tone: "speak", icon: "ear", text: "ถึงตาหนูแล้ว" };
  if (s.speaking) {
    return s.inZone
      ? { tone: "heard", icon: "ear", text: "ประตูกำลังเปิด…", sub: "พูดต่อได้เลย" }
      : { tone: "speak", icon: "ear", text: "กำลังฟัง…", sub: "ให้เสียงก้องที่จมูกอีกนิด" };
  }
  if (!s.armed && frame.speaking) return { tone: "speak", icon: "ear", text: "ถึงตาหนูแล้ว", sub: "หยุดแป๊บหนึ่ง แล้วพูดใหม่นะ" };
  if (s.listens > 0 || kind === "none") return { tone: "speak", icon: "ear", text: "พูดได้เลย", sub: "พูดกี่ครั้งก็ได้ ลูกปัดจะค่อย ๆ ติด" };
  return { tone: "listen", icon: "speaker", text: "ฟังคำก่อนนะ" };
}

/** The adult's meter line (inside the adult corner). */
function meterStatus(s: GateState, frame: SignalFrame, thr: number): MeterStatus {
  if (s.open) return { kind: "done", text: "ประตูเปิดแล้ว" };
  if (s.phase !== "listen") return { kind: "idle", text: "กำลังเล่นเสียงตัวอย่าง · ไม่ฟังไมค์ ไม่นับ" };
  const problem = signalProblem(frame);
  if (problem) return problem;
  if (!s.speaking) return { kind: "idle", text: `รอเสียงพูด · เกณฑ์ออกจมูก ≥ ${thr}%` };
  return s.inZone ? { kind: "pass", text: "ถึงเกณฑ์: ประตูกำลังเปิด" } : { kind: "try", text: `ยังไม่ถึงเกณฑ์ ≥ ${thr}%` };
}

/** Leaving the door picker after a run: the run is kept, with the gate marked skipped (as "จบรอบและดูสรุป" on the gate did). */
function saveRunOnly(child: Child, pending: PendingRunner): void {
  finishRound({
    child,
    game: "runner",
    source: pending.source ?? signalKind(),
    startedAt: pending.startedAt,
    practiceMs: pending.practiceMs,
    attempts: pending.attempts,
    stars: pending.stars,
    gate: summarizeGate([], false, true),
    choice: pending.choice ?? null,
    endedEarly: !pending.completed,
  });
  navigate("result");
}

/**
 * "อยากเปิดประตูบานไหน" — the pick sets the door's look and what waits behind it (the word and the target stay the plan's).
 * Each door is a still rendered from the round's own 3D gate (its own crest: flower · star · shell), all at one scale.
 * Phones: the first door gets the wide card and the other two share the row under it; wider screens: three in a row.
 */
function DoorPicker({ opened, fromRun, onPick, onBack }: { opened: DoorId[]; fromRun: boolean; onPick: (id: DoorId) => void; onBack: () => void }) {
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick pick--gate">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={onBack} aria-label={fromRun ? "ไปสรุปรอบวิ่ง" : "กลับหน้าหลัก"}>
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">อยากเปิดประตูบานไหน?</h1>
        <ul className="door-cards">
          {DOORS.map((d) => {
            const done = opened.includes(d.id);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`door-card${done ? " is-done" : ""}`}
                  style={{ ["--door" as string]: d.leaf, ["--door-soft" as string]: d.soft, ["--door-deep" as string]: d.leafDeep }}
                  onClick={() => onPick(d.id)}
                  aria-label={done ? `เปิด${d.name}อีกครั้ง ข้างหลังคือ${d.behind.name}` : `เปิด${d.name}`}
                >
                  <span className="door-card__pic">
                    <RenderImg
                      name={`door-${d.id}`}
                      fallback={
                        <span className="door-card__flat">
                          <DoorArt door={d} open={done} />
                          <span className="door-card__flat-note">ฉาก 3D ยังไม่พร้อม ใช้ภาพเบาแทนได้</span>
                        </span>
                      }
                    />
                  </span>
                  <span className="door-card__name" lang="th" aria-hidden="true">
                    {d.short}
                  </span>
                  {done ? (
                    <span className="door-card__done" aria-hidden="true">
                      <Icon name="check" size={14} />
                      {d.behind.name}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="pick__note">{fromRun ? "วิ่งมาถึงประตูแล้ว แต่ละบานพาไปคนละที่" : "แต่ละบานพาไปคนละที่ แตะบานที่อยากเปิด"}</p>
      </div>
    </div>
  );
}

/** Progress pill on the scene: the same beads as around the lock (orange = time at the nasal target, never goes down). */
function LockBeads({ progress, open }: { progress: number; open: boolean }) {
  const lit = open ? LOCK_BEADS : Math.floor(progress * LOCK_BEADS + 1e-6);
  const pct = open ? 100 : Math.round(progress * 100);
  return (
    <div className="gate-lock" role="progressbar" aria-label="ประตูเปิด" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`เปิดแล้ว ${pct}%`}>
      <Icon name={open ? "star" : "lock"} size={16} />
      {Array.from({ length: LOCK_BEADS }, (_, i) => (
        <span key={i} className={`gate-lock__bead${i < lit ? " is-lit" : ""}`} />
      ))}
    </div>
  );
}

/** 2D fallback: the same door, beads and bolt; it opens on the same event and shows what is behind. */
function Gate2D({ s, door }: { s: GateState; door: Door }) {
  return (
    <div className={`stage2d gate2d${s.open ? " is-open" : ""}`}>
      <div className="gate2d__door" aria-hidden="true">
        <DoorArt door={door} open={s.open} progress={s.progress} live={s.inZone} />
      </div>
      <div className={`gate2d__bunny${s.speaking && !s.open ? " is-singing" : ""}`} aria-hidden="true">
        <Bunny size={50} />
      </div>
      <div className="gate2d__cloud" aria-hidden="true">
        <CloudPal size={58} />
      </div>
    </div>
  );
}

/** The door is open: what was behind it, then another door or the summary. */
function DoorDone({ door, onAgain, onResult }: { door: Door; onAgain: () => void; onResult: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft gate-done" role="dialog" aria-modal="true" aria-labelledby="gate-done-title">
      <div className="overlay__card overlay__card--done">
        <div className="gate-done__pic" aria-hidden="true">
          <DoorArt door={door} open />
        </div>
        <h2 id="gate-done-title">ประตูเปิดแล้ว!</h2>
        <p className="overlay__text">เสียงของหนูพามาถึง{door.behind.name}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onAgain}>
          <Icon name="refresh" size={20} /> เลือกประตูอีกบาน
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={onResult}>
          ดูสรุปรอบ
        </button>
      </div>
    </div>
  );
}

function DoorRound({ door, onOpened, onAgain }: { door: Door; onOpened: (id: DoorId) => void; onAgain: () => void }) {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const conn = useConnection();
  const care = useCareDrawer();
  // a run handed over to the door: saved together with it as one round (read again for every new door)
  const pending = useMemo(() => getPendingRunner(child.id), [child.id]);
  const startedAt = useRef<string | null>(null);
  const [adultModel, setAdultModel] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [, setVoices] = useState(0);
  const word = plan.nasalWords[0] ?? "มา";
  const sourceNow = signalKind();
  const outfit = useMemo(() => outfitOf(db, child, sourceNow), [db, child, sourceNow]);
  const species = useMemo(() => rewardsOf(db, child.id).species, [db, child.id]);

  // Thai voices load asynchronously: re-render when the list changes so "ฟังคำ" knows what it can play.
  useEffect(() => subscribeVoices(() => setVoices((n) => n + 1)), []);
  useEffect(() => () => stopExample(), []);
  useEffect(() => {
    startedAt.current = new Date().toISOString();
  }, []);

  const rt = useGameRuntime(
    () => new GateGame({ nasalThreshold: plan.gateThreshold, openMs: GATE_OPEN_MS }),
    (game, frame, now, dt) => game.update(frame, now, dt).some((e) => e.type === "open"),
  );

  const { game, frame } = rt;
  const s = game.state;
  const thr = game.cfg.nasalThreshold;
  const kind = exampleKind(word);
  const playing = s.phase === "playing";
  // only meaningful while the word is "playing" (pause and retry move the game out of that phase)
  const adultModelling = adultModel && playing;
  const line = gateLine(s, frame, adultModelling, kind, door.behind.name);
  const frozen = !frame.valid && !playing;
  const stars = (pending?.stars ?? 0) + (s.open ? 1 : 0);
  const canSkip = !s.open && s.attempts.length >= GATE_SKIP_AFTER;
  const pct = Math.round(s.progress * 100);
  const said = totals(s.attempts);
  const isOpen = s.open;

  // Pausing (button or tab hidden) stops the word if it is still playing; the game itself has left "playing".
  useEffect(() => {
    if (rt.paused !== null) stopExample();
  }, [rt.paused]);

  // The door opened: let the bolt slide, the leaves swing and the view reach the doorway before the card comes up.
  useEffect(() => {
    if (!isOpen) return;
    onOpened(door.id);
    const id = setTimeout(() => setShowDone(true), reduced ? 3300 : 2600); // after the door has swung open (slower with reduced motion)
    return () => clearTimeout(id);
  }, [isOpen, reduced, door.id, onOpened]);

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.state.open) return;
    g.listenStart();
    if (kind === "none") {
      setAdultModel(true);
      return;
    }
    setAdultModel(false);
    void playExample(word).then((r) => {
      if (rt.gameRef.current !== g) return;
      if (r === "ended") g.listenEnd(performance.now());
      else if (r === "error") setAdultModel(true);
    });
  };

  const adultDone = () => {
    setAdultModel(false);
    rt.gameRef.current?.listenEnd(performance.now());
  };

  /** "ลองใหม่": the word in progress is not counted; the door keeps every bead it has. */
  const retry = () => {
    stopExample();
    setAdultModel(false);
    rt.gameRef.current?.retry();
  };

  /** Save as before (a handed-over run → one combined round), plus the door the child picked. */
  const finish = (skipped: boolean, then: "result" | "again") => {
    const st = (rt.gameRef.current ?? game).state;
    stopExample();
    const source = signalKind();
    if (pending && (pending.source ?? source) !== source) {
      // the run and the door were played on different signal sources: never one round — the run is saved alone under
      // its own source, the door alone under the current one
      finishRound({
        child,
        game: "runner",
        source: pending.source ?? source,
        startedAt: pending.startedAt,
        practiceMs: pending.practiceMs,
        attempts: pending.attempts,
        stars: pending.stars,
        gate: summarizeGate([], false, true),
        choice: pending.choice ?? null,
        endedEarly: !pending.completed,
      });
      finishRound({
        child,
        game: "runner",
        source,
        startedAt: startedAt.current ?? new Date().toISOString(),
        practiceMs: st.practiceMs,
        attempts: [],
        stars: st.open ? 1 : 0,
        gate: summarizeGate(st.attempts, st.open, skipped),
        choice: { kind: "door", id: door.id, label: door.name },
        endedEarly: false,
      });
      if (then === "again") {
        showToast("บันทึกรอบนี้แล้ว เลือกประตูบานใหม่ได้เลย");
        onAgain();
      } else navigate("result");
      return;
    }
    finishRound({
      child,
      game: "runner",
      source,
      startedAt: pending?.startedAt ?? startedAt.current ?? new Date().toISOString(),
      practiceMs: (pending?.practiceMs ?? 0) + st.practiceMs,
      attempts: pending?.attempts ?? [],
      stars: (pending?.stars ?? 0) + (st.open ? 1 : 0),
      gate: summarizeGate(st.attempts, st.open, skipped),
      choice: { kind: "door", id: door.id, label: door.name },
      endedEarly: pending ? !pending.completed : false,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกประตูบานใหม่ได้เลย");
      onAgain();
    } else navigate("result");
  };

  const restart = () => {
    stopExample();
    setAdultModel(false);
    setShowDone(false);
    startedAt.current = new Date().toISOString();
    rt.restart();
  };

  // one round = one signal source: switching demo <-> device mid-round starts the round again (nothing is mixed)
  useSourceGuard(restart);

  const is3d = mode.kind === "3d";
  const blocked = rt.paused !== null || rt.ended;

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean };
  if (s.open) primary = { label: "ประตูเปิดแล้ว!", icon: "star", onClick: () => setShowDone(true) };
  else if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: s.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--gate${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}${s.open ? " is-open" : ""}`}>
            {is3d ? (
              <World3D
                kind="gate"
                door={door.id}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={outfit}
                species={species}
              />
            ) : (
              <Gate2D s={s} door={door} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <LockBeads progress={s.progress} open={s.open} />
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${stars} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{stars}</span>
              </span>
            </header>
          </div>

          <section className="world-dock world-dock--garden gate-dock" aria-label="คำที่ใช้เปิดประตู">
            <button type="button" className="dock-glyph gate-glyph" onClick={listen} disabled={playing || s.open} aria-label={`ฟังคำ “${word}”`}>
              <DoorArt door={door} open={s.open} />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className={`dock-word${word.length > 8 ? " dock-word--long" : ""}`} lang="th">
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
              <button type="button" className="btn btn--primary btn--lg dock-main" onClick={primary.onClick} disabled={primary.disabled}>
                <Icon name={primary.icon} size={22} />
                {primary.label}
              </button>
              <div className="dock-quiet">
                {adultModelling ? (
                  <button type="button" className="quiet-btn" onClick={listen}>
                    <Icon name="speaker" size={18} /> ฟังซ้ำ
                  </button>
                ) : null}
                <button type="button" className="quiet-btn" onClick={retry} disabled={s.open}>
                  <Icon name="refresh" size={18} /> ลองใหม่
                </button>
                {canSkip ? (
                  <button type="button" className="quiet-btn" onClick={() => finish(true, "result")}>
                    <Icon name="skip" size={18} /> ข้ามไปก่อน
                  </button>
                ) : null}
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="ประตูและผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="door-title">
          <h2 id="door-title" className="side-card__title">
            ประตูที่หนูเลือก
          </h2>
          <ol className="side-list">
            {pending ? (
              <li>
                <div className="side-item is-done">
                  <span className="side-item__pic">
                    <Bunny size={40} />
                  </span>
                  <span className="side-item__name">วิ่งหนี</span>
                  <span className="side-item__state">
                    {pending.completed ? "วิ่งครบแล้ว" : "วิ่งมาแล้ว"} ได้ดาว {pending.stars} ดวง
                  </span>
                </div>
              </li>
            ) : null}
            <li>
              <div className={`side-item${s.open ? " is-done" : " is-current"}`}>
                <span className="side-item__pic gate-side__pic">
                  <DoorArt door={door} open={s.open} />
                </span>
                <span className="side-item__name" lang="th">
                  {door.name}
                </span>
                <span className="side-item__state">{s.open ? "เปิดแล้ว" : `เปิดแล้ว ${pct}%`}</span>
              </div>
            </li>
            <li>
              <div className={`side-item${s.open ? " is-current is-done" : ""}`}>
                <span className="side-item__pic gate-side__pic">
                  {s.open ? (
                    <DoorArt door={door} open />
                  ) : (
                    <span className="gate-side__mystery" aria-hidden="true">
                      ?
                    </span>
                  )}
                </span>
                <span className="side-item__name" lang="th">
                  {s.open ? door.behind.name : "ข้างหลังประตู"}
                </span>
                <span className="side-item__state">{s.open ? "มาถึงแล้ว!" : "เปิดแล้วจะได้เห็น"}</span>
              </div>
            </li>
          </ol>
        </section>
        <CareDrawer
          careRef={care.ref}
          frame={frame}
          conn={conn}
          demo={{
            target: { kind: "nasal", threshold: thr },
            hint: "ด่านนี้ใช้ค่าออกจมูก: ลากแถบไปทางซ้าย (ออกปากน้อยลง = ออกจมูกมากขึ้น) แล้วกดค้าง “กดค้างเพื่อพูด” · ตัวเลือกทดสอบเพิ่มมีเสียงลำโพงรั่วเข้าไมค์ (ต้องไม่นับ) และอุปกรณ์หลุด",
          }}
        >
          <p className="gate-explain">
            <Icon name="info" size={18} />
            <span>
              คำอย่าง “มา” “นา” มีเสียงออกจมูกเป็นส่วนหนึ่งของการพูดอยู่แล้ว ด่านนี้จึงตั้งเป้าให้เสียงจมูก<strong>ถึงเกณฑ์</strong> ไม่ได้ให้ลดเสียงจมูกในทุกคำ
            </span>
          </p>
          <Meter primary="nasal" frame={frame} threshold={thr} thresholdLabel={`เกณฑ์ ≥ ${thr}%`} status={meterStatus(s, frame, thr)} />
          <h3 className="care__title">รอบนี้</h3>
          <ul className="gate-facts">
            <li>
              คำ “{word}” · ฟังตัวอย่าง {s.listens} ครั้ง · ลองพูด {said.attempts} ครั้ง · ถึงเกณฑ์ {said.passed} ครั้ง · ออกจมูกเฉลี่ย {fmtPct(said.meanNasal)}
            </li>
            <li>
              ประตูเปิดเมื่อพูดอยู่ในเกณฑ์รวม {GATE_OPEN_MS / 1000} วินาที (สะสม ไม่ลดลง) · {door.name} เปลี่ยนแค่ภาพและสิ่งที่อยู่ข้างหลัง คำและเกณฑ์มาจากแผน
            </li>
            <li>
              “ลองใหม่” เริ่มฟังใหม่โดยไม่นับคำที่ค้างอยู่ และไม่ลดความคืบหน้า · “ข้ามไปก่อน” ขึ้นเมื่อลองพูดครบ {GATE_SKIP_AFTER} ครั้ง · อุปกรณ์หลุดหรือข้อมูลค้าง ประตูหยุดรอ ไม่นับเป็นความผิดของเด็ก
            </li>
          </ul>
          <p className="call-note">
            เสียงตัวอย่าง:{" "}
            {kind === "recording"
              ? "ไฟล์เสียงที่อัดไว้"
              : kind === "tts"
                ? "เสียงสังเคราะห์ภาษาไทยของเครื่อง (ชั่วคราว ควรแทนด้วยเสียงที่นักแก้ไขการพูดอัด)"
                : "เครื่องนี้ไม่มีเสียงภาษาไทย ให้ผู้ใหญ่พูดตัวอย่างแทน"}{" "}
            · ระหว่างเล่นและอีกครู่หลังจบ เกมไม่ฟังไมค์
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={() => finish(!s.open, "result")} onHome={() => navigate("home")} />
      ) : null}
      {showDone && rt.paused === null ? <DoorDone door={door} onAgain={() => finish(false, "again")} onResult={() => finish(false, "result")} /> : null}
    </div>
  );
}

export function GateScreen() {
  const child = useActiveChild();
  const [doorId, setDoorId] = useState<DoorId | null>(null);
  const [round, setRound] = useState(0);
  // doors opened during this visit: the picker shows them open, with what was behind
  const [opened, setOpened] = useState<DoorId[]>([]);
  const markOpened = useCallback((id: DoorId) => setOpened((o) => (o.includes(id) ? o : [...o, id])), []);
  const door = doorById(doorId);
  if (!door) {
    const pending = getPendingRunner(child.id);
    return (
      <DoorPicker
        opened={opened}
        fromRun={pending !== null}
        onPick={(id) => {
          setDoorId(id);
          setRound((r) => r + 1);
        }}
        onBack={() => (pending ? saveRunOnly(child, pending) : navigate("home"))}
      />
    );
  }
  return <DoorRound key={round} door={door} onOpened={markOpened} onAgain={() => setDoorId(null)} />;
}
