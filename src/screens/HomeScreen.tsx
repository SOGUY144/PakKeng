import { useState } from "react";
import { Bunny, CollectibleIcon, DoorPanel, GameThumb } from "../components/Art";
import { Disclaimer, ViewSwitch } from "../components/Chrome";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { childSessions, COLLECTIBLES, nextCollectible, practiceSecToday, totalStars } from "../data/analytics";
import { fmtDuration, isSameDay } from "../data/format";
import type { Plan, Session } from "../data/schema";
import { findChild, useDB } from "../data/store";
import { navigate, type Route } from "../lib/router";
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
      <rect width="120" height="84" fill="#cfe8b8" />
      <rect y="58" width="120" height="26" fill="#a3d47f" />
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

  const deviceText = conn === "connected" ? (demo ? "สัญญาณจำลอง" : "ต่ออุปกรณ์แล้ว") : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "อุปกรณ์หลุด";

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page home">
        <ViewSwitch current="kid" />

        <header className="home-head">
          <div className="home-head__who">
            <span className="avatar" aria-hidden="true">
              <RenderImg name="avatar-bunny" fallback={<Bunny size={40} cap />} />
            </span>
            <div>
              <p className="home-head__hello">สวัสดี</p>
              <h1 className="home-head__name">น้อง{child.nickname}</h1>
              <p className="home-head__code">รหัส {child.id}</p>
            </div>
          </div>
          <div className="device">
            <button
              type="button"
              className={`pill device__pill device__pill--${conn}`}
              aria-expanded={deviceInfo}
              aria-controls="device-info"
              onClick={() => setDeviceInfo((v) => !v)}
            >
              <span className="device__dot" aria-hidden="true" />
              {demo ? "โหมดสาธิต" : "อุปกรณ์จริง"}: {deviceText}
            </button>
            {deviceInfo ? (
              <p id="device-info" className="device__info">
                {demo
                  ? "ยังไม่ได้ต่ออุปกรณ์จริง ค่าในเกมมาจากเครื่องมือสาธิตในมุมผู้ดูแลของแต่ละเกม"
                  : "ค่าในเกมมาจากอุปกรณ์ ESP32 ที่ต่อไว้ ดูสถานะไมค์ได้ในมุมผู้ดูแลของแต่ละเกม"}
              </p>
            ) : null}
          </div>
        </header>

        <section className="home-today" aria-label="วันนี้">
          <div className="home-today__time">
            <p className="home-today__text">
              {doneSec > 0 ? `วันนี้ฝึกแล้ว ${fmtDuration(doneSec)} จาก ${plan.dailyMinutes} นาที` : `วันนี้ฝึกกัน ${plan.dailyMinutes} นาทีนะ`}
            </p>
            <div className="progress" role="progressbar" aria-label="เวลาฝึกวันนี้" aria-valuemin={0} aria-valuemax={targetSec} aria-valuenow={Math.round(doneSec)}>
              <div className="progress__fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
          </div>
          {again ? (
            <button type="button" className="home-again" onClick={() => navigate(again.play as Route)}>
              <span className="home-again__pic">
                <PlayThumb play={again.play} />
              </span>
              <span className="home-again__text">
                <strong>เล่นต่อ: {PLAYS.find((p) => p.id === again.play)?.verb}</strong>
                <small>{again.text}</small>
              </span>
              <Icon name="next" size={22} />
            </button>
          ) : null}
        </section>

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
                    <span className="play-card__name">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-plays__none">ครูยังไม่ได้เปิดเกม ให้ผู้ใหญ่ช่วยดูแผนการฝึกนะ</p>
          )}
          {closed > 0 && plays.length > 0 ? <p className="home-plays__note">เกมอื่นจะเปิดเมื่อครูตั้งไว้ในแผน</p> : null}
        </section>

        <button type="button" className={`btn btn--lg btn--block home-check${calToday ? " btn--secondary" : " btn--primary-soft"}`} onClick={() => navigate("calibrate")}>
          <Icon name="wave" size={20} /> {calToday ? "เช็กไมค์อีกครั้ง" : "เช็กไมค์ก่อนเล่น (ยังไม่ได้เช็กวันนี้)"}
        </button>

        <section className="collect-strip" aria-labelledby="collect-title">
          <h2 id="collect-title" className="collect-strip__title">
            <span className="collect-strip__stars">ดาว {stars} ดวง</span>
            {next ? <small>อีก {next.stars - stars} ดวง ได้{next.name}</small> : <small>สะสมครบทุกชิ้นแล้ว</small>}
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
          <p className="collect-strip__note">ดาวเริ่มต้นเป็นข้อมูลตัวอย่าง รวมกับดาวที่เก็บได้ในเดโม</p>
        </section>

        <Disclaimer />
      </div>
    </div>
  );
}

function PlayThumb({ play }: { play: Play }) {
  if (play === "gate") return <GateThumb />;
  return <RenderImg name={`thumb-${play}`} fallback={<GameThumb game={play} />} />;
}
