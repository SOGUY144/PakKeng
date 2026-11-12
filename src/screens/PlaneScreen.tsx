import { useEffect, useMemo, useRef, useState } from "react";
import { GrumpyCloud, PlaneArt, StarShape } from "../components/Art";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { promptFor } from "../data/plan";
import { finishRound } from "../data/rounds";
import { outfitOf, rewardsOf } from "../data/rewards";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { motionReduced } from "../lib/motion";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { playSuccessChime, stopSfx } from "../lib/sfx";
import { showToast } from "../lib/toast";
import type { CallIssue, CallItem } from "../logic/call";
import { planeCue } from "../logic/hapticCues";
import { MAX_TRIES, PLANE_ENCOUNTERS, PlaneFlight, type EncounterKind, type FlightLevel } from "../logic/plane";
import { useConnection } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine, type Line } from "./callStatus";
import { playCue, tapCue } from "./hapticCue";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/plane.css";

const PLANE_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

const LEVELS: { id: FlightLevel; name: string; note: string }[] = [
  { id: "easy", name: "บินสบาย", note: "พูดแล้วเป่าฟองโดนเมฆทุกครั้ง" },
  { id: "adventure", name: "บินผจญภัย", note: "เป่าฟองใส่เมฆ ตีลังกาหลบลูกเห็บ" },
];

/** A hailstone (adventure, on a nasal word: the plane rolls past it). */
function Hail({ size = 92 }: { size?: number }) {
  return (
    <svg viewBox="0 0 92 92" width={size} height={size} aria-hidden="true">
      <circle cx="46" cy="46" r="34" fill="#f1eefb" stroke="#3a3f55" strokeWidth="3" />
      <path d="M30 34 q6 -10 16 -12" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      <path d="M34 50 l8 4 M58 50 l-8 4" stroke="#3a3f55" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 62 q8 6 16 0" fill="none" stroke="#3a3f55" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="56" r="2.6" fill="#3a3f55" />
      <circle cx="52" cy="56" r="2.6" fill="#3a3f55" />
    </svg>
  );
}

/** "วันนี้จะบินแบบไหน" — the easy flight never judges the voice; the adventure uses the teacher's targets. */
function LevelPicker({ onPick }: { onPick: (id: FlightLevel) => void }) {
  const plan = useActiveChild().plan;
  // hail comes only when the teacher turned on nasal-word practice and chose nasal words
  const hail = plan.gateEnabled && plan.nasalWords.length > 0;
  const [picked, setPicked] = useState<FlightLevel | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });
  useEffect(() => {
    if (picked === null) return;
    const id = setTimeout(() => pickRef.current(picked), motionReduced() ? 160 : 420);
    return () => clearTimeout(id);
  }, [picked]);
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะบินแบบไหน?</h1>
        <ul className={`pick__list plane-pick${picked ? " has-pick" : ""}`}>
          {LEVELS.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`pick-pad pick-pad--plane plane-pick__pad plane-pick__pad--${l.id}${picked === l.id ? " is-picked" : ""}`}
                onClick={() => {
                  if (picked === null) tapCue();
                  setPicked((p) => p ?? l.id);
                }}
                aria-pressed={picked === l.id}
                aria-describedby={`plane-pick-${l.id}`}
              >
                <span className="pick-pad__pic plane-pick__pic">
                  <span className="plane-pick__plane">
                    <PlaneArt size={150} />
                  </span>
                  <span className="plane-pick__foe">{l.id === "adventure" && hail ? <Hail size={52} /> : <GrumpyCloud size={70} />}</span>
                </span>
                <span className="pick-pad__name" lang="th">
                  {l.name}
                </span>
              </button>
              <p id={`plane-pick-${l.id}`} className="plane-pick__note">
                {l.id === "adventure" && !hail ? "เป่าฟองใส่เมฆตามเป้าที่ครูตั้ง" : l.note}
              </p>
            </li>
          ))}
        </ul>
        <p className="pick__note">พูดคำแล้วเครื่องบินเป่าฟองใส่เมฆขี้บ่น บินครบห้าก้อนแล้วลงจอดที่เกาะ</p>
      </div>
    </div>
  );
}

