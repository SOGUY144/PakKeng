import { useState } from "react";
import { Bunny, CollectibleIcon, GameThumb } from "../components/Art";
import { Disclaimer, ViewSwitch } from "../components/Chrome";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { COLLECTIBLES, nextCollectible, practiceSecToday, totalStars } from "../data/analytics";
import { fmtDuration, isSameDay } from "../data/format";
import { missionGame } from "../data/plan";
import { GAME_LABEL, LEVEL_LABEL, type GameId } from "../data/schema";
import { findChild, useDB } from "../data/store";
import { navigate } from "../lib/router";
import { useConnection } from "../signal/mock";

const GAME_DESC: Record<GameId, string> = {
  runner: "พูดลากเสียงยาว ให้กระต่ายวิ่งหนีเพื่อนเมฆ",
  balloon: "พูดค้างไว้ ให้บอลลูนลอยในโซน",
  frog: "พูดทีละพยางค์ ให้กบกระโดดทีละก้าว",
};

const GAMES: GameId[] = ["runner", "balloon", "frog"];

export function HomeScreen() {
  const db = useDB();
  const child = findChild(db, db.activeChildId);
  const plan = child.plan;
  const conn = useConnection();
  const [deviceInfo, setDeviceInfo] = useState(false);
  const now = new Date();
  const doneSec = practiceSecToday(db, child.id, now);
  const targetSec = plan.dailyMinutes * 60;
  const progress = Math.min(1, doneSec / targetSec);
  const stars = totalStars(db, child);
  const next = nextCollectible(stars);
  const mission = missionGame(plan);
  const cal = db.calibrations[child.id];
  const calToday = cal ? isSameDay(new Date(cal.at), now) : false;

  const deviceText =
    conn === "connected" ? "สัญญาณจำลอง" : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "อุปกรณ์หลุด (จำลอง)";

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page">
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
              โหมดเดโม · {deviceText}
            </button>
            {deviceInfo ? (
              <p id="device-info" className="device__info">
                ยังไม่ได้ต่ออุปกรณ์จริง ค่าในเกมมาจากเครื่องมือเดโมด้านล่างของหน้าเกม
              </p>
            ) : null}
          </div>
        </header>

        <section className="card mission" aria-labelledby="mission-title">
          <div className="mission__top">
            <span className="mission__label">ภารกิจวันนี้</span>
            <span className="badge">ครูตั้งให้</span>
          </div>
          <h2 id="mission-title" className="mission__title">
            ด่านที่ {plan.level} · {LEVEL_LABEL[plan.level]}
          </h2>
          <ul className="chips" aria-label="ชุดคำ">
            {plan.words.map((w) => (
              <li key={w} className="chip">
                {w}
              </li>
            ))}
          </ul>
          <p className="mission__meta">
            <span>
              <Icon name="clock" size={16} /> เป้าหมาย {plan.dailyMinutes} นาที
            </span>
            <span>
              <Icon name="target" size={16} /> เกณฑ์ออกปาก {plan.oralThreshold}%
            </span>
            {plan.gateEnabled ? (
              <span>
                <Icon name="nose" size={16} /> ด่านประตู ≥ {plan.gateThreshold}%
              </span>
            ) : null}
          </p>
          <div className="mission__progress">
            <div className="progress" role="progressbar" aria-label="เวลาฝึกวันนี้" aria-valuemin={0} aria-valuemax={targetSec} aria-valuenow={Math.round(doneSec)}>
              <div className="progress__fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
            <span className="mission__progresstext">
              {doneSec > 0 ? `ฝึกแล้ว ${fmtDuration(doneSec)} / ${plan.dailyMinutes} นาที` : `ยังไม่ได้ฝึกวันนี้ · 0 / ${plan.dailyMinutes} นาที`}
            </span>
          </div>
          {mission ? (
            <button type="button" className="btn btn--primary btn--lg btn--block mission__start" onClick={() => navigate(mission)}>
              <Icon name="play" size={22} /> เริ่มเล่น
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--lg btn--block" disabled>
              ครูยังไม่ได้เปิดเกม
            </button>
          )}
          {mission ? (
            <p className="mission__sub">
              เกมในภารกิจ: {GAME_LABEL[mission]}
              {mission === "runner" && plan.gateEnabled ? " + ด่านประตูเสียงนาสิก" : ""}
            </p>
          ) : null}
        </section>

        {!calToday ? (
          <p className="home-hint">
            <Icon name="info" size={18} />
            <span>ยังไม่ได้ปรับเครื่องวันนี้ แนะนำให้ปรับก่อนเล่นรอบแรก</span>
          </p>
        ) : null}

        <section aria-labelledby="games-title">
          <h2 id="games-title" className="section-title">
            เกมทั้งหมด
          </h2>
          <ul className="games">
            {GAMES.map((g) => {
              const open = plan.games[g];
              return (
                <li key={g}>
                  <button
                    type="button"
                    className={`game-card${open ? "" : " is-locked"}`}
                    onClick={() => open && navigate(g)}
                    aria-disabled={!open}
                    aria-describedby={`game-desc-${g}`}
                  >
                    <span className={`game-card__thumb game-card__thumb--${g}`}>
                      <RenderImg name={`thumb-${g}`} fallback={<GameThumb game={g} />} />
                      {!open ? (
                        <span className="game-card__lock">
                          <Icon name="lock" size={18} />
                        </span>
                      ) : null}
                    </span>
                    <span className="game-card__name">{GAME_LABEL[g]}</span>
                    <span id={`game-desc-${g}`} className="game-card__desc">
                      {open ? GAME_DESC[g] : "ครูยังไม่เปิดเกมนี้"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card collect" aria-labelledby="collect-title">
          <div className="collect__head">
            <h2 id="collect-title" className="section-title section-title--card">
              ของที่สะสมได้
            </h2>
            <span className="collect__stars">ดาวรวม {stars}</span>
          </div>
          <ul className="collect__items">
            {COLLECTIBLES.map((c) => {
              const unlocked = stars >= c.stars;
              return (
                <li key={c.id} className={`collect__item${unlocked ? "" : " is-locked"}`}>
                  <span className="collect__icon">
                    {unlocked ? <RenderImg name={`item-${c.id}`} fallback={<CollectibleIcon id={c.id} size={36} />} /> : <Icon name="lock" size={20} />}
                  </span>
                  <span className="collect__name">{unlocked ? c.name : `${c.stars} ดาว`}</span>
                </li>
              );
            })}
          </ul>
          {next ? (
            <div className="collect__next">
              <div className="progress progress--star" aria-hidden="true">
                <div className="progress__fill" style={{ transform: `scaleX(${Math.min(1, stars / next.stars)})` }} />
              </div>
              <span>
                อีก {next.stars - stars} ดาว ปลดล็อก{next.name}
              </span>
            </div>
          ) : (
            <p className="collect__next">ปลดล็อกครบทุกชิ้นแล้ว</p>
          )}
          <p className="collect__note">
            <span className="badge badge--sample">ตัวอย่าง</span> ดาวเริ่มต้นเป็นข้อมูลตัวอย่าง รวมกับดาวที่เก็บได้ในเดโม
          </p>
        </section>

        <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={() => navigate("calibrate")}>
          <Icon name="wave" size={20} /> ปรับเครื่องก่อนเล่น
        </button>

        <Disclaimer />
      </div>
    </div>
  );
}
