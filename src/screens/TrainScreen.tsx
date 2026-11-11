import { useEffect, useMemo, useRef, useState } from "react";
import { StarShape } from "../components/Art";
import { FriendPicture } from "../components/CallParts";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { SpeciesArt } from "../components/IslandArt";
import { RenderImg } from "../components/RenderImg";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { promptFor } from "../data/plan";
import { outfitOf, rewardsOf, speciesName } from "../data/rewards";
import { finishRound } from "../data/rounds";
import type { AvatarSpecies } from "../data/schema";
import { useActiveChild, useDB } from "../data/store";
import { BRANCH_END, CARGOS, cargoById, JUNCTION, stopSpot, type Cargo, type CargoId } from "../data/trainCargo";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { playSuccessChime, stopSfx } from "../lib/sfx";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { showToast } from "../lib/toast";
import type { CallIssue, CallItem } from "../logic/call";
import { trainCue } from "../logic/hapticCues";
import { TRAIN_LEGS, TrainTrip, trainView, type TrainView } from "../logic/train";
import { useConnection } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine, type Line } from "./callStatus";
import { playCue, tapCue } from "./hapticCue";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/runner.css";
import "../styles/train.css";

const TRAIN_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

/** Map the track layout (stopSpot, the same as the 3D scene) onto the 2D stage, in percent: depot at the bottom, the
 *  receiver's station low enough to stay clear of the top bar. */
function spot2d(x: number, z: number): { left: number; bottom: number } {
  return { left: 50 + x * 12, bottom: 6 + (-z / 14) * 62 };
}

/** A light 2D picture of one delivery (the picker's stand-in while its still loads or when it cannot load). */
function CargoArt({ cargo, size = 120 }: { cargo: Cargo; size?: number }) {
  const pts = [0, 1, 2, 3, 4].map((s) => stopSpot(cargo.id, s)).map((p) => ({ x: 60 + p.x * 16, y: 112 - (-p.z / 14) * 92 }));
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <rect width="120" height="120" rx="14" fill="#e9f3d6" />
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#9a8fae" strokeWidth="4" strokeLinejoin="round" />
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f3e3c2" strokeWidth="1.5" strokeDasharray="2 3" />
      {pts.slice(1, 4).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#b9a6f2" strokeWidth="2" />
      ))}
      <circle cx={pts[4].x} cy={pts[4].y} r="9" fill={cargo.id === "melon" ? "#f6e3b4" : "#a8e3c8"} stroke="#6b4a1f" strokeWidth="2" />
      <rect x={pts[0].x - 9} y={pts[0].y - 14} width="18" height="12" rx="3" fill="#f06c8a" stroke="#c94a6b" strokeWidth="2" />
      <circle cx={pts[0].x} cy={pts[0].y - 18} r="4" fill={cargo.id === "melon" ? "#5fa955" : "#ff9cbc"} />
    </svg>
  );
}

/**
 * "วันนี้จะส่งอะไร" — the cargo decides who receives it (and which way the switch sends the train). Each card is a still
 * rendered from the round's own 3D models: the train with that cargo, and the receiver waiting at its station.
 */
