import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { GameThumb } from "../components/Art";
import { BarChart, type ChartBar } from "../components/BarChart";
import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { childSessions, reviewStatus, weeklyBuckets, type RuleState, type WeekBucket } from "../data/analytics";
import { callGroupNasal, RESONANCE_LABEL } from "../data/callWords";
import { GAME_NAME, POSITIONING, VALIDATION_NOTE } from "../data/copy";
import { fmtDayMonth, fmtDuration, fmtPct, fmtRange, fmtTime } from "../data/format";
import { fmtThaiDate, gameRows, reportKpis, reportTitle, trendSessions } from "../data/report";
import { rewardsOf } from "../data/rewards";
import { GAME_LABEL, LEVEL_LABEL, type Session } from "../data/schema";
import { findChild, useDB } from "../data/store";
import { navigate, reportTarget } from "../lib/router";
import "../styles/report.css";

const SOURCE_LABEL: Record<Session["source"], string> = { sample: "ข้อมูลตัวอย่าง", demo: "โหมดสาธิต (สัญญาณจำลอง)", device: "อุปกรณ์จริง (ESP32)" };
const RULE_BADGE: Record<RuleState, string> = { flag: "ควรทบทวน", clear: "ไม่มีแจ้งเตือน", insufficient: "ข้อมูลยังไม่พอ" };
const PAGES = 2;

function weekBars(weeks: WeekBucket[], pick: (w: WeekBucket) => number | null): ChartBar[] {
  return weeks.map((w, i) => {
    const v = pick(w);
    return {
      key: String(w.index),
      label: `ส.${w.index}`,
      value: v,
      tone: i === weeks.length - 1 ? "current" : "past",
      tip: `ส.${w.index} (${fmtRange(w.start, w.end)}): ${v === null ? "ไม่มีข้อมูล" : `ออกจมูก ${fmtPct(v)}`}`,
    };
  });
}

function gamePicture(game: Session["game"]): ReactNode {
  // the newest games have no rendered picture yet: draw them directly
  if (game === "plane" || game === "bakery" || game === "kick" || game === "tower" || game === "train") return <GameThumb game={game} />;
  return <RenderImg name={`thumb-${game}`} fallback={null} />;
}

/** One A4 sheet: the same header and footer on every page (as the printed clinic file). */
function Sheet({ s, page, children }: { s: Session; page: number; children: ReactNode }) {
  const d = new Date(s.startedAt);
  return (
    <section className="rp-sheet" aria-label={`หน้า ${page} จาก ${PAGES}`}>
      <header className="rp-head">
        <div className="rp-brand">
          <span className="rp-brand__mark" aria-hidden="true">
            <RenderImg name="avatar-bunny" fallback={null} />
          </span>
          <span>
            <b>{GAME_NAME}</b>
            <small>ต้นแบบเครื่องมือฝึกพูดที่บ้าน</small>
          </span>
        </div>
        <dl className="rp-meta">
          <div>
            <dt>รหัสเด็ก</dt>
            <dd>{s.childId}</dd>
          </div>
          <div>
            <dt>วันที่ฝึก</dt>
            <dd>
              {fmtThaiDate(d)} {fmtTime(d)}
            </dd>
          </div>
          <div>
            <dt>เอกสาร</dt>
            <dd>บันทึกการฝึกรายครั้ง</dd>
          </div>
        </dl>
      </header>
      <div className="rp-body">{children}</div>
      <footer className="rp-foot">
        <span>
          <b>{GAME_NAME}</b> · {POSITIONING}
        </span>
        <span>ไม่ใช่ผลการวินิจฉัย</span>
        <span>
          {page} / {PAGES}
        </span>
      </footer>
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "oral" | "nasal" }) {
  return (
    <div className={`rp-kpi${tone ? ` rp-kpi--${tone}` : ""}`}>
      <span className="rp-kpi__label">{label}</span>
      <span className="rp-kpi__value">{value}</span>
      <span className="rp-kpi__sub">{sub}</span>
    </div>
  );
}

