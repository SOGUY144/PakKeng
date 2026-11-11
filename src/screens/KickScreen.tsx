import { useEffect, useMemo, useRef, useState } from "react";
import { Bunny, StarShape } from "../components/Art";
import { FriendPicture } from "../components/CallParts";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { promptFor } from "../data/plan";
import { ledgerOf, outfitOf, rewardsOf } from "../data/rewards";
import { finishRound } from "../data/rounds";
import { useActiveChild, useDB } from "../data/store";
import { TEAMS, teamById, type Team, type TeamId } from "../data/teams";
import { useReducedMotion } from "../lib/hooks";
import { motionReduced } from "../lib/motion";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { playKickThump, playSuccessChime, stopSfx } from "../lib/sfx";
import { showToast } from "../lib/toast";
import type { CallIssue, CallItem } from "../logic/call";
import { KICK_SHOTS, KickMatch, type ShotStyle } from "../logic/kick";
import { useConnection } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine, type Line } from "./callStatus";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/kick.css";

const KICK_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

/** Where each ball ends inside the 2D goal (percent of the goal box) — the same fixed order as the 3D scene. */
const AIM_2D: Record<ShotStyle, { x: number; y: number }> = {
  "low-left": { x: 16, y: 78 },
  "high-right": { x: 84, y: 24 },
  chip: { x: 50, y: 16 },
  "low-right": { x: 82, y: 80 },
  "top-left": { x: 18, y: 22 },
};

function TrophyArt({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true">
      <path d="M30 14h36v20c0 14-8 24-18 24S30 48 30 34z" fill="#ffd34d" stroke="#b07800" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 20H18c0 12 6 18 14 18M66 20h12c0 12-6 18-14 18" fill="none" stroke="#b07800" strokeWidth="3" strokeLinecap="round" />
      <path d="M42 58h12v12H42z" fill="#ffc21a" stroke="#b07800" strokeWidth="3" />
      <rect x="30" y="70" width="36" height="10" rx="4" fill="#8a5a2b" stroke="#5b3a18" strokeWidth="3" />
      <path d="M40 26l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fff6c9" />
    </svg>
  );
}

/** "วันนี้จะยิงประตูกับทีมไหน" — the team sets the goalie, colours and crowd. Every team plays the same way. */
function TeamPicker({ onPick }: { onPick: (id: TeamId) => void }) {
  const [picked, setPicked] = useState<TeamId | null>(null);
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
        <h1 className="pick__title">วันนี้จะยิงประตูกับทีมไหน?</h1>
        <ul className={`pick__list${picked ? " has-pick" : ""}`}>
          {TEAMS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`pick-pad pick-pad--team${picked === t.id ? " is-picked" : ""}`}
                style={{ ["--team" as string]: t.color, ["--team-deep" as string]: t.deep }}
                onClick={() => setPicked((p) => p ?? t.id)}
                aria-label={`ยิงประตูกับ${t.name}`}
                aria-pressed={picked === t.id}
              >
                <span className="pick-pad__pic">
                  <FriendPicture id={t.goalie} word={t.name} />
                </span>
                <span className="pick-pad__name" lang="th">
                  {t.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pick__note">พูดคำแล้วนักเตะจะเตะลูก ลองพูดครบห้าลูกได้ถ้วย</p>
      </div>
    </div>
  );
}

/** 2D fallback: the same pitch from behind the kicker — the ball flies to the same corner as in 3D, the goalie dives the other way. */
function Kick2D({ match, team }: { match: KickMatch; team: Team }) {
  const aim = AIM_2D[match.style];
  const flying = match.phase === "flight";
  const inNet = match.phase === "cheer";
  const k = flying ? match.flightK : inNet ? 1 : 0;
  // goal box: left 22–78 %, top 10–44 % of the stage; the penalty spot sits at 50 %, 84 %
  const gx = 22 + (aim.x / 100) * 56;
  const gy = 10 + (aim.y / 100) * 34;
  const lift = Math.sin(Math.PI * k) * (match.style === "chip" ? 20 : 7);
  const bx = 50 + (gx - 50) * k;
  const by = 84 + (gy - 84) * k - lift;
  const dive = flying || inNet ? (aim.x < 45 ? "right" : aim.x > 55 ? "left" : "low") : null;
  return (
    <div className="stage2d kick2d" style={{ ["--team" as string]: team.color, ["--team-deep" as string]: team.deep }}>
      <div className="kick2d__stands" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`kick2d__fan${inNet ? " is-cheer" : ""}`} style={{ ["--i" as string]: String(i) }} />
        ))}
      </div>
      <div className={`kick2d__goal${inNet ? " is-bulge" : ""}`} aria-hidden="true" />
      <div className={`kick2d__goalie${dive ? ` is-dive-${dive}` : ""}${match.charging ? " is-ready" : ""}`} aria-hidden="true">
        <FriendPicture id={team.goalie} word={team.name} />
      </div>
      <div className="kick2d__spot" aria-hidden="true" />
      <div className={`kick2d__ball${flying ? " is-flying" : ""}`} style={{ left: `${bx}%`, top: `${by}%` }} aria-hidden="true" />
      <div className={`kick2d__kicker${match.charging ? " is-running" : ""}`} style={{ ["--runup" as string]: String(match.runup) }} aria-hidden="true">
        <Bunny size={84} />
      </div>
    </div>
  );
}

