import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { flushSync } from "react-dom";
import { Bunny, CollectibleIcon, DoorPanel, GameThumb } from "../components/Art";
import { Disclaimer } from "../components/Chrome";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { childSessions, COLLECTIBLES, nextCollectible } from "../data/analytics";
import { EggArt, PetArt } from "../components/IslandArt";
import type { AvatarSpecies } from "../data/schema";
import { BEDS, bedView, eggView, ledgerOf, nowMs, PET_NAME, rewardsOf, starsFor } from "../data/rewards";
import { isSameDay } from "../data/format";
import type { Plan, Session } from "../data/schema";
import { findChild, useDB } from "../data/store";
import { isDoorAlone } from "../data/resultCards";
import { freshPlays, practiceDaysThisWeek, todayPath, type PathNode, type PathPlay } from "../data/todayPath";
import { haptics } from "../lib/haptics";
import { hrefFor, navigate, type Route } from "../lib/router";
import { signalKind, useConnection, useSignalSource } from "../signal/mock";
import "../styles/home.css";

type Play = PathPlay;

/** What each game invites the child to do — the verb is the label, the game's name comes second. */
/** The new game comes first (marked “ใหม่” until played once), then the four first games in their usual order. */
const PLAYS: { id: Play; verb: string; name: string; open: (p: Plan) => boolean }[] = [
  { id: "kick", verb: "ยิงจุดโทษ", name: "ฟุตบอล", open: (p) => p.games.kick },
  { id: "frog", verb: "เรียกเพื่อน", name: "กบข้ามบึง", open: (p) => p.games.frog },
  { id: "balloon", verb: "พาบอลลูนไปส่ง", name: "บอลลูน", open: (p) => p.games.balloon },
  { id: "runner", verb: "เลือกทางวิ่ง", name: "กระต่ายวิ่ง", open: (p) => p.games.runner },
  { id: "gate", verb: "เปิดประตู", name: "ประตูเสียงก้องจมูก", open: (p) => p.gateEnabled },
];
const VERB: Record<Play, string> = Object.fromEntries(PLAYS.map((p) => [p.id, p.verb])) as Record<Play, string>;

/** Zig-zag of the path, in steps of the node offset (×42px): down the middle, out right, back, out left… */
const ZIG = [0, 1, 1.6, 1, 0, -1, -1.6, -1];

/** Phone / portrait: game choice slides up in a sheet. Wide landscape: the cards already sit beside the path. */
const WIDE = "(min-width: 900px) and (orientation: landscape)";

function GateThumb() {
  return (
    <svg viewBox="0 0 120 84" width="100%" aria-hidden="true">
      <rect width="120" height="84" fill="#eee8ff" />
      <rect y="60" width="120" height="24" fill="#d8ccff" />
      <path d="M30 84V34a30 30 0 0 1 60 0v50z" fill="#ddd3e6" />
      <path d="M38 84V36a22 22 0 0 1 44 0v48z" fill="#fff6dc" />
      <g transform="translate(39 30) scale(0.42)">
        <DoorPanel side="left" />
      </g>
      <g transform="translate(60 30) scale(0.42)">
        <DoorPanel side="right" />
      </g>
    </svg>
  );
}

function PlayThumb({ play }: { play: Play }) {
  return <RenderImg name={`thumb-${play}`} fallback={play === "gate" ? <GateThumb /> : <GameThumb game={play} />} />;
}

/** The day's chest, rendered from the 3D chest model (2D drawing if the image cannot load). */
function ChestPic({ open }: { open: boolean }) {
  return <RenderImg key={open ? "open" : "shut"} name={open ? "chest-open" : "chest-closed"} fallback={<ChestArt open={open} />} />;
}

/**
 * The road under the path: measured from where the nodes actually are (zig-zag, bubble, labels), drawn behind them.
 * The part up to the step to play is coloured, so the path reads as one road being walked, not loose buttons.
 */
