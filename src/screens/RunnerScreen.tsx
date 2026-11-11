import { useEffect, useMemo, useRef, useState } from "react";
import { Bunny, CloudPal, StarShape } from "../components/Art";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { Destination, RouteFlag } from "../components/RouteArt";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { outfitOf, rewardsOf, speciesName } from "../data/rewards";
import { promptFor } from "../data/plan";
import { finishRound, setPendingRunner } from "../data/rounds";
import { ROUTES, routeById, routePoints, type Route, type RouteId } from "../data/routes";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { showToast } from "../lib/toast";
import type { CallIssue, CallItem } from "../logic/call";
import { ROUTE_LEGS, RouteRun } from "../logic/route";
import { useConnection, useSignalSource, signalKind } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine } from "./callStatus";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/runner.css";

const RUN_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

/**
 * "วันนี้จะวิ่งไปทางไหน" — two routes as two little worlds (stills rendered from the round's own 3D models:
 * the same flags, landmark and the child's character). Phones stack them, wider screens set them side by side.
 * While a still loads its card keeps its shape; if it cannot load, a light 2D picture stands in (the pick still works).
 */
function RoutePicker({ legs, onPick }: { legs: number; onPick: (id: RouteId) => void }) {
  const child = useActiveChild();
  const db = useDB();
  const species = rewardsOf(db, child.id).species;
  const hero = speciesName(species);
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick pick--map">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะวิ่งไปทางไหน?</h1>
        <ul className="route-cards">
          {ROUTES.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`route-card route-card--${r.id}`}
                style={{ ["--flag" as string]: r.flag, ["--flag-deep" as string]: r.flagDeep }}
                onClick={() => onPick(r.id)}
                aria-label={`${r.name} วิ่งผ่าน ${legs - 1} ธง ไปถึง${r.destination}`}
              >
                <span className="route-card__pic">
                  <RenderImg
                    key={species}
                    name={`route-${r.id}-${species}`}
                    fallback={
                      <span className="route-card__flat">
                        <Destination route={r} size={96} />
                        <span className="route-card__flat-note">ฉาก 3D ยังไม่พร้อม ใช้ภาพเบาแทนได้</span>
                      </span>
                    }
                  />
                </span>
                <span className="route-card__text" aria-hidden="true">
                  <span className="route-card__name" lang="th">
                    {r.name}
                  </span>
                  <span className="route-card__dest" lang="th">
                    <RouteFlag color={r.flag} size={22} />
                    ไป{r.destination}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pick__note">พูดแล้ว{hero}วิ่งทันที หนีเพื่อนเมฆไปให้ถึงปลายทาง</p>
      </div>
    </div>
  );
}

/** 2D fallback: the same route as a strip — flags come in from the right, the bunny runs one leg per word. */
function Route2D({ run, route }: { run: RouteRun; route: Route }) {
  const legs = run.legs;
  return (
    <div className="stage2d route2d">
      <div className="route2d__path" aria-hidden="true" />
      {Array.from({ length: legs }, (_, i) => i + 1).map((k) => {
        const x = 34 + (k - run.pos) * 48;
        if (x < -30 || x > 130) return null;
        return (
          <div key={k} className={k === legs ? "route2d__goal" : "route2d__flag"} style={{ left: `${x}%` }} aria-hidden="true">
            {k === legs ? <Destination route={route} size={140} /> : <RouteFlag color={route.flag} size={72} />}
          </div>
        );
      })}
      <div className={`route2d__bunny${run.running || run.dashing ? " is-running" : ""}`} aria-hidden="true">
        <Bunny size={88} />
      </div>
      <div className="route2d__pal" style={{ left: `${34 - 8 - 22 * run.gap}%` }} aria-hidden="true">
        <CloudPal size={64} />
      </div>
    </div>
  );
}

