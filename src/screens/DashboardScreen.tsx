import { HapticsSetting } from "../components/HapticsSetting";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BarChart, type ChartBar } from "../components/BarChart";
import { Disclaimer, ViewSwitch } from "../components/Chrome";
import { GAME_NAME } from "../data/copy";
import { Icon, type IconName } from "../components/Icon";
import { showToast } from "../lib/toast";
import { childSessions, REVIEW_RULES, reviewStatus, weeklyBuckets, type ReviewStatus, type RuleState, type WeekBucket } from "../data/analytics";
import { CALL_WORDS, callGroupNasal, RESONANCE_LABEL } from "../data/callWords";
import { fmtDayMonth, fmtDuration, fmtPct, fmtRange, fmtTime } from "../data/format";
import { PLAN_LIMITS, planToDraft, validatePlan, wordError, type PlanDraft, type PlanErrors } from "../data/plan";
import { GAME_LABEL, LEVEL_LABEL, type Child, type GameId, type Level } from "../data/schema";
import { clearDemoPlays, clearSampleData, findChild, resetAllDemoData, savePlan, setActiveChild, useDB } from "../data/store";
import { navigate } from "../lib/router";
import { attemptsOnDay, dayKey } from "../data/rewards";

const STATE_BADGE: Record<RuleState | "review", { cls: string; text: string }> = {
  review: { cls: "badge--warn", text: "ควรทบทวน" },
  flag: { cls: "badge--warn", text: "ควรทบทวน" },
  insufficient: { cls: "", text: "ข้อมูลยังไม่พอ" },
  clear: { cls: "badge--ok", text: "ไม่มีแจ้งเตือน" },
};

function weekBars(weeks: WeekBucket[], pick: (w: WeekBucket) => number | null, kind: string): ChartBar[] {
  return weeks.map((w, i) => {
    const v = pick(w);
    const last = i === weeks.length - 1;
    return {
      key: String(w.index),
      label: `ส.${w.index}`,
      value: v,
      tone: last ? "current" : "past",
      tip: `ส.${w.index} (${fmtRange(w.start, w.end)}): ${v === null ? "ไม่มีข้อมูล" : `ออกจมูก ${fmtPct(v)}`} · ${kind} · ฝึก ${w.practiceDays} วัน`,
    };
  });
}