function CargoPicker({ onPick }: { onPick: (id: CargoId) => void }) {
  const child = useActiveChild();
  const db = useDB();
  const species = rewardsOf(db, child.id).species;
  const hero = speciesName(species);
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick pick--map pick--train">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะส่งอะไร?</h1>
        <ul className="route-cards">
          {CARGOS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`route-card train-card train-card--${c.id}`}
                onClick={() => {
                  tapCue();
                  onPick(c.id);
                }}
                aria-label={`ส่ง${c.name}ให้${c.receiverName}ที่${c.station} รถไฟวิ่ง ${TRAIN_LEGS} ช่วง`}
              >
                <span className="route-card__pic">
                  <RenderImg
                    key={species}
                    name={`train-${c.id}-${species}`}
                    fallback={
                      <span className="route-card__flat">
                        <CargoArt cargo={c} size={96} />
                        <span className="route-card__flat-note">ฉาก 3D ยังไม่พร้อม ใช้ภาพเบาแทนได้</span>
                      </span>
                    }
                  />
                </span>
                <span className="route-card__text" aria-hidden="true">
                  <span className="route-card__name" lang="th">
                    {c.name}
                  </span>
                  <span className="route-card__dest train-card__to" lang="th">
                    <span className="train-card__who">
                      <FriendPicture id={c.receiver} word={c.receiverName} />
                    </span>
                    ส่งให้{c.receiverName}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pick__note">
          พูดหนึ่งคำ รถไฟของ{hero}วิ่งหนึ่งช่วง · {TRAIN_LEGS} ช่วงถึงผู้รับ
        </p>
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

/**
 * 2D fallback: the same line seen from above (stopSpot, the same layout as the 3D scene) — the train moves one stop per
 * usable word, coasts on a skip, the switch turns to the receiver's branch. Reads the same view of the same game, so
 * switching between 3D and 2D mid-round changes nothing.
 */
function Train2D({ view, cargo, species, reduced }: { view: TrainView; cargo: Cargo; species: AvatarSpecies; reduced: boolean }) {
  const pts = [0, 1, 2, 3, 4].map((s) => stopSpot(cargo.id, s));
  const other = BRANCH_END[cargo.branch === "left" ? "right" : "left"];
  const a = spot2d(pts[view.from].x, pts[view.from].z);
  const b = spot2d(pts[view.to].x, pts[view.to].z);
  const k = view.moving ? (reduced ? view.k : view.k * view.k * (3 - 2 * view.k)) : 0;
  const left = a.left + (b.left - a.left) * k;
  const bottom = a.bottom + (b.bottom - a.bottom) * k;
  const line = (p: { x: number; z: number }[]) =>
    p
      .map((q) => spot2d(q.x, q.z))
      .map((q) => `${q.left},${100 - q.bottom}`)
      .join(" ");
  const lastLeg = view.from >= TRAIN_LEGS - 1 && (view.moving !== null || view.delivered);
  return (
    <div className={`stage2d train2d${view.moving === "coast" ? " is-coasting" : ""}`}>
      <svg className="train2d__track" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={line([JUNCTION, other])} className="train2d__rail train2d__rail--other" />
        <polyline points={line(pts)} className="train2d__rail" />
      </svg>
      {pts.slice(1, TRAIN_LEGS).map((p, i) => {
        const q = spot2d(p.x, p.z);
        const up = view.results[i] === "ride" && i + 1 <= view.from;
        return (
          <span key={i} className={`train2d__stop${up ? " is-up" : ""}`} style={{ left: pct(q.left), bottom: pct(q.bottom) }} aria-hidden="true" />
        );
      })}
      <span className={`train2d__switch${lastLeg ? ` is-${cargo.branch}` : ""}`} style={{ left: pct(spot2d(JUNCTION.x, JUNCTION.z).left + 6), bottom: pct(spot2d(JUNCTION.x, JUNCTION.z).bottom) }} aria-hidden="true" />
      <span
        className="train2d__receiver"
        style={{ left: pct(spot2d(pts[4].x, pts[4].z).left + Math.sign(pts[4].x) * 9), bottom: pct(spot2d(pts[4].x, pts[4].z).bottom - 4) }}
        aria-hidden="true"
      >
        <FriendPicture id={cargo.receiver} word={cargo.receiverName} />
      </span>
      <span className={`train2d__train${view.moving ? " is-moving" : ""}`} style={{ left: pct(left), bottom: pct(bottom) }} aria-hidden="true">
        <span className="train2d__loco" />
        <span className={`train2d__cargo train2d__cargo--${cargo.id}${view.delivered ? " is-delivered" : ""}`} />
        <span className="train2d__driver">
          <SpeciesArt id={species} size={28} />
        </span>
      </span>
    </div>
  );
}

function TrainRound({ cargo, onPlayAgain }: { cargo: Cargo; onPlayAgain: () => void }) {
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
    const prompts = (plan.words.length ? plan.words : ["ปา"]).map((w) => promptFor(w, plan.level));
    return Array.from({ length: TRAIN_LEGS }, (_, k) => ({ id: String(k), word: prompts[k % prompts.length], resonance: "oral" }));
  }, [plan.words, plan.level]);

  useEffect(() => subscribeVoices(() => setVoices((n) => n + 1)), []);
  useEffect(
    () => () => {
      stopExample();
      stopSfx();
    },
    [],
  );

  const rt = useGameRuntime(
    () => new TrainTrip(items, plan.oralThreshold),
    (game, frame, now, dt, round) => {
      const events = game.update(frame, now, dt);
      for (const e of events) {
        // sound only while the game is not listening (pulling in); silenced before it listens again
        if (e.type === "arrive") playSuccessChime();
        else if (e.type === "ready" || e.type === "finish") stopSfx();
        // optional vibration: one per leg ridden by voice, when the train pulls in (the delivery is the reward); then the re-arm guard
        playCue(trainCue(e, round), frame, (t) => game.call.holdUntil(t));
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

  // one round = one signal source: switching demo ↔ device mid-round starts the round again (nothing carries over)
  const source = useSourceGuard(restart);

  // the round re-renders every frame: read the character and clothes once per data change
  const look = useMemo(() => {
    const r = rewardsOf(db, child.id);
    return { outfit: outfitOf(db, child, source), species: r.species };
  }, [db, child, source]);

  const { game, frame } = rt;
  const view = trainView(game);
  const s = game.call.state;
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const frozen = !frame.valid && !playing && !game.busy;
  // "ช่วง N จาก 4": the leg being ridden; after pulling in, the leg just finished
  const legNo = game.done ? Math.max(1, game.at) : game.phase === "arrive" ? game.at : game.at + 1;
  const stopName = (n: number) => (n >= TRAIN_LEGS ? `${cargo.station} (${cargo.receiverName})` : `สถานี ${n}`);

  let line: Line = callStatusLine(s, frame, adultModelling, kind, "", TRAIN_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: game.at >= TRAIN_LEGS ? `ส่ง${cargo.name}ถึง${cargo.receiverName}แล้ว!` : "จบรอบแล้ว" };
  else if (game.phase === "ride") line = { tone: "heard", icon: "next", text: "ปู้น ๆ ออกเดินทาง!", sub: "ระหว่างรถวิ่ง เกมยังไม่ฟัง" };
  else if (game.phase === "arrive")
    line = { tone: "done", icon: "star", text: game.at >= TRAIN_LEGS ? `ถึง${cargo.station}แล้ว!` : `ถึงสถานี ${game.at} แล้ว!`, sub: game.at >= TRAIN_LEGS ? `${cargo.receiverName}ได้รับ${cargo.name}แล้ว` : "แตะ “ไปต่อ” ได้เลย" };
  else if (game.phase === "coast") line = { tone: "listen", icon: "skip", text: "รถไฟไหลไปเอง", sub: "ช่วงนี้ข้ามไว้ ไม่นับคำ" };
  else if (game.speaking) line = { tone: "speak", icon: "ear", text: "ไอน้ำเริ่มมาแล้ว!", sub: "พูดจนจบคำ รถไฟจะออกวิ่ง" };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: "พูดแล้วรถไฟจะวิ่งไปสถานีถัดไป" };

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
    rt.gameRef.current?.skip();
  };

  // "ไปต่อ" after the last arrival ends the round outside the frame loop: tell the runtime
  const goOn = () => {
    stopSfx();
    if (rt.gameRef.current?.skipArrive().some((e) => e.type === "finish")) rt.end();
  };

  const save = (endedEarly: boolean, then: "result" | "again") => {
    const g = game;
    if (g.at === 0 && g.attempts.length === 0) {
      showToast("รถไฟยังไม่ได้ออกจากสถานี จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    // the same round saved again (double tap, back, reopening) keeps one session: its id comes from startedAt
    finishRound({
      child,
      game: "train",
      source,
      startedAt: startedAt.current,
      practiceMs: g.call.state.practiceMs,
      attempts: g.attempts,
      stars: g.voiced,
      train: { legs: g.voiced, total: g.legs, coasted: g.coasted, cargo: cargo.id },
      choice: { kind: "cargo", id: cargo.id, label: cargo.name },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกของที่จะส่งใหม่ได้เลย");
      onPlayAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const is3d = mode.kind === "3d";
  const blocked = rt.paused !== null || rt.ended;

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (game.phase === "arrive") primary = { label: "ไปต่อ", icon: "next", onClick: goOn };
  else if (game.phase === "ride") primary = { label: "รถไฟกำลังวิ่ง…", icon: "next", onClick: () => {}, disabled: true };
  else if (game.phase === "coast") primary = { label: "รถไฟไหลไปเอง…", icon: "skip", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.busy;
  const usable = game.attempts.length;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--train${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <World3D
                kind="train"
                cargo={cargo.id}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
              />
            ) : (
              <Train2D view={view} cargo={cargo} species={look.species} reduced={reduced} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <p className="train-leg" aria-live="polite">
                <span className="train-leg__pips" aria-hidden="true">
                  {game.results.map((r, i) => (
                    <span key={i} className={`train-leg__pip${r === "ride" ? " is-ride" : r === "coast" ? " is-coast" : i === game.at && !game.done ? " is-current" : ""}`} />
                  ))}
                </span>
                <span className="train-leg__text">
                  ช่วง {legNo} จาก {TRAIN_LEGS}
                </span>
              </p>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${game.voiced} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{game.voiced}</span>
              </span>
            </header>
          </div>

          <section className="world-dock world-dock--train" aria-label="คำของช่วงนี้">
            <button type="button" className="dock-pic dock-pic--receiver" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              <FriendPicture id={cargo.receiver} word={cargo.receiverName} />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">{game.done ? `ส่ง${cargo.name}ให้${cargo.receiverName}` : `ส่ง${cargo.name}ให้${cargo.receiverName} · ช่วง ${legNo} จาก ${TRAIN_LEGS}`}</p>
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
                  <Icon name="skip" size={18} /> ข้ามช่วงนี้
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="ช่วงในรอบนี้และผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="train-title">
          <h2 id="train-title" className="side-card__title">
            ส่ง{cargo.name}ให้{cargo.receiverName}
          </h2>
          <ol className="side-list train-side">
            {game.results.map((r, i) => {
              const now = r === null && i === game.at && !game.done;
              const w = s.words[i];
              const moving = game.phase === "ride" || game.phase === "coast";
              const state =
                r === "ride" ? "วิ่งถึงแล้ว" : r === "coast" ? "ไหลไปเอง (ข้าม)" : now ? (moving ? "กำลังวิ่ง" : game.phase === "arrive" ? "ต่อไป" : `พูด “${w?.word ?? ""}”`) : "รอก่อน";
              return (
                <li key={i}>
                  <div className={`side-item${now ? " is-current" : ""}${r === "ride" ? " is-done" : ""}`}>
                    {i === TRAIN_LEGS - 1 ? (
                      <FriendPicture id={cargo.receiver} word={cargo.receiverName} className="side-item__pic" />
                    ) : (
                      <span className="side-item__pic" aria-hidden="true">
                        <span className={`train-side__stop${r === "ride" ? " is-ride" : ""}`} />
                      </span>
                    )}
                    <span className="side-item__name" lang="th">
                      {stopName(i + 1)}
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
            target: { kind: "oral", threshold: plan.oralThreshold },
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = ลองพูดหนึ่งครั้ง รถไฟวิ่งหนึ่งช่วง",
          }}
        >
          <p className="call-note">
            รถไฟวิ่งหนึ่งช่วงทุกครั้งที่ตรวจพบการลองพูดที่สัญญาณใช้ได้ ความเร็ว ระยะ และเวลาเท่ากันทุกครั้ง ไม่ขึ้นกับความดังหรือค่าเสียงจมูก ·
            ข้ามช่วง = รถไหลไปเอง ไม่นับเป็นการพูดและไม่ได้ดาว · ของสองอย่างต่างกันแค่ผู้รับกับทางแยก ระยะเท่ากัน ·
            เกณฑ์ออกปาก {plan.oralThreshold}% ของผู้เชี่ยวชาญใช้บันทึกในหน้าผู้ดูแลเท่านั้น ไม่ได้ใช้ตัดสินในฉาก
          </p>
          <p className="call-note">
            ตรวจพบการลองพูด (สัญญาณใช้ได้) {usable} ครั้ง · ถึงเกณฑ์ออกปากตามแผน {game.attempts.filter((a) => a.passed).length} ครั้ง · ข้าม {game.coasted} ช่วง ·
            แหล่งสัญญาณ: {source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต (สัญญาณจำลอง)"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <TrainDone cargo={cargo} species={look.species} voiced={game.voiced} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} />
      ) : null}
    </div>
  );
}

/** The delivery: the summary, or another cargo. Counts only legs ridden by voice. */
function TrainDone({ cargo, species, voiced, onResult, onAgain }: { cargo: Cargo; species: AvatarSpecies; voiced: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="train-done-title">
      <div className="overlay__card overlay__card--done">
        <span className="train-done__pic">
          <RenderImg name={`train-${cargo.id}-${species}`} fallback={<CargoArt cargo={cargo} size={104} />} />
        </span>
        <h2 id="train-done-title">{voiced > 0 ? `ส่ง${cargo.name}ถึง${cargo.receiverName}แล้ว!` : `ส่ง${cargo.name}ถึง${cargo.receiverName}แล้ว`}</h2>
        <p className="overlay__text">{voiced > 0 ? `รถไฟวิ่งด้วยเสียง ${voiced} ช่วง` : "รถไฟไหลไปเอง · รอบหน้าลองพูดให้รถไฟวิ่งนะ"}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
          ดูสรุปรอบ <Icon name="next" size={20} />
        </button>
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> เลือกของใหม่
        </button>
      </div>
    </div>
  );
}

export function TrainScreen() {
  const [cargo, setCargo] = useState<CargoId | null>(null);
  const [round, setRound] = useState(0);
  if (cargo === null) {
    return (
      <CargoPicker
        onPick={(id) => {
          setCargo(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <TrainRound key={round} cargo={cargoById(cargo)} onPlayAgain={() => setCargo(null)} />;
}