/** The sky: the plane on the left, the cloud / hail on the right; the world slows down while it waits for the child. */
function Sky2D({ flight }: { flight: PlaneFlight }) {
  const kind = flight.kind;
  const approach = flight.phase === "approach";
  const shot = flight.phase === "shot";
  const near = flight.phase === "near";
  const cheer = flight.phase === "cheer";
  const hitting = shot && flight.outcome === "hit";
  // the bubble leaves the plane's nose (left ≈ 36 %) towards the cloud's middle (≈ 77 %); a near one sails over it
  const k = shot ? flight.shotK : 0;
  const bubbleLeft = 36 + 41 * k;
  const bubbleTop = 46 - (flight.outcome === "near" ? 26 * k : 6 * Math.sin(Math.PI * k));
  const happy = cheer && kind === "cloud";
  const rolling = kind === "hail" && (shot || near || cheer);
  return (
    <div className={`stage2d sky2d${approach ? " is-slowmo" : ""}${cheer ? " is-cheer" : ""}`}>
      <div className="sky2d__far" aria-hidden="true" />
      <div className="sky2d__near" aria-hidden="true" />
      <div className="sky2d__streaks" aria-hidden="true">
        <span />
      </div>
      {cheer && kind === "cloud" ? <div className="sky2d__rainbow" aria-hidden="true" /> : null}
      <div
        className={`sky2d__plane${flight.charging ? " is-charging" : ""}${rolling ? (cheer || (shot && hitting) ? " is-roll" : " is-wobble") : ""}`}
        aria-hidden="true"
      >
        <PlaneArt size={170} />
        {kind === "cloud" && (approach || shot) ? (
          <span className="sky2d__charge" style={{ ["--charge" as string]: String(approach ? flight.charge : 0) }} />
        ) : null}
      </div>
      {kind === "cloud" && shot ? (
        // a full-stage track moved by transform (no layout per frame); the bubble sits at its top-left corner
        <span className="sky2d__track" style={{ transform: `translate(${bubbleLeft}%, ${bubbleTop}%)` }} aria-hidden="true">
          <span className="sky2d__bubble" />
        </span>
      ) : null}
      {near && kind === "cloud" ? <span className="sky2d__pop" aria-hidden="true" /> : null}
      <div key={flight.encounter} className={`sky2d__foe sky2d__foe--${kind}${happy ? " is-happy" : ""}${cheer && kind === "hail" ? " is-past" : ""}`} aria-hidden="true">
        {kind === "cloud" ? <GrumpyCloud size={150} mood={happy ? "happy" : "grumpy"} /> : <Hail size={110} />}
      </div>
    </div>
  );
}