function TrailRoad({ listRef, reached, layoutKey }: { listRef: RefObject<HTMLOListElement | null>; reached: number; layoutKey: string }) {
  const [road, setRoad] = useState<{ w: number; h: number; pts: [number, number][] }>({ w: 0, h: 0, pts: [] });
  useLayoutEffect(() => {
    const ol = listRef.current;
    if (!ol) return;
    const measure = () => {
      const box = ol.getBoundingClientRect();
      const pts = [...ol.querySelectorAll<HTMLElement>(".trail__node")].map((n): [number, number] => {
        const b = n.getBoundingClientRect();
        return [Math.round(b.left + b.width / 2 - box.left), Math.round(b.top + b.height / 2 - box.top)];
      });
      setRoad({ w: Math.round(box.width), h: Math.round(box.height), pts });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [listRef, layoutKey]);
  if (road.pts.length < 2) return null;
  const curve = (pts: [number, number][]) =>
    pts
      .map(([x, y], i) => {
        if (i === 0) return `M${x} ${y}`;
        const [px, py] = pts[i - 1];
        const my = (py + y) / 2;
        return `C${px} ${my} ${x} ${my} ${x} ${y}`;
      })
      .join(" ");
  const all = curve(road.pts);
  const walked = curve(road.pts.slice(0, Math.min(road.pts.length, reached + 1)));
  return (
    <svg className="trail__road" width={road.w} height={road.h} viewBox={`0 0 ${road.w} ${road.h}`} aria-hidden="true">
      <path d={all} className="trail__road-edge" />
      <path d={all} className="trail__road-top" />
      {reached > 0 ? <path d={walked} className="trail__road-walked" /> : null}
      <path d={all} className="trail__road-dash" />
    </svg>
  );
}

/** A small clay chest for the end of the path (lid lifted once the day's rounds are done). */
function ChestArt({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 64 56" width="100%" aria-hidden="true">
      <rect x="6" y="26" width="52" height="26" rx="6" fill={open ? "#e8a33a" : "#c9c3d8"} />
      <rect x="6" y="26" width="52" height="7" fill={open ? "#c9832a" : "#b3acc6"} />
      {open ? (
        <>
          <ellipse cx="32" cy="24" rx="20" ry="6" fill="#fff3b0" />
          <path d="M8 22 Q32 -2 56 22 L56 18 Q32 -8 8 18Z" fill="#f2b84b" />
        </>
      ) : (
        <path d="M6 28 Q32 4 58 28Z" fill="#d6d0e3" />
      )}
      <rect x="27" y="30" width="10" height="12" rx="3" fill={open ? "#fff3b0" : "#e9e5f5"} />
    </svg>
  );
}

/** The last round played in this demo, if its game is still in the plan: marked "play on" among the choices. */
function lastPlay(sessions: Session[], plan: Plan): Play | null {
  const last = sessions.filter((s) => s.source !== "sample").at(-1);
  if (!last) return null;
  const play: Play = isDoorAlone(last) ? "gate" : last.game;
  return PLAYS.find((p) => p.id === play)?.open(plan) ? play : null;
}

/**
 * The game cards. With an odd number of games the first card takes a whole row (picture beside the verb, same height),
 * so no card is left alone on the last row (CSS reads data-count; desktop uses three columns).
 */
function GameCards({ plays, again, fresh, listRef }: { plays: typeof PLAYS; again: Play | null; fresh: Play[]; listRef?: RefObject<HTMLUListElement | null> }) {
  return (
    <ul className="plays" data-count={plays.length} ref={listRef}>
      {plays.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className={`play-card play-card--${p.id}`}
            onClick={() => {
              haptics.buzz("tap");
              navigate(p.id as Route);
            }}
          >
            {fresh.includes(p.id) ? <span className="play-card__new">ใหม่</span> : null}
            {again === p.id ? <span className="play-card__again">เล่นต่อ</span> : null}
            <span className="play-card__pic">
              <PlayThumb play={p.id} />
            </span>
            <span className="play-card__verb">{p.verb}</span>
            <span className="sr-only">
              {p.name}
              {fresh.includes(p.id) ? " เกมใหม่" : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Modal layer shared by the game sheet and the chest: Esc / backdrop closes, focus moves in and back out. */
function useDialog(onClose: () => void, firstRef: RefObject<HTMLElement | null>, returnTo: RefObject<HTMLElement | null>) {
  // the latest onClose without re-running the open/close effect on every Home render (focus must not jump)
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // a passive effect on purpose: its cleanup runs after the page behind is no longer inert, so focus can go back
  useEffect(() => {
    // returnTo is set by whoever opened the dialog *before* opening it: once the page behind turns inert the
    // browser has already dropped focus from the opener, so document.activeElement is no longer it here
    const back = returnTo.current;
    (firstRef.current?.querySelector("button") ?? firstRef.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      back?.focus();
    };
  }, [firstRef, returnTo]);
}

function GameSheet({ plays, again, fresh, onClose, returnTo }: { plays: typeof PLAYS; again: Play | null; fresh: Play[]; onClose: () => void; returnTo: RefObject<HTMLElement | null> }) {
  const list = useRef<HTMLUListElement>(null);
  useDialog(onClose, list, returnTo);
  return (
    <div className="home-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="home-sheet__card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="home-sheet__head">
          <h2 id="sheet-title">รอบนี้เล่นอะไรดี?</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิด">
            <Icon name="close" size={20} />
          </button>
        </div>
        <GameCards plays={plays} again={again} fresh={fresh} listRef={list} />
      </div>
    </div>
  );
}

/** The child's own character (picked on the island), full body · falls back to the bunny, then to nothing. */
function MeImg({ species }: { species: AvatarSpecies }) {
  const bunny = <RenderImg name="hero-bunny" fallback={<RenderImg name="avatar-bunny" fallback={null} />} />;
  return species === "bunny" ? bunny : <RenderImg key={species} name={`hero-${species}`} fallback={bunny} />;
}

function ChestDialog({ starsToday, nextText, onMore, onClose, returnTo, me }: { starsToday: number; nextText: string; onMore: (() => void) | null; onClose: () => void; returnTo: RefObject<HTMLElement | null>; me: AvatarSpecies }) {
  const card = useRef<HTMLDivElement>(null);
  useDialog(onClose, card, returnTo);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={card} className="overlay__card home-chest" role="dialog" aria-modal="true" aria-labelledby="chest-title">
        <span className="home-chest__bunny" aria-hidden="true">
          <MeImg species={me} />
        </span>
        <h2 id="chest-title">ครบรอบวันนี้แล้ว!</h2>
        <p className="home-chest__stars">
          <Icon name="star" size={22} /> วันนี้ได้ {starsToday} ดาว
        </p>
        <p className="overlay__text">{nextText}</p>
        <div className="overlay__actions">
          {onMore ? (
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onMore}>
              <Icon name="play" size={20} /> เล่นเพิ่ม
            </button>
          ) : null}
          <button type="button" className="link-btn" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function nodeLabel(n: PathNode): string {
  if (n.kind === "mic") return n.state === "done" ? "เช็กไมค์แล้ววันนี้" : "เช็กไมค์";
  if (n.kind === "chest") return n.state === "open" ? "หีบรางวัล เปิดแล้ว" : "หีบรางวัล ยังไม่เปิด";
  if (n.state === "done") return `รอบที่ ${n.round} ${n.play ? VERB[n.play] : ""}แล้ว`;
  if (n.state === "current") return `รอบที่ ${n.round} เริ่มเลย`;
  return `รอบที่ ${n.round} ยังไม่ถึง`;
}

export function HomeScreen() {
  const db = useDB();
  const child = findChild(db, db.activeChildId);
  const plan = child.plan;
  const conn = useConnection();
  const src = useSignalSource();
  const [deviceInfo, setDeviceInfo] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [chest, setChest] = useState(false);
  const [nudge, setNudge] = useState(false);
  const nudgeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);
  const startRef = useRef<HTMLButtonElement>(null);
  const chestRef = useRef<HTMLButtonElement>(null);
  const chooseRef = useRef<HTMLUListElement>(null);
  /** Where focus goes back when the game sheet closes: the current step, or "เล่นเพิ่ม" / the chest once the day is done. */
  const sheetOpener = useRef<HTMLElement | null>(null);

  const now = new Date();
  const sessions = childSessions(db, child.id);
  const cal = db.calibrations[child.id];
  const calToday = cal ? isSameDay(new Date(cal.at), now) : false;
  const path = todayPath({ dailyMinutes: plan.dailyMinutes, sessions, calibratedToday: calToday, now });
  const weekDays = practiceDaysThisWeek(sessions, now);
  // stars of the current signal source only (demo play and real-device practice are kept apart)
  const source = signalKind();
  const stars = starsFor(db, child, source);
  const ledger = ledgerOf(rewardsOf(db, child.id), source);
  // the child's character (chosen on the island) stands on the path and in the header
  const me = rewardsOf(db, child.id).species;
  const egg = eggView(db, child.id, source, ledger);
  const ripe = Array.from({ length: BEDS }, (_, i) => bedView(db, child.id, source, ledger, i, nowMs(source))).filter((b) => b.ready).length;
  const islandHint = egg?.ready
    ? "ไข่พร้อมฟักแล้ว!"
    : ripe > 0
      ? "มีผักพร้อมเก็บแล้ว!"
      : egg
        ? `ลองพูดอีก ${egg.need - egg.tries} ครั้ง ${PET_NAME[egg.pet]}จะออกมา`
        : ledger.pets.length === 0
          ? "เลือกสัตว์เลี้ยงตัวแรกได้เลย"
          : "สัตว์เลี้ยง สวน และตู้เสื้อผ้า";
  const next = nextCollectible(stars);
  const plays = PLAYS.filter((p) => p.open(plan));
  const closed = PLAYS.length - plays.length;
  const again = lastPlay(sessions, plan);
  const fresh = freshPlays(sessions, child.id);
  const trailRef = useRef<HTMLOListElement>(null);
  // how far along the road the child has come: the step to play (or, once the day is done, the chest)
  const here = path.nodes.findIndex((n) => n.state === "current");
  const walked = path.complete ? path.nodes.length - 1 : Math.max(0, here);
  const demo = src.kind === "mock";
  // the seed keeps a placeholder (child codes only, no real names): greet without it until an adult sets one
  const named = child.nickname.trim() !== "" && !child.nickname.startsWith("[");
  const deviceText = conn === "connected" ? (demo ? "สัญญาณจำลอง" : "ต่ออุปกรณ์แล้ว") : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "อุปกรณ์หลุด";
  const nextText = next ? `อีก ${next.stars - stars} ดาว ได้${next.name}` : "สะสมของครบทุกชิ้นแล้ว";

  /**
   * Start a round: one game → straight in; wide screens → the cards beside the path; otherwise the sheet.
   * `opener` is the button that asked (Safari does not focus a clicked button, so it is passed, not read from focus).
   */
  const start = (opener: HTMLElement | null) => {
    if (plays.length === 0) return;
    if (plays.length === 1) {
      navigate(plays[0].id as Route);
      return;
    }
    if (window.matchMedia(WIDE).matches && chooseRef.current) {
      chooseRef.current.scrollIntoView({ block: "nearest" });
      chooseRef.current.querySelector("button")?.focus();
      // the cards are already on screen: a short glow shows where the step "went"
      setNudge(true);
      window.clearTimeout(nudgeTimer.current);
      nudgeTimer.current = window.setTimeout(() => setNudge(false), 1400);
      return;
    }
    sheetOpener.current = opener;
    setSheet(true);
  };
  const closeSheet = () => setSheet(false);
  const closeChest = () => setChest(false);

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page home" inert={sheet || chest ? true : undefined}>
        <div className="home-top">
          <div className="device">
            <button
              type="button"
              className={`device__pill device__pill--${conn}`}
              aria-expanded={deviceInfo}
              aria-controls="device-info"
              onClick={() => setDeviceInfo((v) => !v)}
            >
              <span className="device__dot" aria-hidden="true" />
              {demo ? "โหมดสาธิต" : "อุปกรณ์จริง"}
              <span className="sr-only">: {deviceText}</span>
            </button>
            {deviceInfo ? (
              <p id="device-info" className="device__info">
                {deviceText} ·{" "}
                {demo
                  ? "ยังไม่ได้ต่ออุปกรณ์จริง ค่าในเกมมาจากเครื่องมือสาธิตในมุมผู้ดูแลของแต่ละเกม"
                  : "ค่าในเกมมาจากอุปกรณ์ ESP32 ที่ต่อไว้ ดูสถานะไมค์ได้ในมุมผู้ดูแลของแต่ละเกม"}
              </p>
            ) : null}
          </div>
          <a className="home-top__adult" href={hrefFor("dashboard")}>
            <Icon name="user" size={16} /> สำหรับครู
          </a>
        </div>

        <header className="home-head">
          <span className="avatar" aria-hidden="true">
            <RenderImg key={me} name={`avatar-${me}`} fallback={<RenderImg name="avatar-bunny" fallback={<Bunny size={40} cap />} />} />
          </span>
          <div className="home-head__who">
            {named ? <p className="home-head__hello">สวัสดี</p> : null}
            <h1 className="home-head__name">{named ? `น้อง${child.nickname}` : "สวัสดีจ้า!"}</h1>
          </div>
          <div className="home-head__stats">
            <span className="home-stat home-stat--stars" aria-label={`ดาว ${stars} ดวง`}>
              <Icon name="star" size={18} /> {stars}
            </span>
            <span className="home-stat home-stat--days" aria-label={`สัปดาห์นี้ฝึกแล้ว ${weekDays} จาก 7 วัน`}>
              <Icon name="flag" size={16} /> ฝึก {weekDays}/7 วัน
            </span>
          </div>
        </header>

        <section className={`home-today${path.complete ? " is-complete" : ""}`} aria-label="วันนี้">
          <p className="home-today__text">
            <strong>
              วันนี้ {Math.min(path.played, path.rounds)} / {path.rounds} รอบ
            </strong>
            <span>{path.complete ? "ครบรอบที่ตั้งไว้แล้ว!" : `อีก ${path.rounds - path.played} รอบ`}</span>
          </p>
          <div className="home-today__track">
            <div className="progress home-today__bar" role="progressbar" aria-label="รอบฝึกวันนี้" aria-valuemin={0} aria-valuemax={path.rounds} aria-valuenow={Math.min(path.played, path.rounds)}>
              <div className="progress__fill" style={{ transform: `scaleX(${Math.min(1, path.played / Math.max(1, path.rounds))})` }} />
            </div>
            {/* the reward at the end of the bar: always in view (the banner stays on top while the path scrolls) */}
            <span className="home-today__chest" aria-hidden="true">
              <ChestPic open={path.complete} />
            </span>
          </div>
          <p className="home-today__minutes">
            เวลาฝึกที่บันทึก {Math.floor(path.practiceSec / 60)} นาที · ครูตั้งไว้ {plan.dailyMinutes} นาที ({path.rounds} รอบ)
          </p>
        </section>

        <section className="home-path" aria-labelledby="path-title">
          <h2 id="path-title" className="sr-only">
            เส้นทางวันนี้
          </h2>
          <div className="trail-wrap">
            <ol className="trail" ref={trailRef}>
              {path.nodes.map((n, i) => {
                const x = ZIG[i % ZIG.length];
                const style = { "--x": x } as CSSProperties;
                const label = nodeLabel(n);
                const cls = `trail__node trail__node--${n.kind} is-${n.state}${n.play ? ` trail__node--${n.play}` : ""}`;
                return (
                  <li key={`${n.kind}-${n.round ?? i}`} className="trail__step" style={style} aria-current={n.state === "current" ? "step" : undefined}>
                    {n.kind === "mic" ? (
                      <button type="button" className={cls} onClick={() => navigate("calibrate")} aria-label={label}>
                        <Icon name={n.state === "done" ? "check" : "mic"} size={28} />
                      </button>
                    ) : null}

                    {n.kind === "round" && n.state === "current" ? (
                      <>
                        <span className="trail__bubble" aria-hidden="true">
                          {plays.length === 0 ? "รอครูเปิดเกม" : "เริ่ม!"}
                        </span>
                        <button ref={startRef} type="button" className={cls} onClick={(e) => start(e.currentTarget)} disabled={plays.length === 0} aria-label={plays.length === 0 ? `รอบที่ ${n.round} รอครูเปิดเกม` : label}>
                          <svg className="trail__ring" viewBox="0 0 100 100" aria-hidden="true">
                            <circle cx="50" cy="50" r="46" className="trail__ring-track" />
                            <circle cx="50" cy="50" r="46" className="trail__ring-fill" strokeDasharray={`${path.progress * 289} 289`} transform="rotate(-90 50 50)" />
                          </svg>
                          <Icon name="play" size={34} />
                        </button>
                        <span className={`trail__buddy trail__buddy--${x >= 0 ? "left" : "right"}`} aria-hidden="true">
                          <MeImg species={me} />
                        </span>
                      </>
                    ) : null}

                    {n.kind === "round" && n.state !== "current" ? (
                      <span className={cls} role="img" aria-label={label}>
                        {n.state === "done" && n.play ? (
                          <>
                            {/* a sticker of the game played in that round (rendered from its 3D scene), with a tick */}
                            <span className="trail__sticker">
                              <RenderImg name={`thumb-${n.play}`} fallback={<Icon name="check" size={30} />} />
                            </span>
                            <span className="trail__tick">
                              <Icon name="check" size={14} />
                            </span>
                          </>
                        ) : (
                          <Icon name={n.state === "done" ? "check" : "lock"} size={n.state === "done" ? 30 : 22} />
                        )}
                      </span>
                    ) : null}

                    {n.kind === "chest" ? (
                      n.state === "open" ? (
                        <>
                          <button
                          ref={chestRef}
                          type="button"
                          className={cls}
                          onClick={() => {
                            // the day's chest: one reward buzz per child per day (opening it again later stays quiet)
                            haptics.buzz("reward", { key: `chest:${child.id}:${source}:${now.toDateString()}` });
                            setChest(true);
                          }}
                          aria-label={label}
                        >
                            <ChestPic open />
                          </button>
                          {/* the day is done: the bunny comes to stand by the chest */}
                          <span className={`trail__buddy trail__buddy--${x >= 0 ? "left" : "right"}`} aria-hidden="true">
                            <MeImg species={me} />
                          </span>
                        </>
                      ) : (
                        <span className={cls} role="img" aria-label={label}>
                          <ChestPic open={false} />
                        </span>
                      )
                    ) : null}

                    <span className="trail__label" aria-hidden="true">
                      {n.kind === "mic" ? "เช็กไมค์" : n.kind === "chest" ? "หีบรางวัล" : `รอบ ${n.round}`}
                    </span>
                  </li>
                );
              })}
            </ol>
            {/* after the list: its ref is set before this measures (drawn behind it with z-index) */}
            <TrailRoad listRef={trailRef} reached={walked} layoutKey={`${path.nodes.map((n) => n.state).join()}|${plays.length}`} />
          </div>
          {plays.length === 0 ? <p className="home-path__note">ครูยังไม่ได้เปิดเกม ให้ผู้ใหญ่ช่วยดูแผนการฝึกนะ</p> : null}
          {path.complete && plays.length > 0 ? (
            <button type="button" className="btn btn--secondary home-more" onClick={(e) => start(e.currentTarget)}>
              <Icon name="play" size={18} /> เล่นเพิ่ม
            </button>
          ) : null}
        </section>

        {plays.length > 0 ? (
          <section className={`home-choose${nudge ? " is-nudged" : ""}`} aria-labelledby="choose-title">
            <h2 id="choose-title" className="home-choose__title">
              รอบนี้เล่นอะไรดี?
            </h2>
            <GameCards plays={plays} again={again} fresh={fresh} listRef={chooseRef} />
          </section>
        ) : null}

        <section className="collect-strip" aria-labelledby="collect-title">
          <h2 id="collect-title" className="collect-strip__title">
            ของสะสม
            {/* the item's name never breaks across lines (ผ้าพัน|คอ) */}
            <small>
              {next ? (
                <>
                  อีก {next.stars - stars} ดาว <span className="nowrap">ได้{next.name}</span>
                </>
              ) : (
                "ครบทุกชิ้นแล้ว"
              )}
            </small>
          </h2>
          <ul className="collect-strip__items">
            {COLLECTIBLES.map((c) => {
              const unlocked = stars >= c.stars;
              return (
                <li key={c.id} className={`collect-strip__item${unlocked ? "" : " is-locked"}`} title={unlocked ? c.name : `${c.stars} ดาว`}>
                  {unlocked ? <RenderImg name={`item-${c.id}`} fallback={<CollectibleIcon id={c.id} size={32} />} /> : <Icon name="lock" size={18} />}
                  <span className="sr-only">{unlocked ? c.name : `ล็อก ${c.stars} ดาว`}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <a className="home-island" href={hrefFor("island")}>
          <span className="home-island__pic" aria-hidden="true">
            {/* the egg at its crack stage, or the buddy pet: stills of the island's own 3D models */}
            {egg ? (
              <RenderImg key={`egg-${egg.kind}-${egg.crack}`} name={`egg-${egg.kind}-${egg.crack}`} fallback={<EggArt kind={egg.kind} crack={egg.crack} size={52} />} />
            ) : (
              <RenderImg key={`pet-${ledger.buddy ?? "puppy"}`} name={`pet-${ledger.buddy ?? "puppy"}`} fallback={<PetArt kind={ledger.buddy ?? "puppy"} size={52} />} />
            )}
          </span>
          <span className="home-island__text">
            <strong>เกาะของฉัน</strong>
            <small>{islandHint}</small>
          </span>
          <Icon name="next" size={20} />
        </a>

        <footer className="home-foot">
          {closed > 0 && plays.length > 0 ? <p>เกมอื่นจะเปิดเมื่อครูตั้งไว้ในแผน</p> : null}
          <p>
            รหัสเด็ก {child.id} · เส้นทางวันนี้มี {path.rounds} รอบ ตามเวลาฝึก {plan.dailyMinutes} นาทีที่ครูตั้ง (นับรอบที่ได้ลองพูด) · ดาวและวันที่ฝึกมีข้อมูลตัวอย่างรวมอยู่
          </p>
          <Disclaimer />
        </footer>
      </div>

      {sheet ? <GameSheet plays={plays} again={again} fresh={fresh} onClose={closeSheet} returnTo={sheetOpener} /> : null}
      {chest ? (
        <ChestDialog
          me={me}
          starsToday={path.starsToday}
          nextText={nextText}
          onMore={
            plays.length > 0
              ? () => {
                  // close the chest first so its focus-return and the inert page are done before start() moves focus
                  flushSync(() => setChest(false));
                  start(chestRef.current);
                }
              : null
          }
          onClose={closeChest}
          returnTo={chestRef}
        />
      ) : null}
    </div>
  );
}
