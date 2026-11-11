import { useEffect, useMemo, useRef, useState } from "react";
import { StarShape } from "../components/Art";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { PetArt, SpeciesArt } from "../components/IslandArt";
import { RenderImg } from "../components/RenderImg";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { promptFor } from "../data/plan";
import { ledgerOf, outfitOf, rewardsOf, speciesName } from "../data/rewards";
import { finishRound } from "../data/rounds";
import type { AvatarSpecies, PetKind } from "../data/schema";
import { useActiveChild, useDB } from "../data/store";
import { floorSpot, TOWER_PATHS, towerPathById, type TowerPath, type TowerPathId } from "../data/towerPaths";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { playSuccessChime, stopSfx } from "../lib/sfx";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { showToast } from "../lib/toast";
import type { CallIssue, CallItem } from "../logic/call";
import { towerCue } from "../logic/hapticCues";
import { climbView, TOWER_FLOORS, TowerClimb, type ClimbView } from "../logic/tower";
import { useConnection } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine, type Line } from "./callStatus";
import { playCue, tapCue } from "./hapticCue";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/runner.css";
import "../styles/tower.css";

const TOWER_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

/** A light 2D picture of one path (the picker's stand-in while its still loads or when it cannot load). */
function PathArt({ path, size = 120 }: { path: TowerPath; size?: number }) {
  const night = path.id === "star";
  const spots = [0, 1, 2, 3, 4, 5].map((f) => floorSpot(path.id, f));
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <rect width="120" height="120" rx="14" fill={night ? "#cfc6f6" : "#ffe3ec"} />
      <path d="M48 118V20c0-8 24-8 24 0v98z" fill="#fff" opacity=".75" />
      {spots.map((p, f) => (
        <g key={f} transform={`translate(${60 + p.x * 34} ${108 - f * 18})`}>
          <ellipse rx={f === 0 ? 22 : 15} ry="5" fill="#fff" stroke="#b9a6f2" strokeWidth="1.5" />
          {f > 0 && f < 5 ? (
            night ? (
              <path d="M0-14l2.4 5 5.4.6-4 3.6 1.1 5.3L0-2.2l-4.9 2.7L-3.8-4.8l-4-3.6 5.4-.6z" fill="#f5c542" />
            ) : (
              <path d="M-1-16v12M-1-16l10 3-10 3" stroke="#ee7aa0" strokeWidth="2.4" fill="#ffd877" strokeLinejoin="round" />
            )
          ) : null}
        </g>
      ))}
      {night ? (
        <path d="M66 6a10 10 0 1 0 8 15A8 8 0 0 1 66 6z" fill="#ffd877" />
      ) : (
        <path d="M44 24a16 16 0 0 1 32 0" stroke="#ff9cbc" strokeWidth="4" fill="none" />
      )}
    </svg>
  );
}

/**
 * "วันนี้จะปีนทางไหน" — the left and right cloud paths up the same tower, as stills rendered from the round's own 3D
 * models. The two paths differ only in the view and the keepsake on each floor: same floors, words, timing and rewards.
 */