function FlightRound({ level, onPlayAgain }: { level: FlightLevel; onPlayAgain: () => void }) {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const conn = useConnection();
  const care = useCareDrawer();
  const startedAt = useRef(new Date().toISOString());
  const [adultModel, setAdultModel] = useState(false);
  const [, setVoices] = useState(0);
  const items = useMemo<CallItem[]>(() => {
    const oral = (plan.words.length ? plan.words : ["ปา"]).map((w) => promptFor(w, plan.level));
    // hail (nasal words) only when the teacher turned on nasal-word practice in the plan
    const nasal = plan.gateEnabled ? plan.nasalWords.map((w) => promptFor(w, plan.level)) : [];
    // adventure mixes in hail on nasal words (ปา–มา style contrast); the easy flight keeps to oral words
    const pattern: EncounterKind[] = level === "adventure" && nasal.length > 0 ? ["cloud", "cloud", "hail", "cloud", "hail"] : Array(PLANE_ENCOUNTERS).fill("cloud");
    // the n-th hail takes the n-th nasal word, the n-th cloud the n-th oral word (cycling)
    const nth = (k: number) => pattern.slice(0, k).filter((p) => p === pattern[k]).length;
    return pattern.map((kind, k) =>
      kind === "hail"
        ? { id: String(k), word: nasal[nth(k) % nasal.length], resonance: "nasal" as const }
        : { id: String(k), word: oral[nth(k) % oral.length], resonance: "oral" as const },
    );
  }, [plan.words, plan.nasalWords, plan.gateEnabled, plan.level, level]);

  useEffect(() => subscribeVoices(() => setVoices((v) => v + 1)), []);
  useEffect(
    () => () => {
      stopExample();
      stopSfx();
    },
    [],
  );

  const rt = useGameRuntime(
    () => new PlaneFlight(items, level, { oralThreshold: plan.oralThreshold, nasalThreshold: plan.gateThreshold }, { cheerMs: motionReduced() ? 900 : undefined }),
    (game, frame, now, dt, round) => {
      const events = game.update(frame, now, dt);
      for (const e of events) {
        // sound only while the game is not listening (shot / celebration); silenced before it listens again
        if (e.type === "hit" || e.type === "dodge") playSuccessChime();
        else if (e.type === "ready" || e.type === "finish") stopSfx();
        playCue(planeCue(e, round), frame, (t) => game.call.holdUntil(t));
      }
      return events.some((e) => e.type === "finish");
    },
  );

  const settleAudio = () => {
    stopExample();
    setAdultModel(false);
  };

  const restart = () => {
    settleAudio();
    startedAt.current = new Date().toISOString();
    rt.restart();
  };

  // one round = one signal source: switching demo ↔ device mid-round starts the round again
  const source = useSourceGuard(restart);

  // the round re-renders every frame: read the character and its clothes once per data change
  const look = useMemo(() => ({ outfit: outfitOf(db, child, source), species: rewardsOf(db, child.id).species }), [db, child, source]);

  const { game, frame } = rt;
  const s = game.call.state;
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const frozen = !frame.valid && !playing && !game.busy;
  const foe = game.kind;
  const number = Math.min(game.encounter, game.encounters - 1) + 1;

  let line: Line = callStatusLine(s, frame, adultModelling, kind, "", PLANE_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: game.stars > 0 ? `บินผ่าน ${game.stars} ก้อน!` : "ลงจอดแล้ว" };
  else if (game.phase === "shot") line = { tone: "heard", icon: "next", text: foe === "hail" ? "ตีลังกา!" : "เป่าฟองแล้ว!", sub: "ระหว่างนี้เกมยังไม่ฟัง" };
  else if (game.phase === "near")
    line = { tone: "speak", icon: "refresh", text: "เกือบแล้ว!", sub: game.tries >= MAX_TRIES ? "เมฆยิ้มแล้วลอยไปเอง" : foe === "hail" ? "ลองพูดคำนาสิกอีกครั้ง ให้เสียงก้องจมูก" : "ลองพูดอีกครั้ง ให้ลมออกทางปาก" };
  else if (game.phase === "cheer") line = { tone: "done", icon: "star", text: foe === "hail" ? "หลบพ้นแล้ว!" : "เมฆกลายเป็นรุ้ง!", sub: "แตะ “ไปต่อ” ได้เลย" };
  else if (game.charging) line = { tone: "speak", icon: "next", text: foe === "hail" ? "เตรียมตีลังกา!" : "ฟองกำลังโต!", sub: "พูดจนจบคำ" };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: foe === "hail" ? "พูดแล้วเครื่องบินตีลังกาหลบ" : "พูดแล้วเครื่องบินเป่าฟองใส่เมฆ" };

  useEffect(() => {
    if (rt.paused !== null) {
      stopExample();
      stopSfx();
    }
  }, [rt.paused]);

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.done || g.busy) return;
    g.call.listenStart("model");
    if (kind === "none") {
      setAdultModel(true);
      return;
    }
    setAdultModel(false);
    void playExample(stat.word).then((r) => {
      if (rt.gameRef.current !== g) return;
      if (r === "ended") g.call.listenEnd(performance.now());
      else if (r === "error") setAdultModel(true);
    });
  };

  const adultDone = () => {
    setAdultModel(false);
    rt.gameRef.current?.call.listenEnd(performance.now());
  };

  const retry = () => {
    settleAudio();
    rt.gameRef.current?.call.retry();
  };

  const skip = () => {
    settleAudio();
    if (rt.gameRef.current?.skip().some((e) => e.type === "finish")) rt.end();
  };

  const next = () => {
    stopSfx();
    if (rt.gameRef.current?.skipCheer().some((e) => e.type === "finish")) rt.end();
  };

  const save = (endedEarly: boolean, then: "result" | "again") => {
    const g = game;
    const tries = g.oralAttempts.length + g.nasalAttempts.length;
    if (tries === 0 && g.stars === 0) {
      showToast("ยังไม่ได้ลองพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    const nasal = g.nasalAttempts;
    finishRound({
      child,
      game: "plane",
      source,
      startedAt: startedAt.current,
      practiceMs: g.call.state.practiceMs,
      attempts: g.oralAttempts,
      stars: g.stars,
      plane: {
        hits: g.stars,
        total: g.encounters,
        drifted: g.results.filter((r) => r === "drift").length,
        skipped: g.results.filter((r) => r === "skip").length,
        level,
        nasalAttempts: nasal.length,
        nasalPassed: nasal.filter((a) => a.passed).length,
        nasalMean: nasal.length ? Math.round((nasal.reduce((n, a) => n + a.meanNasal, 0) / nasal.length) * 10) / 10 : null,
      },
      choice: { kind: "mode", id: level, label: LEVELS.find((l) => l.id === level)?.name ?? "" },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกแบบบินใหม่ได้เลย");
      onPlayAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const blocked = rt.paused !== null || rt.ended;
  const is3d = mode.kind === "3d";

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (game.phase === "cheer") primary = { label: "ไปต่อ", icon: "next", onClick: next };
  else if (game.busy) primary = { label: game.phase === "near" ? "เกือบแล้ว…" : "กำลังบิน…", icon: "next", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.busy;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div
            className={`stage stage--world stage--plane${is3d ? " stage--3d" : ""}${game.phase === "approach" && !game.done ? " is-slowmo" : ""}${frozen ? " is-frozen" : ""}`}
          >
            {is3d ? (
              <World3D
                kind="plane"
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
              />
            ) : (
              <Sky2D flight={game} />
            )}
            {game.phase === "approach" && !game.done ? (
              <div className={`sky-word sky-word--${foe}`} aria-hidden="true">
                <span lang="th">{stat.word}</span>
              </div>
            ) : null}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="plane-score" aria-label={`ผ่านเมฆ ${game.stars} จาก ${game.encounters} ก้อน`}>
                {game.results.map((r, i) => {
                  const state = r === "hit" || r === "dodge" ? "is-done" : r ? "is-pass" : i === game.encounter && !game.done ? "is-current" : "is-next";
                  return (
                    <li key={i} className={`plane-score__dot plane-score__dot--${game.kinds[i]} ${state}`}>
                      <span className="sr-only">
                        ก้อนที่ {i + 1} {r === "hit" ? "เป่าหายแล้ว" : r === "dodge" ? "หลบพ้นแล้ว" : r === "drift" ? "ลอยไปเอง" : r === "skip" ? "ข้าม" : "ยังไม่ถึง"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${game.stars} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{game.stars}</span>
              </span>
            </header>
          </div>

          <section className="world-dock" aria-label="คำของก้อนนี้">
            <button type="button" className="dock-pic dock-pic--foe" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              {foe === "hail" ? <Hail size={58} /> : <GrumpyCloud size={64} />}
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">{game.done ? "ลงจอดแล้ว" : `${foe === "hail" ? "ลูกเห็บ" : "เมฆ"}ก้อนที่ ${number} จาก ${game.encounters}`}</p>
              <p className="dock-word" lang="th">
                {stat.word}
              </p>
              <p className={`dock-state dock-state--${line.tone}`} role="status">
                <span className={`dock-state__icon${s.inAttempt ? " is-live" : ""}`} aria-hidden="true">
                  <Icon name={line.icon} size={18} />
                </span>
                <span>
                  <strong>{line.text}</strong>
                  {line.sub ? <small>{line.sub}</small> : null}
                </span>
              </p>
            </div>
            <div className="dock-actions">
              <button type="button" className="btn btn--primary btn--lg dock-main" onClick={primary.onClick} disabled={primary.disabled || game.done}>
                <Icon name={primary.icon} size={22} />
                {primary.label}
              </button>
              <div className="dock-quiet">
                <button type="button" className="quiet-btn" onClick={retry} disabled={busy}>
                  <Icon name="refresh" size={18} /> ลองใหม่
                </button>
                <button type="button" className="quiet-btn" onClick={skip} disabled={busy}>
                  <Icon name="skip" size={18} /> ข้ามก้อนนี้
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="เมฆในเที่ยวบินนี้และผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="plane-title">
          <h2 id="plane-title" className="side-card__title">
            {LEVELS.find((l) => l.id === level)?.name}
          </h2>
          <ol className="side-list">
            {game.results.map((r, i) => {
              const now = r === null && i === game.encounter && !game.done;
              const w = s.words[i];
              const state =
                r === "hit" ? "เป่าหายแล้ว" : r === "dodge" ? "หลบพ้นแล้ว" : r === "drift" ? "ลอยไปเอง" : r === "skip" ? "ข้ามไป" : now ? (game.busy ? "กำลังบิน" : `พูด “${w?.word ?? ""}”`) : "รอก่อน";
              return (
                <li key={i}>
                  <div className={`side-item${now ? " is-current" : ""}${r === "hit" || r === "dodge" ? " is-done" : ""}`}>
                    <span className={`side-item__pic plane-side plane-side--${game.kinds[i]}`} aria-hidden="true">
                      {game.kinds[i] === "hail" ? <Hail size={30} /> : <GrumpyCloud size={36} mood={r === "hit" ? "happy" : "grumpy"} />}
                    </span>
                    <span className="side-item__name" lang="th">
                      {game.kinds[i] === "hail" ? "ลูกเห็บ" : "เมฆ"}ก้อนที่ {i + 1}
                    </span>
                    <span className="side-item__state">{state}</span>
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
            target: { kind: foe === "hail" ? "nasal" : "oral", threshold: foe === "hail" ? plan.gateThreshold : plan.oralThreshold },
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = ลองพูดหนึ่งครั้ง เครื่องบินเป่าฟองหนึ่งลูก",
          }}
        >
          <p className="call-note">
            {level === "easy"
              ? "บินสบาย: ทุกครั้งที่ตรวจพบการลองพูดที่สัญญาณใช้ได้ ฟองโดนเมฆ เกมไม่ตัดสินเสียง"
              : `บินผจญภัย: เมฆ (คำด้านปาก) โดนเมื่อออกปากอย่างน้อย ${plan.oralThreshold}% · ลูกเห็บ (คำนาสิก) หลบพ้นเมื่อออกจมูกอย่างน้อย ${plan.gateThreshold}% · ต่ำกว่าเป้า = ฟองลอยเฉียด ลองได้อีก ครบ ${MAX_TRIES} ครั้งเมฆลอยไปเอง ไม่หักอะไร`}
          </p>
          <p className="call-note">
            เครื่องไม่รู้ว่าออกเสียงพยัญชนะถูกหรือไม่ (เช่น แยก “ปา” กับการปิดเส้นเสียงแทนไม่ได้) เด็กที่ยังออกเสียงทดแทนควรใช้บินสบาย ·
            แรงฟองไม่ขึ้นกับความดัง · แหล่งสัญญาณ: {source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต (สัญญาณจำลอง)"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? <FlightDone stars={game.stars} total={game.encounters} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} /> : null}
    </div>
  );
}

function FlightDone({ stars, total, onResult, onAgain }: { stars: number; total: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="plane-done-title">
      <div className="overlay__card overlay__card--done">
        <span className="plane-done__pic">
          <PlaneArt size={150} />
        </span>
        <h2 id="plane-done-title">{stars > 0 ? `บินผ่านเมฆ ${stars} ก้อน!` : "ลงจอดแล้ว"}</h2>
        <p className="overlay__text">{stars >= total ? "ท้องฟ้าใสทั้งเส้นทาง ลงจอดที่เกาะแล้ว" : "ลงจอดที่เกาะแล้ว รอบหน้ามาบินกันอีกนะ"}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
          ดูสรุปรอบ <Icon name="next" size={20} />
        </button>
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> บินอีกรอบ
        </button>
      </div>
    </div>
  );
}

export function PlaneScreen() {
  const [level, setLevel] = useState<FlightLevel | null>(null);
  const [round, setRound] = useState(0);
  if (level === null) {
    return (
      <LevelPicker
        onPick={(id) => {
          setLevel(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <FlightRound key={round} level={level} onPlayAgain={() => setLevel(null)} />;
}
