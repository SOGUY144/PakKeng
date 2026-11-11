import { CollectibleIcon, GameThumb, StarShape } from "../components/Art";
import { BarChart, type ChartBar } from "../components/BarChart";
import { FriendPicture, WordTable, WordTableNote } from "../components/CallParts";
import { CareSummary, Disclaimer } from "../components/Chrome";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { COLLECTIBLES, nextCollectible } from "../data/analytics";
import { outfitOf, rewardsOf, starsFor } from "../data/rewards";
import { useReducedMotion } from "../lib/hooks";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { fmtClock, fmtDayMonth, fmtPct, isSameDay } from "../data/format";
import { isDoorAlone, roundDid, roundRating } from "../data/resultCards";
import { getLastResultId } from "../data/rounds";
import type { FriendId } from "../data/callWords";
import { doorById } from "../data/doors";
import { routeById } from "../data/routes";
import { GAME_LABEL, LEVEL_LABEL, type Session } from "../data/schema";
import { findChild, storagePersisted, useDB } from "../data/store";
import { navigate, type Route } from "../lib/router";
import { nextStarHint, roundStars } from "../logic/scoring";
import "../styles/result.css";

/** A door-only round (played on its own, not after a run). */
const isGateRound = (s: Session) => isDoorAlone(s);

/** The event the child just achieved, in the words of its game (the headline of the kid's result). */
function achieved(s: Session): { title: string; sub: string } {
  const c = s.choice ?? null;
  if (s.call) {
    return s.call.heard > 0
      ? { title: `เพื่อนได้ยินหนู ${s.call.heard} ตัว!`, sub: `ไปหาเพื่อนในบึง ${s.call.target} ตัว` }
      : { title: "จบรอบแล้ว", sub: "รอบหน้ามาเรียกเพื่อนกันใหม่นะ" };
  }
  if (s.gate?.opened && c?.kind === "door") {
    const behind = doorById(c.id)?.behind.name;
    return { title: `เปิด${c.label}ได้แล้ว!`, sub: behind ? `ข้างหลังประตูคือ${behind}` : "เห็นสิ่งที่อยู่ข้างหลังประตูแล้ว" };
  }
  if (s.gate?.opened) return { title: "เปิดประตูได้แล้ว!", sub: "ด้วยเสียงก้องจมูกตามที่ครูตั้งไว้" };
  if (s.game === "balloon" && s.balloon) {
    const where = c?.kind === "trip" ? `ถึง${c.label}` : "ถึงหมุด";
    return { title: `ส่งบอลลูน${where} ${s.balloon.completed} ลูก!`, sub: s.balloon.completed >= s.balloon.target ? "ส่งครบทุกลูกแล้ว" : "พักแล้วค่อยส่งต่อรอบหน้าได้" };
  }
  if (s.game === "runner" && c?.kind === "route") {
    const r = routeById(c.id);
    return s.endedEarly ? { title: `วิ่ง${r.name}ไปได้ ${s.stars} ช่วง`, sub: `รอบหน้าไปให้ถึง${r.destination}กันนะ` } : { title: `ถึง${r.destination}แล้ว!`, sub: `วิ่ง${r.name}ครบทุกช่วง` };
  }
  if (s.game === "kick" && s.kick) {
    return s.kick.goals > 0
      ? { title: `ยิงเข้า ${s.kick.goals} ลูก!`, sub: c?.kind === "team" ? `เตะกับ${c.label}` : "ได้ถ้วยแล้ว" }
      : { title: "จบรอบแล้ว", sub: "รอบหน้ามายิงประตูกันใหม่นะ" };
  }
  if (isGateRound(s)) return { title: "ลองเปิดประตูแล้ว", sub: "ไว้รอบหน้ามาลองใหม่นะ" };
  return { title: "จบรอบแล้ว", sub: `ลองพูด ${s.attempts} ครั้ง` };
}

/** Per-game metric for the "5 ครั้งล่าสุด" chart. */
function metric(s: Session): number | null {
  if (s.game === "balloon") return s.balloon ? s.balloon.inZoneSec / Math.max(1, s.rounds) : null;
  return s.meanNasalOral === null ? null : 100 - s.meanNasalOral;
}

