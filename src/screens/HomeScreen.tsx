import { useState } from "react";
import { Bunny, CollectibleIcon, DoorPanel, GameThumb } from "../components/Art";
import { Disclaimer } from "../components/Chrome";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { childSessions, COLLECTIBLES, nextCollectible, practiceSecToday, totalStars } from "../data/analytics";
import { fmtDuration, isSameDay } from "../data/format";
import type { Plan, Session } from "../data/schema";
import { findChild, useDB } from "../data/store";
import { hrefFor, navigate, type Route } from "../lib/router";
import { useConnection, useSignalSource } from "../signal/mock";
import "../styles/home.css";

type Play = "frog" | "balloon" | "runner" | "gate";

/** What each game invites the child to do — the verb is the label, the game's name comes second. */
const PLAYS: { id: Play; verb: string; name: string; open: (p: Plan) => boolean }[] = [
  { id: "frog", verb: "เรียกเพื่อน", name: "กบข้ามบึง", open: (p) => p.games.frog },
  { id: "balloon", verb: "พาบอลลูนไปส่ง", name: "บอลลูน", open: (p) => p.games.balloon },
  { id: "runner", verb: "เลือกทางวิ่ง", name: "กระต่ายวิ่ง", open: (p) => p.games.runner },
  { id: "gate", verb: "เปิดประตู", name: "ประตูเสียงก้องจมูก", open: (p) => p.gateEnabled },
];

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

/** The last round played in this demo, if its game is still in the plan: "play on" from there. */
function lastRound(sessions: Session[], plan: Plan): { play: Play; text: string } | null {
  const last = sessions.filter((s) => s.source === "demo").at(-1);
  if (!last) return null;
  const play: Play = last.gate && last.attempts === 0 ? "gate" : last.game;
  if (!PLAYS.find((p) => p.id === play)?.open(plan)) return null;
  const c = last.choice;
  let text: string;
  if (last.call) text = `รอบที่แล้ว เพื่อนได้ยินหนู ${last.call.heard} ตัว`;
  else if (c?.kind === "route") text = `รอบที่แล้ว ${c.label}`;
  else if (c?.kind === "trip") text = `รอบที่แล้ว ส่งบอลลูนไป${c.label}`;
  else if (c?.kind === "door") text = `รอบที่แล้ว เปิด${c.label}`;
  else if (last.balloon) text = `รอบที่แล้ว ส่งบอลลูนได้ ${last.balloon.completed} ลูก`;
  else text = "รอบที่แล้ว";
  return { play, text };
}

export function HomeScreen() {
  const db = useDB();
  const child = findChild(db, db.activeChildId);
  const plan = child.plan;
  const conn = useConnection();
  const src = useSignalSource();
  const [deviceInfo, setDeviceInfo] = useState(false);
  const now = new Date();
  const doneSec = practiceSecToday(db, child.id, now);
  const targetSec = plan.dailyMinutes * 60;
  const progress = Math.min(1, doneSec / targetSec);
  const stars = totalStars(db, child);
  const next = nextCollectible(stars);
  const cal = db.calibrations[child.id];
  const calToday = cal ? isSameDay(new Date(cal.at), now) : false;
  const plays = PLAYS.filter((p) => p.open(plan));
  const closed = PLAYS.length - plays.length;
  const again = lastRound(childSessions(db, child.id), plan);
  const demo = src.kind === "mock";
  // the seed keeps a placeholder (child codes only, no real names): greet without it until an adult sets one
  const named = child.nickname.trim() !== "" && !child.nickname.startsWith("[");

  const deviceText = conn === "connected" ? (demo ? "สัญญาณจำลอง" : "ต่ออุปกรณ์แล้ว") : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "อุปกรณ์หลุด";

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page home">
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
            <RenderImg name="avatar-bunny" fallback={<Bunny size={40} cap />} />
          </span>
          <div className="home-head__who">
            {named ? <p className="home-head__hello">สวัสดี</p> : null}
            <h1 className="home-head__name">{named ? `น้อง${child.nickname}` : "สวัสดีจ้า!"}</h1>
          </div>
          <span className="home-stars" aria-label={`ดาว ${stars} ดวง`}>
            <Icon name="star" size={20} /> {stars}
          </span>
        </header>

        <section className="home-today" aria-label="เวลาฝึกวันนี้">
          <span className="home-today__icon" aria-hidden="true">
            <Icon name="clock" size={22} />
          </span>
          <p className="home-today__text">
            <small>วันนี้</small>
            <strong>
              {doneSec > 0 ? fmtDuration(doneSec) : "0"} / {plan.dailyMinutes} นาที
            </strong>
          </p>
          <div className="progress home-today__bar" role="progressbar" aria-label="เวลาฝึกวันนี้" aria-valuemin={0} aria-valuemax={targetSec} aria-valuenow={Math.round(doneSec)}>
            <div className="progress__fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
        </section>

        {again ? (
          <button type="button" className={`home-again home-again--${again.play}`} onClick={() => navigate(again.play as Route)}>
            <span className="home-again__pic">
              <PlayThumb play={again.play} />
            </span>
            <span className="home-again__text">
              <strong>เล่นต่อ: {PLAYS.find((p) => p.id === again.play)?.verb}</strong>
              <small>{again.text}</small>
            </span>
            <span className="home-again__go" aria-hidden="true">
              <Icon name="play" size={18} />
            </span>
          </button>
        ) : null}

        <section className="home-plays" aria-labelledby="plays-title">
          <h2 id="plays-title" className="home-plays__title">
            วันนี้อยากเล่นอะไร?
          </h2>
          {plays.length > 0 ? (
            <ul className="plays">
              {plays.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`play-card play-card--${p.id}`} onClick={() => navigate(p.id)}>
                    <span className="play-card__pic">
                      <PlayThumb play={p.id} />
                    </span>
                    <span className="play-card__verb">{p.verb}</span>
                    <span className="sr-only">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-plays__none">ครูยังไม่ได้เปิดเกม ให้ผู้ใหญ่ช่วยดูแผนการฝึกนะ</p>
          )}
        </section>

        <button type="button" className={`btn btn--lg btn--block home-check${calToday ? " btn--secondary is-done" : " btn--secondary"}`} onClick={() => navigate("calibrate")}>
          <Icon name={calToday ? "check" : "wave"} size={20} /> {calToday ? "เช็กไมค์แล้ววันนี้" : "เช็กไมค์ก่อนเล่น"}
        </button>

        <section className="collect-strip" aria-labelledby="collect-title">
          <h2 id="collect-title" className="collect-strip__title">
            ของสะสม
            <small>{next ? `อีก ${next.stars - stars} ดาว ได้${next.name}` : "ครบทุกชิ้นแล้ว"}</small>
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

        <footer className="home-foot">
          {closed > 0 && plays.length > 0 ? <p>เกมอื่นจะเปิดเมื่อครูตั้งไว้ในแผน</p> : null}
          <p>รหัสเด็ก {child.id} · ดาวเริ่มต้นเป็นข้อมูลตัวอย่าง รวมกับดาวที่เก็บได้ในเดโม</p>
          <Disclaimer />
        </footer>
      </div>
    </div>
  );
}

function PlayThumb({ play }: { play: Play }) {
  if (play === "gate") return <GateThumb />;
  return <RenderImg name={`thumb-${play}`} fallback={<GameThumb game={play} />} />;
}