function PathPicker({ onPick }: { onPick: (id: TowerPathId) => void }) {
  const child = useActiveChild();
  const db = useDB();
  const species = rewardsOf(db, child.id).species;
  const hero = speciesName(species);
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick pick--map pick--tower">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะปีนทางไหน?</h1>
        <ul className="route-cards">
          {TOWER_PATHS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`route-card tower-card tower-card--${p.id}`}
                onClick={() => {
                  tapCue();
                  onPick(p.id);
                }}
                aria-label={`${p.name} ทาง${p.side === "left" ? "ซ้าย" : "ขวา"} ปีนเมฆ ${TOWER_FLOORS} ชั้น มี${p.keepsake}ทุกชั้น`}
              >
                <span className="route-card__pic">
                  <RenderImg
                    key={species}
                    name={`tower-${p.id}-${species}`}
                    fallback={
                      <span className="route-card__flat">
                        <PathArt path={p} size={96} />
                        <span className="route-card__flat-note">ฉาก 3D ยังไม่พร้อม ใช้ภาพเบาแทนได้</span>
                      </span>
                    }
                  />
                </span>
                <span className="route-card__text" aria-hidden="true">
                  <span className="route-card__name" lang="th">
                    {p.name}
                  </span>
                  <span className="route-card__dest" lang="th">
                    <Icon name={p.side === "left" ? "back" : "next"} size={18} />
                    {p.keepsake}ทุกชั้น
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pick__note">
          พูดหนึ่งคำ {hero}กระโดดขึ้นเมฆหนึ่งชั้น · ปีน {TOWER_FLOORS} ชั้นถึงยอด
        </p>
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * 2D fallback: the same tower as a side stack — the same clouds and zig-zag as the 3D scene (floorSpot), the avatar
 * jumps one cloud per usable word, the lift carries it up on a skip. Reads the same view of the same game, so switching
 * between 3D and 2D mid-round changes nothing.
 */
function Tower2D({ view, path, species, buddy, reduced }: { view: ClimbView; path: TowerPath; species: AvatarSpecies; buddy: PetKind | null; reduced: boolean }) {
  const pos = (f: number) => {
    const p = floorSpot(path.id, f);
    return { x: 50 + p.x * 30, y: 8 + f * 14.5 };
  };
  const a = pos(view.from);
  const b = pos(view.to);
  // reduced motion: a pose swap halfway (no flight through the air); otherwise an arc for a jump, a straight rise for the lift
  const k = view.moving ? (reduced ? (view.k < 0.5 ? 0 : 1) : view.k) : 0;
  const arc = view.moving === "jump" && !reduced ? Math.sin(Math.PI * k) * 7 : 0;
  const x = a.x + (b.x - a.x) * (view.moving === "lift" ? Math.min(1, k * 1.3) : k);
  const y = a.y + (b.y - a.y) * k + arc;
  const crouch = view.moving === "jump" && reduced && view.k < 0.5 ? 1 : view.crouch;
  return (
    <div className={`stage2d tower2d tower2d--${path.id}`}>
      <div className="tower2d__pillar" aria-hidden="true" />
      {[0, 1, 2, 3, 4, 5].map((f) => {
        const p = pos(f);
        const reached = f > 0 && f <= view.floor && view.results[f - 1] !== null;
        const lit = reached && view.results[f - 1] === "jump";
        return (
          <div key={f} className={`tower2d__cloud${f === 0 ? " is-ground" : ""}${f === 5 ? " is-top" : ""}`} style={{ left: pct(p.x / 100), bottom: pct(p.y / 100) }} aria-hidden="true">
            {f > 0 && f < 5 ? <span className={`tower2d__keep${lit ? " is-lit" : ""}`} /> : null}
            {f === 5 ? <span className={`tower2d__goal${view.done && view.floor >= 5 ? " is-lit" : ""}`} /> : null}
          </div>
        );
      })}
      <div
        className={`tower2d__me${view.moving === "lift" ? " is-lift" : ""}${view.landK > 0 ? " is-landing" : ""}`}
        style={{ left: pct(x / 100), bottom: pct(y / 100), ["--crouch" as string]: String(crouch) }}
        aria-hidden="true"
      >
        <SpeciesArt id={species} size={64} />
      </div>
      {buddy ? (
        <div className="tower2d__pet" style={{ left: pct((a.x + (b.x - a.x) * Math.max(0, k - 0.25) / 0.75) / 100 - 0.06), bottom: pct((a.y + (b.y - a.y) * Math.max(0, k - 0.25) / 0.75) / 100) }} aria-hidden="true">
          <PetArt kind={buddy} size={36} />
        </div>
      ) : null}
    </div>
  );
}

function TowerRound({ path, onPlayAgain }: { path: TowerPath; onPlayAgain: () => void }) {
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
    return Array.from({ length: TOWER_FLOORS }, (_, k) => ({ id: String(k), word: prompts[k % prompts.length], resonance: "oral" }));
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
    () => new TowerClimb(items, plan.oralThreshold),
    (game, frame, now, dt, round) => {
      const events = game.update(frame, now, dt);
      for (const e of events) {
        // sound only while the game is not listening (landing); silenced before it listens again
        if (e.type === "land") playSuccessChime();
        else if (e.type === "ready" || e.type === "finish") stopSfx();
        // optional vibration: one per floor jumped by voice, at the landing (the top is the reward); then the re-arm guard
        playCue(towerCue(e, round), frame, (t) => game.call.holdUntil(t));
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

  // the round re-renders every frame: read the character, clothes and pet once per data change
  const look = useMemo(() => {
    const r = rewardsOf(db, child.id);
    return { outfit: outfitOf(db, child, source), species: r.species, buddy: ledgerOf(r, source).buddy };
  }, [db, child, source]);

  const { game, frame } = rt;
  const view = climbView(game);
  const s = game.call.state;
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const frozen = !frame.valid && !playing && !game.busy;
  // "ชั้น N จาก 5": the floor being climbed to; after a landing, the floor just reached
  const floorNo = game.done ? Math.max(1, game.at) : game.phase === "land" ? game.at : game.at + 1;
  const hero = speciesName(look.species);

  let line: Line = callStatusLine(s, frame, adultModelling, kind, "", TOWER_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: game.at >= TOWER_FLOORS ? "ถึงยอดเมฆแล้ว!" : "จบรอบแล้ว" };
  else if (game.phase === "jump") line = { tone: "heard", icon: "next", text: "กระโดด!", sub: "ระหว่างกระโดด เกมยังไม่ฟัง" };
  else if (game.phase === "land") line = { tone: "done", icon: "star", text: `ถึงชั้น ${game.at} แล้ว!`, sub: game.at >= TOWER_FLOORS ? "ยอดเมฆแล้ว" : "แตะ “ชั้นต่อไป” ได้เลย" };
  else if (game.phase === "lift") line = { tone: "listen", icon: "skip", text: "ลิฟต์เมฆพาขึ้นไป", sub: "ชั้นนี้ข้ามไว้ ไม่นับคำ" };
  else if (game.speaking) line = { tone: "speak", icon: "ear", text: "ย่อตัวแล้ว!", sub: `พูดจนจบคำ ${hero}จะกระโดด` };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: `พูดแล้ว${hero}จะกระโดดขึ้นชั้นถัดไป` };

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

  // "ชั้นต่อไป" after the last landing ends the round outside the frame loop: tell the runtime
  const nextFloor = () => {
    stopSfx();
    if (rt.gameRef.current?.skipLand().some((e) => e.type === "finish")) rt.end();
  };

  const save = (endedEarly: boolean, then: "result" | "again") => {
    const g = game;
    if (g.at === 0 && g.attempts.length === 0) {
      showToast("ยังไม่ได้ปีนในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    // the same round saved again (double tap, back, reopening) keeps one session: its id comes from startedAt
    finishRound({
      child,
      game: "tower",
      source,
      startedAt: startedAt.current,
      practiceMs: g.call.state.practiceMs,
      attempts: g.attempts,
      stars: g.voiced,
      tower: { floors: g.voiced, total: g.floors, skipped: g.skipped, path: path.id },
      choice: { kind: "path", id: path.id, label: path.name },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกทางใหม่ได้เลย");
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
  else if (game.phase === "land") primary = { label: game.at >= TOWER_FLOORS ? "ไปต่อ" : "ชั้นต่อไป", icon: "next", onClick: nextFloor };
  else if (game.phase === "jump") primary = { label: "กำลังกระโดด…", icon: "next", onClick: () => {}, disabled: true };
  else if (game.phase === "lift") primary = { label: "ลิฟต์เมฆกำลังขึ้น…", icon: "skip", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.busy;
  const usable = game.attempts.length;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--tower stage--tower-${path.id}${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <World3D
                kind="tower"
                path={path.id}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
                buddy={look.buddy ?? ""}
              />
            ) : (
              <Tower2D view={view} path={path} species={look.species} buddy={look.buddy} reduced={reduced} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <p className="tower-floor" aria-live="polite">
                <span className="tower-floor__pips" aria-hidden="true">
                  {game.results.map((r, i) => (
                    <span key={i} className={`tower-floor__pip${r === "jump" ? " is-jump" : r === "skip" ? " is-skip" : i === game.at && !game.done ? " is-current" : ""}`} />
                  ))}
                </span>
                <span className="tower-floor__text">
                  ชั้น {floorNo} จาก {TOWER_FLOORS}
                </span>
              </p>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${game.voiced} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{game.voiced}</span>
              </span>
            </header>
          </div>

          <section className="world-dock world-dock--tower" aria-label="คำของชั้นนี้">
            <button type="button" className="dock-pic dock-pic--cloud" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              <span className="dock-pic__cloud" aria-hidden="true" />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">{game.done ? path.name : `${path.name} · ชั้น ${floorNo} จาก ${TOWER_FLOORS}`}</p>
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
                  <Icon name="skip" size={18} /> ข้ามชั้นนี้
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="ชั้นในรอบนี้และผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="tower-title">
          <h2 id="tower-title" className="side-card__title">
            ปีน{path.name}
          </h2>
          <ol className="side-list tower-side">
            {game.results.map((r, i) => {
              const now = r === null && i === game.at && !game.done;
              const w = s.words[i];
              const moving = game.phase === "jump" || game.phase === "lift";
              const state =
                r === "jump" ? "กระโดดถึงแล้ว" : r === "skip" ? "ลิฟต์เมฆ (ข้าม)" : now ? (moving ? "กำลังขึ้น" : game.phase === "land" ? "ต่อไป" : `พูด “${w?.word ?? ""}”`) : "รอก่อน";
              return (
                <li key={i}>
                  <div className={`side-item${now ? " is-current" : ""}${r === "jump" ? " is-done" : ""}`}>
                    <span className="side-item__pic" aria-hidden="true">
                      <span className={`tower-side__cloud${r === "jump" ? " is-jump" : ""}`} />
                    </span>
                    <span className="side-item__name" lang="th">
                      ชั้น {i + 1}
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
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = ลองพูดหนึ่งครั้ง กระโดดหนึ่งชั้น",
          }}
        >
          <p className="call-note">
            กระโดดหนึ่งชั้นทุกครั้งที่ตรวจพบการลองพูดที่สัญญาณใช้ได้ ความสูง ระยะ และเวลาของการกระโดดเท่ากันทุกครั้ง ไม่ขึ้นกับความดังหรือค่าเสียงจมูก
            ข้ามชั้น = ลิฟต์เมฆพาขึ้นไป ไม่นับเป็นการพูดและไม่ได้ดาว · ทางซ้ายและขวาต่างกันแค่วิวกับของประดับ
            เกณฑ์ออกปาก {plan.oralThreshold}% ของผู้เชี่ยวชาญใช้บันทึกในหน้าผู้ดูแลเท่านั้น ไม่ได้ใช้ตัดสินในฉาก
          </p>
          <p className="call-note">
            ตรวจพบการลองพูด (สัญญาณใช้ได้) {usable} ครั้ง · ถึงเกณฑ์ออกปากตามแผน {game.attempts.filter((a) => a.passed).length} ครั้ง · ข้าม {game.skipped} ชั้น ·
            แหล่งสัญญาณ: {source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต (สัญญาณจำลอง)"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <TowerDone path={path} species={look.species} voiced={game.voiced} reached={game.at} floors={game.floors} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} />
      ) : null}
    </div>
  );
}

/** The top (or the end of the climb): the summary, or another path. Counts only floors jumped by voice. */
function TowerDone({ path, species, voiced, reached, floors, onResult, onAgain }: { path: TowerPath; species: AvatarSpecies; voiced: number; reached: number; floors: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const top = reached >= floors;
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="tower-done-title">
      <div className="overlay__card overlay__card--done">
        <span className="tower-done__pic">
          <RenderImg name={`tower-${path.id}-${species}`} fallback={<PathArt path={path} size={104} />} />
        </span>
        <h2 id="tower-done-title">{top ? (voiced > 0 ? "ถึงยอดเมฆแล้ว!" : "ถึงยอดเมฆแล้ว") : `ปีนได้ ${reached} ชั้น`}</h2>
        <p className="overlay__text">{voiced > 0 ? `กระโดดด้วยเสียง ${voiced} ชั้น · ${path.name}` : `ลิฟต์เมฆพาขึ้นมา · ${path.name}`}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
          ดูสรุปรอบ <Icon name="next" size={20} />
        </button>
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> เลือกทางใหม่
        </button>
      </div>
    </div>
  );
}

export function TowerScreen() {
  const [path, setPath] = useState<TowerPathId | null>(null);
  const [round, setRound] = useState(0);
  if (path === null) {
    return (
      <PathPicker
        onPick={(id) => {
          setPath(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <TowerRound key={round} path={towerPathById(path)} onPlayAgain={() => setPath(null)} />;
}