function RouteRound({ route, onPlayAgain }: { route: Route; onPlayAgain: () => void }) {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const conn = useConnection();
  useSignalSource();
  const care = useCareDrawer();
  const startedAt = useRef(new Date().toISOString());
  const [adultModel, setAdultModel] = useState(false);
  const [, setVoices] = useState(0);
  const points = useMemo(() => routePoints(route, ROUTE_LEGS), [route]);
  // the line under the word names the child's own character (กระต่าย / ลูกหมา / ไดโน / แมวเหมียว)
  const hero = useMemo(() => speciesName(rewardsOf(db, child.id).species), [db, child.id]);
  const items = useMemo<CallItem[]>(() => {
    const prompts = (plan.words.length ? plan.words : ["ปา"]).map((w) => promptFor(w, plan.level));
    return Array.from({ length: ROUTE_LEGS }, (_, k) => ({ id: String(k), word: prompts[k % prompts.length], resonance: "oral" }));
  }, [plan.words, plan.level]);

  useEffect(() => subscribeVoices(() => setVoices((n) => n + 1)), []);
  useEffect(() => () => stopExample(), []);

  const rt = useGameRuntime(
    () => new RouteRun(items, plan.oralThreshold),
    (game, frame, now, dt) => game.update(frame, now, dt).some((e) => e.type === "finish"),
  );

  const { game, frame } = rt;
  const s = game.call.state;
  /** The point the bunny is heading for (1 … ROUTE_LEGS). */
  const target = game.running ? (game.leg?.to ?? 1) : Math.min(game.reached + 1, ROUTE_LEGS);
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const nextPoint = points[target - 1];
  const frozen = !frame.valid && !playing && !game.running;

  let line = callStatusLine(s, frame, adultModelling, kind, "", RUN_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: `ถึง${route.destination}แล้ว!` };
  else if (game.running) line = { tone: "heard", icon: "next", text: `วิ่งไป${nextPoint}…`, sub: "ระหว่างวิ่ง เกมยังไม่ฟัง" };
  else if (game.dashing)
    line =
      game.dash > 0.6
        ? { tone: "speak", icon: "next", text: "เกือบถึงธงแล้ว!", sub: `พูดจบคำ ${hero}จะวิ่งถึงธง` }
        : { tone: "speak", icon: "next", text: "วิ่งเลย!", sub: `พูดจนจบคำ ${hero}จะถึงธง` };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: `พูดแล้ว${hero}จะวิ่งหนีเพื่อนเมฆ` };

  useEffect(() => {
    if (rt.paused !== null) stopExample();
  }, [rt.paused]);

  const settleAudio = () => {
    stopExample();
    setAdultModel(false);
  };

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.done || g.running) return;
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
    rt.gameRef.current?.skip(performance.now());
  };

  const choice = { kind: "route" as const, id: route.id, label: `${route.name} ไป${route.destination}` };

  /** Save the round (or hand it to the door game when the plan has it on). */
  const save = (endedEarly: boolean, then: "result" | "gate" | "again") => {
    const g = game;
    if (g.attempts.length === 0 && g.reached === 0) {
      showToast("ยังไม่มีการพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    const practiceMs = g.call.state.practiceMs;
    if (then === "gate") {
      setPendingRunner({ childId: child.id, startedAt: startedAt.current, attempts: g.attempts, stars: g.stars, practiceMs, completed: g.done, choice, source });
      navigate("gate");
      return;
    }
    finishRound({ child, game: "runner", source: signalKind(), startedAt: startedAt.current, practiceMs, attempts: g.attempts, stars: g.stars, gate: null, choice, endedEarly });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกทางใหม่ได้เลย");
      onPlayAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const restart = () => {
    settleAudio();
    startedAt.current = new Date().toISOString();
    rt.restart();
  };

  // one round = one signal source: switching demo <-> device mid-round starts the round again (nothing is mixed)
  const source = useSourceGuard(restart);
  const look = useMemo(() => ({ outfit: outfitOf(db, child, source), species: rewardsOf(db, child.id).species }), [db, child, source]);

  const is3d = mode.kind === "3d";
  const blocked = rt.paused !== null || rt.ended;

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (game.running) primary = { label: "กำลังวิ่ง…", icon: "next", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.running;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--runner${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <World3D
                kind="runner"
                route={route.id}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
              />
            ) : (
              <Route2D run={game} route={route} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="route-trail" aria-label={`ถึงแล้ว ${game.reached} จาก ${ROUTE_LEGS} จุด`}>
                {points.map((p, i) => {
                  const k = i + 1;
                  const state = game.reached >= k ? "is-done" : target === k ? "is-current" : "is-next";
                  return (
                    <li key={p} className={`route-trail__point ${state}${k === ROUTE_LEGS ? " route-trail__point--goal" : ""}`} style={{ ["--flag" as string]: route.flag }}>
                      {k === ROUTE_LEGS ? <Destination route={route} size={30} /> : <span className="route-trail__dot" />}
                      <span className="sr-only">
                        {p} {game.reached >= k ? "ถึงแล้ว" : "ยังไม่ถึง"}
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

          <section className="world-dock world-dock--meadow" aria-label="คำของช่วงนี้">
            <button type="button" className="dock-pic dock-pic--flag" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              {game.reached >= ROUTE_LEGS - 1 && !game.done ? <Destination route={route} size={64} /> : <RouteFlag color={route.flag} size={58} />}
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">{game.done ? route.destination : `ไป${nextPoint}`}</p>
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

      <aside className="world-side" aria-label="เส้นทางและผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="route-title">
          <h2 id="route-title" className="side-card__title">
            {route.name}
          </h2>
          <ol className="side-list">
            {points.map((p, i) => {
              const k = i + 1;
              const reached = game.reached >= k;
              const now = !reached && target === k;
              const w = s.words[i];
              const state = reached ? (w?.skipped ? "ข้ามไป" : "ถึงแล้ว") : now ? (game.running ? "กำลังวิ่งไป" : `พูด “${w?.word ?? ""}”`) : "รอก่อน";
              return (
                <li key={p}>
                  <div className={`side-item${now ? " is-current" : ""}${reached ? " is-done" : ""}`}>
                    <span className="side-item__pic">{k === ROUTE_LEGS ? <Destination route={route} size={50} /> : <RouteFlag color={route.flag} size={44} />}</span>
                    <span className="side-item__name" lang="th">
                      {p}
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
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = พูดหนึ่งคำ ตัวละครวิ่งหนึ่งช่วง",
          }}
        >
          <p className="call-note">
            ตัวละครวิ่งต่อเมื่อเกมได้ยินเสียงที่สัญญาณใช้ได้ ข้ามช่วงได้โดยไม่เสียอะไร เกณฑ์ออกปาก {plan.oralThreshold}% ของผู้เชี่ยวชาญใช้บันทึกในหน้าผู้ดูแลเท่านั้น
            ไม่ได้ใช้ตัดสินในฉาก
          </p>
          <p className="call-note">
            พูดแล้ว {game.attempts.length} ครั้ง (สัญญาณใช้ได้) ถึงเกณฑ์ {game.attempts.filter((a) => a.passed).length} ครั้ง
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <RouteDone
          route={route}
          gate={plan.gateEnabled}
          onGate={() => save(false, "gate")}
          onResult={() => save(false, "result")}
          onAgain={() => save(false, "again")}
        />
      ) : null}
    </div>
  );
}

/** Arrived: the destination, then the door game (when the plan has it), the summary, or another route. */
function RouteDone({ route, gate, onGate, onResult, onAgain }: { route: Route; gate: boolean; onGate: () => void; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="route-done-title">
      <div className="overlay__card overlay__card--done">
        <Destination route={route} size={110} />
        <h2 id="route-done-title">ถึง{route.destination}แล้ว!</h2>
        <p className="overlay__text">วิ่ง{route.name}ครบ {ROUTE_LEGS} ช่วง</p>
        {gate ? (
          <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onGate}>
            ไปเปิดประตูต่อ <Icon name="next" size={20} />
          </button>
        ) : (
          <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
            ดูสรุปรอบ <Icon name="next" size={20} />
          </button>
        )}
        {gate ? (
          <button type="button" className="btn btn--secondary btn--block" onClick={onResult}>
            ดูสรุปรอบ
          </button>
        ) : null}
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> เลือกทางใหม่
        </button>
      </div>
    </div>
  );
}

export function RunnerScreen() {
  const [route, setRoute] = useState<RouteId | null>(null);
  const [round, setRound] = useState(0);
  if (route === null) {
    return (
      <RoutePicker
        legs={ROUTE_LEGS}
        onPick={(id) => {
          setRoute(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <RouteRound key={round} route={routeById(route)} onPlayAgain={() => setRoute(null)} />;
}