function WeekTable({ weeks, pick, caption }: { weeks: WeekBucket[]; pick: (w: WeekBucket) => number | null; caption: string }) {
  return (
    <details className="chart-table">
      <summary>ดูเป็นตาราง</summary>
      <table className="mini-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">สัปดาห์</th>
            <th scope="col">ช่วงวันที่</th>
            <th scope="col">วันที่ฝึก</th>
            <th scope="col">ออกจมูกเฉลี่ย</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.index}>
              <td>ส.{w.index}</td>
              <td>{fmtRange(w.start, w.end)}</td>
              <td>{w.practiceDays}</td>
              <td>{fmtPct(pick(w))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  return (
    <button
      type="button"
      className={`btn btn--sm ${armed ? "btn--danger-ghost" : "btn--secondary"}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => setArmed(false), 6000);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

function WordEditor({
  id,
  label,
  hint,
  placeholder,
  words,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  words: string[];
  onChange: (w: string[]) => void;
  error?: string;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    const e = words.length >= PLAN_LIMITS.words.max ? `ได้สูงสุด ${PLAN_LIMITS.words.max} คำ` : wordError(text, words);
    if (e) {
      setErr(e);
      return;
    }
    onChange([...words, text.trim()]);
    setText("");
    setErr(null);
  };
  const shown = err ?? error;
  return (
    <fieldset className="field words">
      <legend className="field__label">{label}</legend>
      <ul className="chips chips--edit" aria-label={label}>
        {words.map((w) => (
          <li key={w} className="chip chip--edit">
            {w}
            <button type="button" className="chip__remove" aria-label={`ลบคำ ${w}`} onClick={() => onChange(words.filter((x) => x !== w))}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
        {words.length === 0 ? <li className="chip chip--empty">ยังไม่มีคำ</li> : null}
      </ul>
      <div className="words__add">
        <label htmlFor={`${id}-input`} className="sr-only">
          เพิ่มคำใน{label}
        </label>
        <input
          id={`${id}-input`}
          className="input"
          value={text}
          maxLength={PLAN_LIMITS.words.maxLength + 4}
          placeholder={placeholder}
          aria-invalid={shown ? true : undefined}
          aria-describedby={`${id}-hint${shown ? ` ${id}-err` : ""}`}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={add}>
          <Icon name="plus" size={16} /> เพิ่มคำ
        </button>
      </div>
      <span id={`${id}-hint`} className="field__hint">
        {hint}
      </span>
      {shown ? (
        <span id={`${id}-err`} className="field__error" role="alert">
          {shown}
        </span>
      ) : null}
    </fieldset>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  min: number;
  max: number;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span id={`${id}-hint`} className="field__hint">
        {hint}
      </span>
      {error ? (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function PlanForm({ child }: { child: Child }) {
  const initial = useMemo(() => planToDraft(child.plan), [child.plan]);
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [errors, setErrors] = useState<PlanErrors>({});
  const [justSaved, setJustSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const L = PLAN_LIMITS;
  const set = <K extends keyof PlanDraft>(k: K, v: PlanDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    // The message for this field no longer describes what is typed — clear it until the next save.
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
    setJustSaved(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = validatePlan(draft);
    if (!res.ok) {
      setErrors(res.errors);
      showToast("ยังบันทึกไม่ได้ ตรวจช่องที่มีข้อความสีแดง");
      return;
    }
    setErrors({});
    const saved = savePlan(child.id, res.plan);
    setDraft(planToDraft(saved));
    setJustSaved(true);
    showToast(`บันทึกแผนของ ${child.id} แล้ว · ภารกิจฝั่งเด็กเปลี่ยนตามทันที`);
  };

  const gameIds: GameId[] = ["runner", "balloon", "frog", "kick", "tower", "train"];
  const updated = new Date(child.plan.updatedAt);

  return (
    <form className="plan" onSubmit={submit} noValidate aria-labelledby="plan-title">
      <div className="plan__head">
        <h2 id="plan-title" className="dash-card__title">
          แผนการฝึกของ {child.id}
        </h2>
        <span className="plan__updated">
          บันทึกล่าสุด {fmtDayMonth(updated)} {fmtTime(updated)}
        </span>
      </div>
      <p className="plan__note">
        <Icon name="info" size={16} /> ค่าเริ่มต้น 70% / 40% เป็นค่าตั้งต้นของเดโม ไม่ใช่เกณฑ์มาตรฐานสำหรับเด็กทุกคน
      </p>
      <div className="plan__grid">
        <WordEditor
          id="words"
          placeholder="พิมพ์คำ เช่น ปา"
          label="ชุดคำด้านปาก"
          hint={`ใช้เป็นคำของแต่ละช่วงในเกมวิ่ง (ตามลำดับ) และบอลลูน (1–${L.words.max} คำ)`}
          words={draft.words}
          onChange={(w) => set("words", w)}
          error={errors.words}
        />
        <WordEditor
          id="nasal-words"
          placeholder="พิมพ์คำ เช่น นา"
          label="คำนาสิก (ด่านประตู)"
          hint="คำที่ควรมีเสียงออกจมูก เช่น มา นา"
          words={draft.nasalWords}
          onChange={(w) => set("nasalWords", w)}
          error={errors.nasalWords}
        />
        <NumberField
          id="oral-thr"
          label="เกณฑ์ด้านปาก: ออกปากอย่างน้อย (%)"
          hint={`${L.oralThreshold.min}–${L.oralThreshold.max}% ใช้กับบอลลูน และบันทึกผลให้ผู้ดูแลในเกมวิ่ง (ด่านเรียกเพื่อนไม่ใช้เกณฑ์)`}
          value={draft.oralThreshold}
          min={L.oralThreshold.min}
          max={L.oralThreshold.max}
          error={errors.oralThreshold}
          onChange={(v) => set("oralThreshold", v)}
        />
        <NumberField
          id="gate-thr"
          label="เกณฑ์ด่านนาสิก: ออกจมูกอย่างน้อย (%)"
          hint={`${L.gateThreshold.min}–${L.gateThreshold.max}% · ใช้เฉพาะด่านประตู`}
          value={draft.gateThreshold}
          min={L.gateThreshold.min}
          max={L.gateThreshold.max}
          error={errors.gateThreshold}
          onChange={(v) => set("gateThreshold", v)}
        />
        <NumberField
          id="minutes"
          label="เวลาเป้าหมายต่อวัน (นาที)"
          hint={`${L.dailyMinutes.min}–${L.dailyMinutes.max} นาที`}
          value={draft.dailyMinutes}
          min={L.dailyMinutes.min}
          max={L.dailyMinutes.max}
          error={errors.dailyMinutes}
          onChange={(v) => set("dailyMinutes", v)}
        />
        <NumberField
          id="hold"
          label="เวลาสะสมในโซนบอลลูน (วินาทีต่อลูก)"
          hint={`${L.balloonHoldSec.min}–${L.balloonHoldSec.max} วินาที`}
          value={draft.balloonHoldSec}
          min={L.balloonHoldSec.min}
          max={L.balloonHoldSec.max}
          error={errors.balloonHoldSec}
          onChange={(v) => set("balloonHoldSec", v)}
        />
        <div className="field">
          <label htmlFor="level" className="field__label">
            ด่าน (รูปแบบโจทย์)
          </label>
          <select id="level" className="select" value={draft.level} onChange={(e) => set("level", Number(e.target.value) as Level)}>
            {([1, 2, 3] as Level[]).map((l) => (
              <option key={l} value={l}>
                {l} · {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <span className="field__hint">เปลี่ยนรูปแบบโจทย์และคำแนะนำ ยังไม่เปลี่ยนตรรกะการให้คะแนน</span>
        </div>
        <fieldset className="field games-field">
          <legend className="field__label">เกมที่เปิดให้เล่น</legend>
          <div className="games-field__list">
            {gameIds.map((g) => (
              <label key={g} className="check">
                <input type="checkbox" checked={draft.games[g]} onChange={(e) => set("games", { ...draft.games, [g]: e.target.checked })} />
                {GAME_LABEL[g]}
              </label>
            ))}
            <label className="check">
              <input type="checkbox" checked={draft.gateEnabled} onChange={(e) => set("gateEnabled", e.target.checked)} />
              ด่านประตูเสียงนาสิก (เล่นเดี่ยวหรือต่อจากเกมวิ่ง)
            </label>
          </div>
          {errors.games ? (
            <span className="field__error" role="alert">
              {errors.games}
            </span>
          ) : null}
        </fieldset>
        <fieldset className="field games-field">
          <legend className="field__label">คำเรียกเพื่อน (กบข้ามบึง · ด่านเรียกเพื่อน)</legend>
          <div className="games-field__list">
            {CALL_WORDS.map((w) => (
              <label key={w.id} className="check">
                <input
                  type="checkbox"
                  checked={draft.callWords.includes(w.id)}
                  onChange={(e) => set("callWords", e.target.checked ? [...draft.callWords, w.id] : draft.callWords.filter((id) => id !== w.id))}
                />
                <span lang="th">{w.word}</span>
                <small className={`call-table__type--${w.resonance}`}>· {RESONANCE_LABEL[w.resonance]}</small>
              </label>
            ))}
          </div>
          <span className="field__hint">เด็กเรียกชื่อสัตว์ทีละตัว เพื่อนหันมาเมื่อได้ยินเสียงเท่านั้น · สรุปค่าออกจมูกแยกคำปาก/คำมีเสียงนาสิก ไม่ใช้ตัดสิน</span>
          {errors.callWords ? (
            <span className="field__error" role="alert">
              {errors.callWords}
            </span>
          ) : null}
        </fieldset>
      </div>
      <div className="plan__actions">
        <span className={`plan__status${justSaved ? " is-saved" : ""}`} role="status">
          {justSaved ? (
            <>
              <Icon name="check" size={16} /> บันทึกแล้ว · หน้าฝั่งเด็กของ {child.id} ใช้ค่าใหม่แล้ว
            </>
          ) : dirty ? (
            <>
              <Icon name="info" size={16} /> มีการแก้ไขที่ยังไม่บันทึก
            </>
          ) : (
            ""
          )}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!dirty}
          onClick={() => {
            setDraft(initial);
            setErrors({});
          }}
        >
          ยกเลิกการแก้ไข
        </button>
        <button type="submit" className="btn btn--primary">
          <Icon name="save" size={18} /> บันทึกและส่งให้เด็ก
        </button>
      </div>
    </form>
  );
}

type Tab = "overview" | "history" | "plan" | "data";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "overview", label: "ภาพรวม", icon: "chart" },
  { id: "history", label: "ประวัติ", icon: "clock" },
  { id: "plan", label: "แผนการฝึก", icon: "target" },
  { id: "data", label: "เครื่องนี้", icon: "save" },
];

type ChartKind = "oral" | "nasal";

/** Status dot + short label for a child: one place for what used to be a dropdown, a sidebar and a banner. */
function statusOf(r: ReviewStatus): { cls: string; text: string } {
  return r.overall === "review" ? { cls: "is-review", text: "ควรทบทวน" } : r.overall === "insufficient" ? { cls: "is-insufficient", text: "ข้อมูลยังไม่พอ" } : { cls: "is-clear", text: "ไม่มีแจ้งเตือน" };
}

export function DashboardScreen() {
  const db = useDB();
  const [selectedId, setSelectedId] = useState(db.activeChildId);
  const [tab, setTab] = useState<Tab>("overview");
  const [chart, setChart] = useState<ChartKind>("oral");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, history: null, plan: null, data: null });
  const child = findChild(db, selectedId);
  const now = new Date();

  const all = db.children.map((c) => {
    const weeks = weeklyBuckets(childSessions(db, c.id), now);
    return { child: c, weeks, review: reviewStatus(weeks, c.plan) };
  });
  const sel = all.find((x) => x.child.id === child.id) ?? all[0];
  const status = statusOf(sel.review);
  const flagRule = sel.review.overall === "review" ? sel.review.rules.find((r) => r.state === "flag") : undefined;
  const wk = sel.weeks[sel.weeks.length - 1];
  const prev = sel.weeks[sel.weeks.length - 2];
  const plan = child.plan;
  const oralTarget = 100 - plan.oralThreshold;
  const history = childSessions(db, child.id).slice().reverse().slice(0, 10);
  const cal = db.calibrations[child.id];
  const delta = wk.nasalOral !== null && prev.nasalOral !== null ? wk.nasalOral - prev.nasalOral : null;
  const passRate = wk.attempts > 0 ? (wk.passed / wk.attempts) * 100 : null;
  // today's usable tries, kept apart by source (the child's island rewards grow from these)
  const today = dayKey(now.getTime());
  const deviceToday = attemptsOnDay(db, child.id, "device", today);
  const demoToday = attemptsOnDay(db, child.id, "demo", today);

  const openKidView = () => {
    setActiveChild(child.id);
    navigate("home");
  };

  /** Tabs: arrow keys / Home / End move and select (roving tabindex), as a tablist should. */
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].id);
    tabRefs.current[TABS[to].id]?.focus();
  };

  const chartOral = chart === "oral";

  return (
    <div className="dash">
      <aside className="dash-side" aria-labelledby="kids-title">
        <div className="dash-side__head">
          <div className="dash-brand">
            <span className="dash-brand__name">{GAME_NAME}</span>
            <span className="dash-brand__role">สำหรับนักแก้ไขการพูด</span>
          </div>
          <ViewSwitch current="teacher" />
        </div>
        <h2 id="kids-title" className="dash-side__title">
          เด็กที่ดูแล
        </h2>
        <ul className="kids">
          {all.map((x) => {
            const s = statusOf(x.review);
            const last = x.weeks[x.weeks.length - 1];
            return (
              <li key={x.child.id}>
                <button
                  type="button"
                  className={`kid${x.child.id === child.id ? " is-selected" : ""}`}
                  aria-pressed={x.child.id === child.id}
                  onClick={() => setSelectedId(x.child.id)}
                  // on a phone the children are a sideways row: bring a half-hidden card (and its focus ring) fully into view
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                >
                  <span className={`kid__dot ${s.cls}`} aria-hidden="true" />
                  <span className="kid__code">{x.child.id}</span>
                  <span className={`kid__status ${s.cls}`}>{s.text}</span>
                  <span className="kid__meta">ฝึก {last.practiceDays}/7 วัน</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="dash-privacy">
          <Icon name="lock" size={16} /> ใช้รหัสเด็กแทนชื่อจริง ไม่เก็บเสียงดิบ ข้อมูลเดโมอยู่ในเบราว์เซอร์นี้เท่านั้น
        </p>
      </aside>

      <main className="dash-main">
        <header className="dash-child">
          <div className="dash-child__who">
            <h1 className="dash-title">
              <span className="sr-only">ผลการฝึกที่บ้านของ </span>
              {child.id}
            </h1>
            <p className={`dash-status ${status.cls}`}>{status.text}</p>
          </div>
          <div className="dash-child__actions">
            <button type="button" className="btn btn--secondary" onClick={openKidView}>
              <Icon name="external" size={18} /> เปิดหน้าเด็ก (เดโม)
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setTab("plan");
                tabRefs.current.plan?.focus();
              }}
            >
              <Icon name="target" size={18} /> แก้แผน
            </button>
          </div>
          <p className="dash-note">ตัวเลขรวมข้อมูลตัวอย่างกับรอบที่เล่นในเดโม (โหมดสาธิตและอุปกรณ์) ใช้ดูแนวโน้มการฝึกเท่านั้น ไม่ใช้วินิจฉัย</p>
        </header>

        {flagRule ? (
          <section className="dash-alert" aria-labelledby="alert-title">
            <span className="dash-alert__icon">
              <Icon name="alert" size={20} />
            </span>
            <div className="dash-alert__body">
              <h2 id="alert-title" className="dash-alert__title">
                ควรทบทวนแผน: {flagRule.title}
              </h2>
              <p>{flagRule.detail}</p>
              <p className="dash-alert__fine">มาจากกฎตัวอย่างของเดโม (ดู {flagRule.used.length} สัปดาห์ล่าสุด) ใช้เลือกว่าควรดูข้อมูลใครก่อน ไม่ใช่การวินิจฉัย</p>
            </div>
          </section>
        ) : null}

        <div className="dash-tabs" role="tablist" aria-label={`ข้อมูลของ ${child.id}`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="dash-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKey}
            >
              <Icon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>

        {/* panels stay mounted (hidden) so an unsaved plan is not lost when switching tabs */}
        <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" className="dash-panel" hidden={tab !== "overview"}>
          <section className="week" aria-labelledby="week-title">
            <h2 id="week-title" className="dash-h2">
              7 วันล่าสุด
            </h2>
            <dl className="kpis">
              <div className="kpi">
                <dt className="kpi__label">วันที่ฝึก</dt>
                <dd className="kpi__value">
                  {wk.practiceDays}
                  <small>/7 วัน</small>
                </dd>
                <dd className="kpi__sub">สัปดาห์ก่อน {prev.practiceDays} วัน</dd>
              </div>
              <div className="kpi">
                <dt className="kpi__label">ลองพูดคำด้านปาก</dt>
                <dd className="kpi__value">
                  {wk.attempts}
                  <small>ครั้ง</small>
                </dd>
                <dd className="kpi__sub">นับ 1 ครั้งต่อ 1 ช่วงเสียง</dd>
              </div>
              <div className="kpi kpi--oral">
                <dt className="kpi__label">ผ่านเกณฑ์ด้านปาก (เดโม)</dt>
                <dd className="kpi__value">{fmtPct(passRate)}</dd>
                <dd className="kpi__sub">ออกปากถึงเกณฑ์ของแต่ละรอบ</dd>
              </div>
              <div className="kpi kpi--nasal">
                <dt className="kpi__label">เสียงออกจมูกเฉลี่ย (คำด้านปาก)</dt>
                <dd className="kpi__value">{fmtPct(wk.nasalOral)}</dd>
                <dd className="kpi__sub">
                  {delta === null ? "ยังเทียบสัปดาห์ก่อนไม่ได้" : `${delta <= 0 ? "ลดลง" : "เพิ่มขึ้น"} ${Math.abs(delta).toFixed(1)} จุดจากสัปดาห์ก่อน`}
                  <br />
                  คำนาสิก {fmtPct(wk.nasalNasal)}
                </dd>
              </div>
            </dl>
            <p className="dash-today">
              <strong>วันนี้ลองพูดที่สัญญาณใช้ได้ {deviceToday + demoToday} ครั้ง</strong> (อุปกรณ์จริง {deviceToday} ครั้ง, โหมดสาธิต {demoToday} ครั้ง)
              <small>นับช่วงเสียงที่ใช้ได้ ไม่ใช่จำนวนคำที่พูดถูก เพราะเครื่องไม่รู้จำคำ ของรางวัลในเกาะของเด็กโตตามตัวเลขนี้ แยกตามแหล่ง</small>
            </p>
          </section>

          <div className="dash-over">
            <section className="dash-card dash-chart" aria-labelledby="chart-title">
              <div className="dash-card__row">
                <h2 id="chart-title" className="dash-card__title">
                  ค่าออกจมูกรายสัปดาห์
                </h2>
                <div className="seg" role="group" aria-label="เลือกกลุ่มคำของกราฟ">
                  <button type="button" className="seg__btn" aria-pressed={chartOral} onClick={() => setChart("oral")}>
                    คำด้านปาก
                  </button>
                  <button type="button" className="seg__btn" aria-pressed={!chartOral} onClick={() => setChart("nasal")}>
                    คำนาสิก
                  </button>
                </div>
              </div>
              <p className="dash-card__sub chart-legend">
                <span>คำเช่น {(chartOral ? plan.words : plan.nasalWords).join(" ") || "—"}</span>
                <span>{chartOral ? `เส้นประคือแผน ไม่เกิน ${oralTarget}%` : `ควรมีเสียงออกจมูก เส้นประคือแผน ตั้งแต่ ${plan.gateThreshold}%`}</span>
                <span>ส.{wk.index} คือ 7 วันล่าสุด</span>
              </p>
              <BarChart
                key={chart}
                bars={weekBars(sel.weeks, chartOral ? (w) => w.nasalOral : (w) => w.nasalNasal, chartOral ? "คำด้านปาก" : "คำนาสิก")}
                max={60}
                unit="%"
                color="nasal"
                refLine={chartOral ? { value: oralTarget, label: `แผน ≤ ${oralTarget}%` } : { value: plan.gateThreshold, label: `แผน ≥ ${plan.gateThreshold}%` }}
                ariaLabel={`กราฟค่าออกจมูกเฉลี่ยรายสัปดาห์ขณะพูด${chartOral ? "คำด้านปาก" : "คำนาสิก"}ของ ${child.id}`}
                valueLabels="ends"
                height={220}
              />
              <WeekTable
                weeks={sel.weeks}
                pick={chartOral ? (w) => w.nasalOral : (w) => w.nasalNasal}
                caption={chartOral ? "ค่าออกจมูกรายสัปดาห์ คำด้านปาก" : "ค่าออกจมูกรายสัปดาห์ คำนาสิก"}
              />
            </section>

            <section className="dash-card dash-rules" aria-labelledby="rules-title">
              <h2 id="rules-title" className="dash-card__title">
                กฎแจ้งเตือน (เดโม)
              </h2>
              <ul className="rules">
                {sel.review.rules.map((r) => (
                  <li key={r.id} className={`rule rule--${r.state}`}>
                    <div className="rule__top">
                      <strong>{r.title}</strong>
                      <span className={`badge ${STATE_BADGE[r.state].cls}`}>{STATE_BADGE[r.state].text}</span>
                    </div>
                    <p className="rule__detail">{r.detail}</p>
                    <details className="rule__more">
                      <summary>ข้อมูลที่ใช้และกฎ</summary>
                      <p className="rule__data">ข้อมูลที่ใช้: {r.used.map((u) => `ส.${u.week} ${fmtPct(u.value)}`).join(" · ")}</p>
                      <p className="rule__def">กฎ: {r.rule}</p>
                    </details>
                  </li>
                ))}
              </ul>
              <p className="dash-card__fine">นับเฉพาะสัปดาห์ที่ฝึกอย่างน้อย {REVIEW_RULES.minDaysPerWeek} วัน เป็นกฎตัวอย่างที่ควรปรับร่วมกับนักแก้ไขการพูด</p>
            </section>
          </div>
        </section>

        <section role="tabpanel" id="panel-history" aria-labelledby="tab-history" className="dash-panel" hidden={tab !== "history"}>
          <div className="dash-card">
            <div className="dash-card__row">
              <h2 className="dash-card__title">ประวัติการฝึกล่าสุด</h2>
              <span className="dash-card__meta">
                {cal ? `ปรับเครื่องล่าสุด (จำลอง) ${fmtDayMonth(new Date(cal.at))} ${fmtTime(new Date(cal.at))}` : "ยังไม่มีการปรับเครื่อง"}
              </span>
            </div>
            <p className="table-hint" aria-hidden="true">
              เลื่อนตารางไปทางขวาเพื่อดูคอลัมน์ทั้งหมด →
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="ตารางประวัติการฝึก (เลื่อนแนวนอนได้)">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">วันที่ · เวลา</th>
                    <th scope="col">ระยะเวลา</th>
                    <th scope="col">เกม</th>
                    <th scope="col">ชุดคำ</th>
                    <th scope="col" className="num">
                      ครั้ง
                    </th>
                    <th scope="col" className="num">
                      ผ่านเกณฑ์ด้านปาก
                    </th>
                    <th scope="col" className="num">
                      ออกจมูก · คำด้านปาก
                    </th>
                    <th scope="col" className="num">
                      ออกจมูก · คำนาสิก
                    </th>
                    <th scope="col">ที่มา</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="table__empty">
                        ยังไม่มีประวัติการฝึก
                      </td>
                    </tr>
                  ) : (
                    history.map((s) => {
                      const d = new Date(s.startedAt);
                      return (
                        <tr key={s.id}>
                          <td>
                            {fmtDayMonth(d)} · {fmtTime(d)}
                          </td>
                          <td className="wrap">
                            {fmtDuration(s.durationSec)}
                            {s.rounds > 1 ? <small>{s.rounds} รอบ</small> : null}
                          </td>
                          <td className="wrap">
                            {GAME_LABEL[s.game]}
                            {s.gate ? " + ประตู" : ""}
                            {s.call ? <small>ด่านเรียกเพื่อน · เพื่อนได้ยิน {s.call.heard}/{s.call.target}</small> : null}
                            {!s.call && s.choice ? <small>เด็กเลือก: {s.choice.label}</small> : null}
                          </td>
                          <td>{s.words.join(" ")}</td>
                          <td className="num">
                            {s.attempts}
                            {s.call ? <small>สัญญาณใช้ได้ {s.passed}</small> : null}
                          </td>
                          <td className="num">
                            {s.call ? (
                              <>
                                —<small>ด่านนี้ไม่ใช้เกณฑ์</small>
                              </>
                            ) : (
                              <>
                                {s.attempts > 0 ? `${Math.round((s.passed / s.attempts) * 100)}%` : "—"}
                                <small>เกณฑ์ {s.oralThreshold}%</small>
                              </>
                            )}
                          </td>
                          <td className="num t-nasal">{fmtPct(s.meanNasalOral)}</td>
                          <td className="num t-nasal">{s.call ? fmtPct(callGroupNasal(s.call, "nasal").mean) : s.gate ? fmtPct(s.gate.meanNasal) : "—"}</td>
                          <td>
                            <span className={`badge ${s.source === "sample" ? "badge--sample" : "badge--demo"}`}>{s.source === "sample" ? "ตัวอย่าง" : s.source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต"}</span>
                            {s.endedEarly ? <span className="badge">จบก่อนครบ</span> : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section role="tabpanel" id="panel-plan" aria-labelledby="tab-plan" className="dash-panel" hidden={tab !== "plan"}>
          <div className="dash-card">
            <PlanForm key={child.id} child={child} />
            <div className="plan__kid">
              <button type="button" className="btn btn--secondary btn--sm" onClick={openKidView}>
                <Icon name="external" size={16} /> เปิดหน้าฝั่งเด็กของ {child.id} (เดโม)
              </button>
              <span className="field__hint">สลับเด็กในเครื่องนี้เพื่อเดโมเท่านั้น ไม่ใช่การเข้าสู่ระบบหรือการควบคุมสิทธิ์</span>
            </div>
          </div>
        </section>

        <section role="tabpanel" id="panel-data" aria-labelledby="tab-data" className="dash-panel" hidden={tab !== "data"}>
          <div className="dash-card data-tools">
            <h2 className="dash-card__title">แรงสั่น (เครื่องนี้)</h2>
            <p className="dash-card__sub">ตัวเสริมสำหรับเด็กเท่านั้น ภาพและข้อความในเกมยังบอกครบเมื่อปิด · จำค่าไว้ในเบราว์เซอร์นี้ ใช้กับเด็กทุกคนในเครื่องนี้</p>
            <HapticsSetting />
          </div>
          <div className="dash-card data-tools">
            <h2 className="dash-card__title">ข้อมูลเดโมในเบราว์เซอร์นี้</h2>
            <p className="dash-card__sub">ข้อมูลตัวอย่างสร้างครั้งเดียว รีเฟรชหน้าแล้วไม่เติมซ้ำ · ไม่มีการส่งข้อมูลออกจากเครื่อง</p>
            <div className="data-tools__row">
              <ConfirmButton label="ลบข้อมูลตัวอย่าง" confirmLabel="กดอีกครั้งเพื่อยืนยันการลบ" onConfirm={() => { clearSampleData(); showToast("ลบข้อมูลตัวอย่างแล้ว"); }} />
              <ConfirmButton label="ลบรอบที่เล่นในเดโม" confirmLabel="กดอีกครั้งเพื่อยืนยันการลบ" onConfirm={() => { clearDemoPlays(); showToast("ลบรอบที่เล่นในเดโมแล้ว"); }} />
              <ConfirmButton label="รีเซ็ตเป็นข้อมูลตัวอย่างเริ่มต้น" confirmLabel="กดอีกครั้งเพื่อยืนยันการรีเซ็ต" onConfirm={() => { resetAllDemoData(); showToast("รีเซ็ตข้อมูลเดโมแล้ว"); }} />
            </div>
          </div>
        </section>

        <Disclaimer />
      </main>
    </div>
  );
}