function Section({ n, title, aside, children }: { n: string; title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="rp-sec">
      <div className="rp-sec__head">
        <h2>
          <span className="rp-sec__n">{n}</span> {title}
        </h2>
        {aside ? <span className="rp-sec__aside">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rp-note">
      <span className="rp-note__icon" aria-hidden="true">
        <Icon name="info" size={16} />
      </span>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/**
 * รายงานรอบฝึกรายครั้ง (A4 สองหน้า): หน้า 1 สรุปรอบ หน้า 2 ติดตามผลเทียบรอบก่อนหน้าและบันทึกของนักแก้ไขการพูด
 * เปิดจากปุ่ม PDF ในประวัติของแดชบอร์ด (แท็บใหม่) แล้วเปิดหน้าต่างพิมพ์ / บันทึกเป็น PDF ของเบราว์เซอร์ให้เอง
 * ข้อมูลทั้งหมดมาจากรอบที่บันทึกในเบราว์เซอร์นี้ ไม่มีการส่งออกไปที่ไหน
 */
export function ReportScreen() {
  const db = useDB();
  const target = useMemo(() => reportTarget(), []);
  const s = target.id ? db.sessions.find((x) => x.id === target.id) ?? null : null;
  const printed = useRef(false);

  useEffect(() => {
    if (!s) return;
    document.title = reportTitle(s);
    if (!target.print || printed.current) return;
    // wait for the Thai fonts and the charts' first layout, then open the browser's print / save-as-PDF dialog once
    // (a cancelled run — e.g. React re-running effects — leaves it to the next run)
    const off = new AbortController();
    void document.fonts.ready
      .then(() => new Promise((r) => setTimeout(r, 700)))
      .then(() => {
        if (off.signal.aborted || printed.current) return;
        printed.current = true;
        window.print();
      });
    return () => off.abort();
  }, [s, target.print]);

  if (!s) {
    return (
      <div className="rp-viewer">
        <div className="rp-missing">
          <h1>ไม่พบรอบฝึกนี้ในเบราว์เซอร์นี้</h1>
          <p>รายงานสร้างจากข้อมูลที่เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น อาจถูกลบหรือรีเซ็ตไปแล้ว</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate("dashboard")}>
            กลับไปแดชบอร์ด
          </button>
        </div>
      </div>
    );
  }

  const child = findChild(db, s.childId);
  const d = new Date(s.startedAt);
  const k = reportKpis(s);
  const rows = gameRows(s);
  const all = childSessions(db, s.childId);
  const trend = trendSessions(all, s, 7);
  const weeks = weeklyBuckets(
    all.filter((x) => x.startedAt <= s.startedAt),
    d,
  );
  const review = reviewStatus(weeks, child.plan);
  const oralCeiling = 100 - s.oralThreshold;
  const species = rewardsOf(db, s.childId).species;
  // sections are numbered straight through both pages (the per-word table only exists on call-a-friend rounds)
  const N = s.call
    ? { game: "01", words: "02", facts: "03", trend: "04", chart: "05", rules: "06", notes: "07" }
    : { game: "01", words: "", facts: "02", trend: "03", chart: "04", rules: "05", notes: "06" };

  return (
    <div className="rp-viewer">
      <div className="rp-toolbar" role="toolbar" aria-label="รายงาน">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate("dashboard")}>
          <Icon name="back" size={16} /> แดชบอร์ด
        </button>
        <p className="rp-toolbar__hint">กด “บันทึกเป็น PDF” แล้วเลือกปลายทาง “Save as PDF / บันทึกเป็น PDF” ในหน้าต่างพิมพ์</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>
          <Icon name="save" size={16} /> บันทึกเป็น PDF
        </button>
      </div>

      {/* ---------- page 1: the round ---------- */}
      <Sheet s={s} page={1}>
        <div className="rp-title">
          <h1>บันทึกการฝึกพูดรายครั้ง</h1>
          <p>
            {GAME_LABEL[s.game]}
            {s.gate ? " + ประตู" : ""} · {fmtThaiDate(d)} เวลา {fmtTime(d)} · {fmtDuration(s.durationSec)}
            {s.rounds > 1 ? ` · ${s.rounds} รอบย่อย` : ""}
          </p>
        </div>

        <div className="rp-who">
          <span className="rp-who__face" aria-hidden="true">
            <RenderImg name={`avatar-${species}`} fallback={<RenderImg name="avatar-bunny" fallback={null} />} />
          </span>
          <dl>
            <div>
              <dt>รหัสเด็ก</dt>
              <dd>{s.childId}</dd>
            </div>
            <div>
              <dt>เกม</dt>
              <dd>{GAME_LABEL[s.game]}</dd>
            </div>
            <div>
              <dt>แหล่งสัญญาณ</dt>
              <dd>{SOURCE_LABEL[s.source]}</dd>
            </div>
            <div>
              <dt>ระดับคำ</dt>
              <dd>
                ด่าน {s.level} {LEVEL_LABEL[s.level]}
              </dd>
            </div>
          </dl>
          <span className={`rp-who__game rp-game--${s.game}`} aria-hidden="true">
            {gamePicture(s.game)}
          </span>
        </div>

        <div className="rp-kpis">
          <Kpi label="ลองพูด" value={`${k.tries} ครั้ง`} sub={`สัญญาณใช้ได้ ${k.usable} ครั้ง`} />
          <Kpi
            label="ผ่านเกณฑ์ด้านปาก"
            value={k.passRate === null ? "—" : fmtPct(k.passRate)}
            sub={s.call ? "ด่านเรียกเพื่อนไม่ใช้เกณฑ์" : `เกณฑ์ออกปากอย่างน้อย ${s.oralThreshold}%`}
            tone="oral"
          />
          <Kpi label="ออกจมูกเฉลี่ย · คำด้านปาก" value={fmtPct(k.oralNasal)} sub={`แผนไม่เกิน ${oralCeiling}%`} tone="nasal" />
          <Kpi label="ออกจมูกเฉลี่ย · คำนาสิก" value={fmtPct(k.nasalNasal)} sub={k.nasalNasal === null ? "รอบนี้ไม่มีคำนาสิก" : `ควรถึง ${s.gateThreshold}% ขึ้นไป`} tone="nasal" />
        </div>

        <Section n={N.game} title="ผลในเกม" aside="บันทึกจากรอบนี้">
          <table className="rp-table rp-table--rows">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="rp-strong">{r.value}</td>
                  <td className="rp-muted">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {s.call ? (
          <Section n={N.words} title="รายคำ (ด่านเรียกเพื่อน)" aside={`คำนาสิกเฉลี่ย ${fmtPct(callGroupNasal(s.call, "nasal").mean)}`}>
            <table className="rp-table">
              <thead>
                <tr>
                  <th scope="col">คำ</th>
                  <th scope="col">ชนิดคำ</th>
                  <th scope="col" className="num">
                    ฟังตัวอย่าง
                  </th>
                  <th scope="col" className="num">
                    ลองพูด
                  </th>
                  <th scope="col" className="num">
                    สัญญาณใช้ได้
                  </th>
                  <th scope="col" className="num">
                    ออกจมูกเฉลี่ย
                  </th>
                  <th scope="col">เพื่อน</th>
                </tr>
              </thead>
              <tbody>
                {s.call.words.map((w) => (
                  <tr key={w.id}>
                    <td className="rp-strong">{w.word}</td>
                    <td>{RESONANCE_LABEL[w.resonance]}</td>
                    <td className="num">{w.listens}</td>
                    <td className="num">{w.attempts}</td>
                    <td className="num">{w.usable}</td>
                    <td className="num rp-nasal">{fmtPct(w.meanNasal)}</td>
                    <td>{w.heard ? "ได้ยินแล้ว" : w.skipped ? "ข้าม" : "ยังไม่ได้ยิน"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}

        <Section n={N.facts} title="ชุดคำและเกณฑ์ของรอบนี้" aside="ค่าตามแผนตอนที่เล่น">
          <dl className="rp-facts">
            <div>
              <dt>คำที่ฝึก</dt>
              <dd>{s.words.join(" ") || "—"}</dd>
            </div>
            <div>
              <dt>เกณฑ์ด้านปาก</dt>
              <dd>ออกปากอย่างน้อย {s.oralThreshold}%</dd>
            </div>
            <div>
              <dt>เกณฑ์คำนาสิก</dt>
              <dd>ออกจมูกอย่างน้อย {s.gateThreshold}%</dd>
            </div>
            <div>
              <dt>ระยะเวลา</dt>
              <dd>{fmtDuration(s.durationSec)}</dd>
            </div>
          </dl>
        </Section>

        <Note title="อ่านผลอย่างไร">
          <ul>
            <li>“ครั้ง” คือช่วงเสียงที่เครื่องตรวจพบ ไม่ใช่จำนวนคำที่พูดถูก เพราะเครื่องไม่รู้จำคำ</li>
            <li>ค่าออกจมูกเป็นค่าเฉลี่ยเชิงพรรณนาจากอุปกรณ์ต้นแบบ {VALIDATION_NOTE.replace("ต้นแบบนี้", "")}</li>
            <li>คำด้านปากไม่ได้แปลว่ายิ่งต่ำยิ่งดี และคำนาสิกควรมีเสียงออกจมูก ให้นักแก้ไขการพูดตีความร่วมกับการฟัง</li>
          </ul>
        </Note>
      </Sheet>

      {/* ---------- page 2: tracking ---------- */}
      <Sheet s={s} page={2}>
        <div className="rp-title">
          <h1>ติดตามผลการฝึก</h1>
          <p>
            รอบนี้เทียบกับรอบก่อนหน้าของ {s.childId} · ข้อมูลถึง {fmtThaiDate(d)}
          </p>
        </div>

        <Section n={N.trend} title="รอบล่าสุดถึงรอบนี้" aside={`${trend.length} รอบล่าสุด`}>
          <table className="rp-table">
            <thead>
              <tr>
                <th scope="col">วันที่</th>
                <th scope="col">เกม</th>
                <th scope="col" className="num">
                  ครั้ง
                </th>
                <th scope="col" className="num">
                  ผ่านเกณฑ์ปาก
                </th>
                <th scope="col" className="num">
                  ออกจมูก · คำปาก
                </th>
                <th scope="col" className="num">
                  ออกจมูก · คำนาสิก
                </th>
                <th scope="col">ที่มา</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((x) => {
                const xk = reportKpis(x);
                const xd = new Date(x.startedAt);
                const me = x.id === s.id;
                return (
                  <tr key={x.id} className={me ? "is-this" : undefined}>
                    <td>
                      {fmtDayMonth(xd)} {fmtTime(xd)}
                      {me ? <b className="rp-this">รอบนี้</b> : null}
                    </td>
                    <td>{GAME_LABEL[x.game]}</td>
                    <td className="num">{xk.tries}</td>
                    <td className="num rp-oral">{xk.passRate === null ? "—" : fmtPct(xk.passRate)}</td>
                    <td className="num rp-nasal">{fmtPct(xk.oralNasal)}</td>
                    <td className="num rp-nasal">{fmtPct(xk.nasalNasal)}</td>
                    <td>{x.source === "sample" ? "ตัวอย่าง" : x.source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section n={N.chart} title="ค่าออกจมูกรายสัปดาห์" aside="8 สัปดาห์ถึงวันของรอบนี้">
          <div className="rp-charts">
            <figure>
              <figcaption>คำด้านปาก</figcaption>
              <BarChart
                bars={weekBars(weeks, (w) => w.nasalOral)}
                max={60}
                unit="%"
                color="nasal"
                refLine={{ value: oralCeiling, label: `แผนไม่เกิน ${oralCeiling}%` }}
                ariaLabel={`ค่าออกจมูกรายสัปดาห์ คำด้านปาก ของ ${s.childId}`}
                valueLabels="ends"
                height={124}
              />
            </figure>
            <figure>
              <figcaption>คำนาสิก</figcaption>
              <BarChart
                bars={weekBars(weeks, (w) => w.nasalNasal)}
                max={60}
                unit="%"
                color="nasal"
                refLine={{ value: s.gateThreshold, label: `ควรถึง ${s.gateThreshold}%` }}
                ariaLabel={`ค่าออกจมูกรายสัปดาห์ คำนาสิก ของ ${s.childId}`}
                valueLabels="ends"
                height={124}
              />
            </figure>
          </div>
        </Section>

        <Section n={N.rules} title="กฎแจ้งเตือน ณ วันของรอบนี้" aside="กฎตัวอย่างของเดโม · ใช้แผนปัจจุบัน">
          <ul className="rp-rules">
            {review.rules.map((r) => (
              <li key={r.id}>
                <span className={`rp-badge rp-badge--${r.state}`}>{RULE_BADGE[r.state]}</span>
                <span>
                  <b>{r.title}</b> <span className="rp-muted">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={N.notes} title="บันทึกของนักแก้ไขการพูด">
          <div className="rp-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="rp-sign">
            <span>ลงชื่อ ……………………………………………</span>
            <span>วันที่ ……………………………</span>
          </div>
        </Section>

        <Note title="ขอบเขตการใช้ข้อมูล">
          <p>
            {POSITIONING} · {VALIDATION_NOTE} · ใช้รหัสเด็กแทนชื่อจริง ไม่เก็บเสียงดิบ ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น
          </p>
        </Note>
      </Sheet>
    </div>
  );
}