export function ResultScreen() {
  const db = useDB();
  const mode = stageMode(useGfx());
  const reduced = useReducedMotion();
  const id = getLastResultId();
  const session = db.sessions.find((x) => x.id === id);

  if (!session) {
    return (
      <div className="kid-screen">
        <div className="kid-frame kid-frame--page">
          <section className="card empty">
            <h1 className="empty__title">ยังไม่มีรอบที่เพิ่งเล่น</h1>
            <p>เล่นเกมให้จบหนึ่งรอบ แล้วสรุปจะแสดงที่นี่</p>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => navigate("home")}>
              กลับหน้าหลัก
            </button>
          </section>
        </div>
      </div>
    );
  }

  const child = findChild(db, session.childId);
  const r = roundRating(session);
  const stars = roundStars(r.got, r.of);
  const hint = nextStarHint(r.got, r.of);
  const now = new Date();
  const same = db.sessions
    .filter((x) => x.childId === child.id && x.game === session.game)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const upto = same.slice(0, same.findIndex((x) => x.id === session.id) + 1);
  const recent = upto.slice(-5);
  const roundToday = upto.filter((x) => x.source !== "sample" && isSameDay(new Date(x.startedAt), now)).length;
  const hasSample = recent.some((x) => x.source === "sample");

  const isBalloon = session.game === "balloon";
  const bars: ChartBar[] = recent.map((x) => {
    const v = metric(x);
    const current = x.id === session.id;
    const label = current ? "รอบนี้" : fmtDayMonth(new Date(x.startedAt));
    const valueText = v === null ? "ไม่มีข้อมูล" : isBalloon ? `${v.toFixed(1)} วินาที` : fmtPct(v);
    return {
      key: x.id,
      label,
      value: v,
      tone: current ? "current" : x.source === "sample" ? "sample" : "past",
      tip: `${label}: ${valueText}${x.source === "sample" ? " (ข้อมูลตัวอย่าง)" : x.source === "device" ? " (อุปกรณ์จริง)" : " (โหมดสาธิต)"}`,
    };
  });
  const prev = bars.slice(0, -1).filter((b) => b.value !== null).map((b) => b.value as number);
  const cur = bars[bars.length - 1]?.value ?? null;
  const trend =
    cur === null || prev.length === 0
      ? null
      : cur - prev.reduce((a, b) => a + b, 0) / prev.length >= (isBalloon ? 0.5 : 2)
        ? "กำลังดีขึ้น"
        : "ฝึกต่อเรื่อย ๆ นะ";

  // stars of this round's own source (demo includes the sample stars, as on Home and the island)
  const totalNow = starsFor(db, child, session.source === "device" ? "device" : "demo");
  const before = totalNow - session.stars;
  const newly = COLLECTIBLES.find((c) => c.stars > before && c.stars <= totalNow) ?? null;
  const next = nextCollectible(totalNow);

  const call = session.call ?? null;
  const event = achieved(session);
  const did = roundDid(session);
  // colour and icon of the game the card speaks for (a door the child never reached does not recolour a run)
  const tone = did.kind === "other" ? session.game : did.kind;
  const didIcon = did.kind === "frog" ? "ear" : did.kind === "balloon" ? "target" : did.kind === "gate" ? (session.gate?.opened ? "check" : "lock") : did.kind === "runner" ? "flag" : did.kind === "kick" ? "star" : "mic";
  const kept = storagePersisted();
  const sourceLabel = session.source === "device" ? "อุปกรณ์จริง" : session.source === "sample" ? "ข้อมูลตัวอย่าง" : "โหมดสาธิต";
  const met = call ? call.words.filter((w) => w.heard) : [];
  const again: Route = isGateRound(session) ? "gate" : session.game;

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page result">
        <div className={`result__scene result__scene--${tone}`} aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`result__spark result__spark--${i}`} />
          ))}
          {mode.kind === "3d" ? (
            <World3D kind="celebrate" game={session.game} outfit={outfitOf(db, child, session.source === "device" ? "device" : "demo")} species={rewardsOf(db, child.id).species} tier={mode.tier} active reduced={reduced} />
          ) : (
            <RenderImg name={`thumb-${session.game}`} fallback={session.game === "kick" ? <GameThumb game="kick" /> : null} />
          )}
        </div>

        {/* everything beside the celebration on wide screens */}
        <div className="result__side">
        <header className={`result__head result__head--${tone}`}>
          <h1>{event.title}</h1>
          <p className="result__sub">
            {event.sub}
            {roundToday > 0 ? ` · รอบที่ ${roundToday} ของวันนี้` : ""}
          </p>
        </header>
        <div className="result__stars" role="img" aria-label={`ได้ ${stars} ดาวจาก 3`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={`result__star${i <= stars ? " is-on" : ""}`} style={{ animationDelay: `${i * 120}ms` }}>
              <StarShape size={56} filled={i <= stars} />
            </span>
          ))}
        </div>
        {met.length > 0 ? (
          <ul className="met met--result" aria-label="เพื่อนที่ได้ยินหนู">
            {met.map((w) => (
              <li key={w.id} className="met__friend">
                <FriendPicture id={w.id as FriendId} word={w.word} />
                <span lang="th">{w.word}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {hint ? <p className="result__hint">{hint}</p> : stars === 3 ? <p className="result__hint">ได้ครบ 3 ดาวแล้ว!</p> : null}
        <ul className="result-cards" aria-label="รอบนี้">
          <li className="result-card result-card--star">
            <span className="result-card__band">ดาวสะสม</span>
            <span className="result-card__body">
              <Icon name="star" size={22} /> +{session.stars}
            </span>
          </li>
          <li className={`result-card result-card--${tone}`}>
            <span className="result-card__band">{did.label}</span>
            <span className="result-card__body">
              <Icon name={didIcon} size={22} /> {did.value}
            </span>
          </li>
          <li className="result-card result-card--time">
            <span className="result-card__band">เวลาฝึก</span>
            <span className="result-card__body">
              <Icon name="clock" size={22} /> {fmtClock(session.durationSec)}
            </span>
          </li>
        </ul>
        <section className={`unlock${newly ? " is-new" : ""}`} aria-live="polite">
          {newly ? (
            <>
              <span className="unlock__icon">
                <RenderImg name={`item-${newly.id}`} fallback={<CollectibleIcon id={newly.id} size={40} />} />
              </span>
              <span>
                <strong>ปลดล็อกของใหม่: {newly.name}!</strong>
                <br />
                ดาวรวมตอนนี้ {totalNow} ดวง
              </span>
            </>
          ) : next ? (
            <>
              <span className="unlock__icon unlock__icon--locked">
                <Icon name="lock" size={22} />
              </span>
              <span>
                <strong>ของชิ้นต่อไป: {next.name}</strong>
                <br />
                อีก {next.stars - totalNow} ดาว · รอบนี้ได้ +{session.stars}
              </span>
            </>
          ) : (
            <span>ปลดล็อกของครบทุกชิ้นแล้ว</span>
          )}
        </section>
        <div className="result__actions">
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => navigate(again)}>
            <Icon name="refresh" size={20} /> เล่นอีกรอบ
          </button>
          <button type="button" className="link-btn result__home" onClick={() => navigate("home")}>
            กลับหน้าหลัก
          </button>
        </div>

        <details className="card result__care">
          <CareSummary sub="ตัวเลขของรอบนี้" />
          <div className="care__body">
        <p className="result__meta">
          {GAME_LABEL[session.game]} {session.call ? "(ด่านเรียกเพื่อน)" : `ด่านที่ ${session.level} ${LEVEL_LABEL[session.level]}`}
        </p>
        <div className="tiles">
          {session.game === "runner" ? (
            <>
              <div className="tile">
                <span className="tile__label">พูดคำด้านปาก</span>
                <span className="tile__value">
                  {session.attempts} <small>ครั้ง</small>
                </span>
              </div>
              <div className="tile">
                <span className="tile__label">ผ่านเกณฑ์เดโม ({session.oralThreshold}%)</span>
                <span className="tile__value">
                  {session.passed} <small>ครั้ง</small>
                </span>
              </div>
              <div className="tile tile--wide tile--nasal">
                <span className="tile__label">
                  <Icon name="nose" size={16} /> ด่านประตูเสียงนาสิก
                </span>
                <span className="tile__text">
                  {session.gate
                    ? session.gate.opened
                      ? `เปิดประตูได้! พูดถึงเกณฑ์ออกจมูก (≥ ${session.gateThreshold}%) ${session.gate.passed} จาก ${session.gate.attempts} ครั้ง`
                      : session.gate.attempts > 0
                        ? `ข้ามไว้ก่อน · ลองไป ${session.gate.attempts} ครั้ง ไว้รอบหน้าลองใหม่นะ`
                        : "ข้ามไว้ก่อน"
                    : "ไม่ได้เล่นในรอบนี้"}
                </span>
              </div>
            </>
          ) : null}
          {session.game === "balloon" && session.balloon ? (
            <>
              <div className="tile">
                <span className="tile__label">ค้างในโซนครบ</span>
                <span className="tile__value">
                  {session.balloon.completed}/{session.balloon.target} <small>ลูก</small>
                </span>
              </div>
              <div className="tile">
                <span className="tile__label">เวลาในโซนสะสม</span>
                <span className="tile__value">
                  {session.balloon.inZoneSec.toFixed(1)} <small>วินาที</small>
                </span>
              </div>
            </>
          ) : null}
          {call ? (
            <>
              <div className="tile">
                <span className="tile__label">เพื่อนที่ได้ยิน</span>
                <span className="tile__value">
                  {call.heard}/{call.target} <small>ตัว</small>
                </span>
              </div>
              <div className="tile">
                <span className="tile__label">ลองเรียก · สัญญาณใช้ได้</span>
                <span className="tile__value">
                  {session.attempts} · {session.passed} <small>ครั้ง</small>
                </span>
              </div>
            </>
          ) : session.game === "frog" && session.frog ? (
            <>
              <div className="tile">
                <span className="tile__label">กบกระโดดได้</span>
                <span className="tile__value">
                  {session.frog.steps}/{session.frog.target} <small>ก้าว</small>
                </span>
              </div>
              <div className="tile">
                <span className="tile__label">ช่วงเสียงทั้งหมด</span>
                <span className="tile__value">
                  {session.attempts} <small>ครั้ง</small>
                </span>
              </div>
            </>
          ) : null}
        </div>

        {call ? (
          <section className="card result__chart" aria-labelledby="result-words-title">
            <h2 id="result-words-title" className="section-title section-title--card">
              คำที่ฝึกรอบนี้
            </h2>
            <WordTable words={call.words} caption="คำที่ฝึกรอบนี้" />
            <WordTableNote />
            {call.source === "demo" ? <p className="call-note">รอบนี้ใช้โหมดสาธิต (สัญญาณจำลอง) ตัวเลขไม่ได้มาจากอุปกรณ์จริง</p> : null}
          </section>
        ) : (
        <section className="card result__chart" aria-labelledby="result-chart-title">
          <div className="result__charthead">
            <h2 id="result-chart-title" className="section-title section-title--card">
              {isBalloon ? "เวลาในโซน (วินาที) · 5 ครั้งล่าสุด" : "ออกปากเฉลี่ย (%) · 5 ครั้งล่าสุด"}
            </h2>
            {trend ? <span className="result__trend">{trend}</span> : null}
          </div>
          <BarChart
            bars={bars}
            max={isBalloon ? Math.max(session.balloon ? session.balloon.holdSec * session.balloon.target : 9, ...bars.map((b) => b.value ?? 0)) : 100}
            unit={isBalloon ? "วิ" : "%"}
            color="oral"
            refLine={isBalloon ? undefined : { value: session.oralThreshold, label: `เกณฑ์ ${session.oralThreshold}%` }}
            ariaLabel={isBalloon ? "กราฟเวลาในโซนเฉลี่ยต่อรอบ 5 ครั้งล่าสุด" : "กราฟออกปากเฉลี่ยขณะพูด 5 ครั้งล่าสุด"}
            formatValue={isBalloon ? (v) => `${v.toFixed(1)} วินาที` : undefined}
            height={170}
          />
          <p className="legend">
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--oral" /> เล่นจริงในเดโม
            </span>
            {hasSample ? (
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--sample" /> ข้อมูลตัวอย่าง (ครั้งก่อน ๆ)
              </span>
            ) : null}
          </p>
        </section>
        )}
          </div>
        </details>
        {kept ? (
          <p className="result__saved">
            <Icon name="check" size={16} /> บันทึกในเครื่องนี้แล้ว ({sourceLabel}) ครูดูได้ในแดชบอร์ด · ผลตามเกณฑ์เดโม ไม่ใช่ผลประเมินทางคลินิก
          </p>
        ) : (
          <div className="result__saved result__saved--warn" role="status">
            <p>
              <Icon name="alert" size={16} /> เบราว์เซอร์นี้เก็บข้อมูลถาวรไม่ได้ รอบนี้อยู่ได้เฉพาะตอนเปิดหน้านี้ ปิดหน้าแล้วจะหายและไม่ได้นับรางวัลต่อ ·
              ผลตามเกณฑ์เดโม ไม่ใช่ผลประเมินทางคลินิก
            </p>
            <button
              type="button"
              className="quiet-btn"
              onClick={() => {
                const text = `${GAME_LABEL[session.game]} · ${new Date(session.startedAt).toLocaleString("th-TH")} · ${sourceLabel} · ตรวจพบการลองพูด ${session.attempts} ครั้ง · ถึงเกณฑ์ตามแผน ${session.passed} ครั้ง · ดาว ${session.stars}`;
                void navigator.clipboard?.writeText(text);
              }}
            >
              <Icon name="save" size={16} /> คัดลอกสรุปรอบนี้
            </button>
          </div>
        )}
        </div>
        <Disclaimer compact />
      </div>
    </div>
  );
}