function KickRound({ team, onPlayAgain }: { team: Team; onPlayAgain: () => void }) {
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
    return Array.from({ length: KICK_SHOTS }, (_, k) => ({ id: String(k), word: prompts[k % prompts.length], resonance: "oral" }));
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
    () => new KickMatch(items, plan.oralThreshold, { cheerMs: motionReduced() ? 900 : undefined }),
    (game, frame, now, dt) => {
      const events = game.update(frame, now, dt);
      // sound only while the game is not listening (ball in flight / celebration); silenced before it listens again
      for (const e of events) {
        if (e.type === "kick") playKickThump();
        else if (e.type === "goal") playSuccessChime();
        else if (e.type === "ready" || e.type === "finish") stopSfx();
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

  // the round re-renders every frame: read the character, clothes and pet once per data change
  const look = useMemo(() => {
    const r = rewardsOf(db, child.id);
    return { outfit: outfitOf(db, child, source), species: r.species, buddy: ledgerOf(r, source).buddy ?? "" };
  }, [db, child, source]);

  const { game, frame } = rt;
  const s = game.call.state;
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const frozen = !frame.valid && !playing && !game.busy;
  const ball = Math.min(game.shot, KICK_SHOTS - 1) + 1;

  let line: Line = callStatusLine(s, frame, adultModelling, kind, "", KICK_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: game.goals > 0 ? `ยิงเข้า ${game.goals} ลูก!` : "จบรอบแล้ว" };
  else if (game.phase === "flight") line = { tone: "heard", icon: "next", text: "เตะแล้ว!", sub: "ระหว่างลูกลอย เกมยังไม่ฟัง" };
  else if (game.phase === "cheer") line = { tone: "done", icon: "star", text: "เข้าประตู!", sub: "แตะ “ลูกต่อไป” ได้เลย" };
  else if (game.charging)
    line =
      game.runup > 0.6
        ? { tone: "speak", icon: "next", text: "เกือบถึงลูกแล้ว!", sub: "พูดจนจบคำ นักเตะจะเตะ" }
        : { tone: "speak", icon: "next", text: "วิ่งเลย!", sub: "พูดจนจบคำ แล้วเตะ" };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: "พูดแล้วนักเตะจะวิ่งไปเตะลูก" };

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

  // skipping the last ball, or "ลูกต่อไป" after the last goal, ends the round outside the frame loop: tell the runtime
  const skip = () => {
    settleAudio();
    if (rt.gameRef.current?.skip().some((e) => e.type === "finish")) rt.end();
  };

  const nextBall = () => {
    stopSfx();
    if (rt.gameRef.current?.skipCheer().some((e) => e.type === "finish")) rt.end();
  };

  const save = (endedEarly: boolean, then: "result" | "again") => {
    const g = game;
    if (g.attempts.length === 0 && g.goals === 0) {
      showToast("ยังไม่ได้ลองพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    finishRound({
      child,
      game: "kick",
      source,
      startedAt: startedAt.current,
      practiceMs: g.call.state.practiceMs,
      attempts: g.attempts,
      stars: g.goals,
      kick: { goals: g.goals, shots: g.shots, team: team.id },
      choice: { kind: "team", id: team.id, label: team.name },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกทีมใหม่ได้เลย");
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
  else if (game.phase === "cheer") primary = { label: "ลูกต่อไป", icon: "next", onClick: nextBall };
  else if (game.phase === "flight") primary = { label: "ลูกกำลังลอย…", icon: "next", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.busy;
  const usable = game.attempts.length;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div
            className={`stage stage--world stage--kick${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}
            style={{ ["--team" as string]: team.color, ["--team-deep" as string]: team.deep }}
          >
            {is3d ? (
              <World3D
                kind="kick"
                team={team.id}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
                buddy={look.buddy}
              />
            ) : (
              <Kick2D match={game} team={team} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="kick-score" aria-label={`เข้าประตู ${game.goals} จาก ${KICK_SHOTS} ลูก`}>
                {game.results.map((r, i) => {
                  const state = r === "goal" ? "is-goal" : r === "skip" ? "is-skip" : i === game.shot && !game.done ? "is-current" : "is-next";
                  return (
                    <li key={i} className={`kick-score__ball ${state}`}>
                      <span className="sr-only">
                        ลูกที่ {i + 1} {r === "goal" ? "เข้าประตู" : r === "skip" ? "ข้าม" : "ยังไม่เตะ"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${game.goals} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{game.goals}</span>
              </span>
            </header>
          </div>

          <section className="world-dock world-dock--pitch" aria-label="คำของลูกนี้">
            <button type="button" className="dock-pic dock-pic--ball" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              <span className="dock-pic__soccer" aria-hidden="true" />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">{game.done ? team.name : `ลูกที่ ${ball} จาก ${KICK_SHOTS}`}</p>
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
                  <Icon name="skip" size={18} /> ข้ามลูกนี้
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="ลูกในรอบนี้และผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="kick-title">
          <h2 id="kick-title" className="side-card__title">
            เตะกับ{team.name}
          </h2>
          <ol className="side-list">
            {game.results.map((r, i) => {
              const now = r === null && i === game.shot && !game.done;
              const w = s.words[i];
              const state = r === "goal" ? "เข้าประตู" : r === "skip" ? "ข้ามไป" : now ? (game.busy ? "กำลังเตะ" : `พูด “${w?.word ?? ""}”`) : "รอก่อน";
              return (
                <li key={i}>
                  <div className={`side-item${now ? " is-current" : ""}${r === "goal" ? " is-done" : ""}`}>
                    <span className={`side-item__pic kick-side-ball${r === "goal" ? " is-goal" : ""}`} aria-hidden="true" />
                    <span className="side-item__name" lang="th">
                      ลูกที่ {i + 1}
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
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = ลองพูดหนึ่งครั้ง นักเตะเตะหนึ่งลูก",
          }}
        >
          <p className="call-note">
            ลูกเข้าประตูทุกครั้งที่ตรวจพบการลองพูดที่สัญญาณใช้ได้ ข้ามลูกได้โดยไม่เสียอะไร ทิศและแรงเตะไม่ขึ้นกับความดังหรือค่าเสียงจมูก
            เกณฑ์ออกปาก {plan.oralThreshold}% ของผู้เชี่ยวชาญใช้บันทึกในหน้าผู้ดูแลเท่านั้น ไม่ได้ใช้ตัดสินในฉาก
          </p>
          <p className="call-note">
            ตรวจพบการลองพูด (สัญญาณใช้ได้) {usable} ครั้ง · ถึงเกณฑ์ออกปากตามแผน {game.attempts.filter((a) => a.passed).length} ครั้ง ·
            แหล่งสัญญาณ: {source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต (สัญญาณจำลอง)"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <KickDone team={team} goals={game.goals} shots={game.shots} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} />
      ) : null}
    </div>
  );
}

/** Five balls done: the trophy, then the summary or another team. */
function KickDone({ team, goals, shots, onResult, onAgain }: { team: Team; goals: number; shots: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="kick-done-title">
      <div className="overlay__card overlay__card--done">
        <TrophyArt size={104} />
        <h2 id="kick-done-title">{goals > 0 ? `ยิงเข้า ${goals} ลูก!` : "จบรอบแล้ว"}</h2>
        <p className="overlay__text">
          เตะกับ{team.name}ครบ {shots} ลูก
        </p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
          ดูสรุปรอบ <Icon name="next" size={20} />
        </button>
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> เลือกทีมใหม่
        </button>
      </div>
    </div>
  );
}

export function KickScreen() {
  const [team, setTeam] = useState<TeamId | null>(null);
  const [round, setRound] = useState(0);
  if (team === null) {
    return (
      <TeamPicker
        onPick={(id) => {
          setTeam(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <KickRound key={round} team={teamById(team)} onPlayAgain={() => setTeam(null)} />;
}
