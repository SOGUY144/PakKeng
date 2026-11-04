import { useEffect, useRef, useState } from "react";
import { BaffleDiagram } from "../components/Art";
import { DemoPanel } from "../components/DemoPanel";
import { Icon } from "../components/Icon";
import { fmtPct, fmtSec1 } from "../data/format";
import { missionGame } from "../data/plan";
import { saveCalibration, useActiveChild } from "../data/store";
import { useFrameRender, useGameLoop } from "../lib/hooks";
import { navigate } from "../lib/router";
import { clampDt } from "../logic/common";
import { signalSource } from "../signal/mock";
import { SignalProcessor, type SignalFrame } from "../signal/SignalProcessor";
import { IDLE_FRAME } from "./useGameRuntime";

/** Demo parameters for the simulated calibration. */
const CAL_COLLECT_MS = 3000;
const CAL_MIN_SEPARATION = 10;

type Step = 1 | 2 | 3 | 4;

interface Take {
  ms: number;
  sum: number;
  n: number;
}

const EMPTY_TAKE: Take = { ms: 0, sum: 0, n: 0 };
const mean = (t: Take) => (t.n > 0 ? t.sum / t.n : null);

const STEPS = [
  { n: 1, label: "จัดแผ่นกั้น" },
  { n: 2, label: "พูด “อาาา”" },
  { n: 3, label: "พูด “มาาา”" },
];

function frameLine(frame: SignalFrame, word: string, done: boolean): { kind: "ok" | "wait" | "warn"; text: string } {
  if (done) return { kind: "ok", text: "เก็บค่าครบแล้ว" };
  if (frame.status === "disconnected") return { kind: "warn", text: "อุปกรณ์หลุด หยุดเก็บค่าไว้ก่อน" };
  if (frame.status === "connecting" || frame.status === "stale") return { kind: "warn", text: "สัญญาณยังไม่พร้อม รอสักครู่" };
  if (frame.status === "channel") return { kind: "warn", text: "ไมค์ช่องหนึ่งไม่มีสัญญาณ ตรวจสายไมค์ก่อนเก็บค่า" };
  if (!frame.speaking) return { kind: "wait", text: `พูด “${word}” ค้างไว้ได้เลย` };
  return { kind: "ok", text: "ได้ยินเสียงแล้ว กำลังเก็บค่า" };
}

export function CalibrateScreen() {
  const child = useActiveChild();
  const plan = child.plan;
  const [step, setStep] = useState<Step>(1);
  const takes = useRef<{ aa: Take; ma: Take }>({ aa: { ...EMPTY_TAKE }, ma: { ...EMPTY_TAKE } });
  const processor = useRef(new SignalProcessor());
  const frameRef = useRef<SignalFrame>(IDLE_FRAME);
  const [saved, setSaved] = useState(false);
  const render = useFrameRender();

  const collecting = step === 2 || step === 3;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);
  useGameLoop((now, dt) => {
    const src = signalSource();
    const frame = processor.current.step(src.latest(), src.connection(), now);
    frameRef.current = frame;
    const key = step === 2 ? "aa" : "ma";
    const take = takes.current[key];
    if (frame.speaking && frame.nasalRaw !== null && take.ms < CAL_COLLECT_MS) {
      takes.current[key] = { ms: Math.min(CAL_COLLECT_MS, take.ms + clampDt(dt)), sum: take.sum + frame.nasalRaw, n: take.n + 1 };
    }
    render();
  }, collecting);

  const frame = frameRef.current;
  const key = step === 2 ? "aa" : "ma";
  const take = takes.current[key];
  const word = step === 2 ? "อาาา" : "มาาา";
  const done = take.ms >= CAL_COLLECT_MS;
  const line = frameLine(frame, word, done);
  const remaining = Math.ceil((CAL_COLLECT_MS - take.ms) / 1000);
  const aa = mean(takes.current.aa);
  const ma = mean(takes.current.ma);
  const separation = aa !== null && ma !== null ? ma - aa : null;
  const separationOk = separation !== null && separation >= CAL_MIN_SEPARATION;

  const retake = () => {
    takes.current[key] = { ...EMPTY_TAKE };
    processor.current.reset();
    render();
  };

  const restartAll = () => {
    takes.current = { aa: { ...EMPTY_TAKE }, ma: { ...EMPTY_TAKE } };
    processor.current.reset();
    setSaved(false);
    setStep(1);
  };

  const goNext = () => {
    if (step === 3) {
      if (separationOk && aa !== null && ma !== null) {
        saveCalibration(child.id, { at: new Date().toISOString(), aaNasal: Math.round(aa * 10) / 10, maNasal: Math.round(ma * 10) / 10, simulated: true });
        setSaved(true);
      }
      setStep(4);
      return;
    }
    processor.current.reset();
    setStep((s) => (s + 1) as Step);
  };

  const back = () => {
    if (step === 1) navigate("home");
    else setStep((s) => (s - 1) as Step);
  };

  const mission = missionGame(plan);
  const hint =
    step === 2
      ? "เปิด “มีเสียง” หรือกดค้างเพื่อพูด (ค่าเริ่มต้นออกปาก 75% ≈ เสียง “อาาา”)"
      : step === 3
        ? "ลากแถบไปทางซ้ายให้ออกจมูกสูงขึ้น (เช่น ออกปาก 45%) เพื่อจำลองเสียง “มาาา”"
        : "ขั้นนี้ยังไม่ใช้สัญญาณ";

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page cal">
        <header className="cal-head">
          <button type="button" className="icon-btn" onClick={back} aria-label={step === 1 ? "กลับหน้าหลัก" : "ย้อนกลับขั้นก่อนหน้า"}>
            <Icon name="back" size={22} />
          </button>
          <h1 className="cal-head__title">ปรับเครื่องก่อนเล่น</h1>
          <button type="button" className="btn btn--ghost btn--sm" onClick={restartAll}>
            <Icon name="refresh" size={16} /> เริ่มใหม่
          </button>
        </header>

        <ol className="stepper" aria-label="ขั้นตอนการปรับเครื่อง">
          {STEPS.map((s) => (
            <li key={s.n} className={`stepper__item${step > s.n ? " is-done" : step === s.n ? " is-current" : ""}`} aria-current={step === s.n ? "step" : undefined}>
              <span className="stepper__bar" />
              <span className="stepper__label">
                {step > s.n ? <Icon name="check" size={14} /> : null}
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="cal-count">{step <= 3 ? `ขั้นที่ ${step} จาก 3` : "สรุปผลการปรับเครื่อง"}</p>
        <p className="cal-demo">
          <Icon name="info" size={16} /> เดโม: เป็นการจำลองการปรับเครื่อง ยังไม่ได้ปรับฮาร์ดแวร์จริง
        </p>

        {step === 1 ? (
          <section className="card cal-card">
            <h2 className="cal-card__title">วิธีถือแผ่นกั้น</h2>
            <div className="cal-figure">
              <BaffleDiagram />
              <p className="cal-figure__cap">ภาพแสดงตำแหน่งโดยประมาณ ไม่ใช่แบบทางวิศวกรรม</p>
            </div>
            <ul className="checklist">
              <li>
                <Icon name="check" size={18} /> แผ่นกั้นแนบใต้จมูก แยกจมูกกับปากออกจากกัน
              </li>
              <li>
                <Icon name="check" size={18} /> ไมค์บนอยู่ด้านจมูก ไมค์ล่างอยู่ด้านปาก
              </li>
              <li>
                <Icon name="check" size={18} /> นั่งในที่เงียบ มีผู้ใหญ่ช่วยประคองได้
              </li>
            </ul>
          </section>
        ) : null}

        {collecting ? (
          <section className="card cal-card" aria-live="polite">
            <p className="cal-card__label">พูดตามนี้ค้างไว้ {CAL_COLLECT_MS / 1000} วินาที</p>
            <div className="cal-say">
              <span className="cal-say__word" lang="th">
                {word}
              </span>
              <span className={`cal-ring${done ? " is-done" : ""}`} aria-label={done ? "เก็บค่าครบแล้ว" : `เหลือ ${remaining} วินาที`}>
                <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="var(--surface-sunken)" strokeWidth="5" />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke={step === 2 ? "var(--oral)" : "var(--nasal)"}
                    strokeWidth="5"
                    strokeDasharray={`${(take.ms / CAL_COLLECT_MS) * 125.7} 125.7`}
                    transform="rotate(-90 24 24)"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="cal-ring__num">{done ? <Icon name="check" size={22} /> : remaining}</span>
              </span>
            </div>
            <div className="cal-signal">
              <span className={`cal-signal__line cal-signal__line--${line.kind}`}>
                <Icon name={line.kind === "warn" ? "alert" : line.kind === "ok" ? "mic" : "info"} size={16} /> {line.text}
              </span>
              <div className="progress" role="progressbar" aria-label="เวลาที่เก็บค่าแล้ว" aria-valuemin={0} aria-valuemax={CAL_COLLECT_MS} aria-valuenow={Math.round(take.ms)}>
                <div className="progress__fill" style={{ transform: `scaleX(${take.ms / CAL_COLLECT_MS})`, background: step === 2 ? "var(--oral)" : "var(--nasal)", transition: "none" }} />
              </div>
              <span className="cal-signal__meta">
                เก็บค่าแล้ว {fmtSec1(take.ms)} / {CAL_COLLECT_MS / 1000} วินาที (นับเฉพาะตอนมีเสียง)
              </span>
            </div>
            {done ? (
              <div className="cal-result">
                <span>
                  <Icon name="check" size={18} /> ค่าออกจมูกเฉลี่ยของเสียง “{word}”: <strong>{fmtPct(mean(take))}</strong>
                </span>
                <button type="button" className="btn btn--secondary btn--sm" onClick={retake}>
                  <Icon name="refresh" size={16} /> ลองใหม่
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 4 ? (
          <section className="card cal-card">
            <h2 className="cal-card__title">ค่าฐานรายบุคคล (จำลอง)</h2>
            <dl className="cal-summary">
              <div>
                <dt>เสียง “อาาา” (ควรออกปาก)</dt>
                <dd className="t-nasal">ออกจมูก {fmtPct(aa)}</dd>
              </div>
              <div>
                <dt>เสียง “มาาา” (ควรออกจมูก)</dt>
                <dd className="t-nasal">ออกจมูก {fmtPct(ma)}</dd>
              </div>
            </dl>
            {separationOk ? (
              <p className="cal-check cal-check--ok">
                <Icon name="check" size={18} /> สองเสียงต่างกัน {Math.round(separation ?? 0)} จุด แยกกันได้ บันทึกค่าฐานจำลองแล้ว
              </p>
            ) : (
              <p className="cal-check cal-check--warn">
                <Icon name="alert" size={18} /> สองเสียงต่างกันเพียง {Math.round(separation ?? 0)} จุด (ต้องต่างกันอย่างน้อย {CAL_MIN_SEPARATION} จุด) ลองจัดแผ่นกั้นให้แนบใต้จมูก แล้วเริ่มใหม่
              </p>
            )}
            <p className="cal-disclaimer">ค่าฐานรายบุคคลนี้ไม่ใช่การตรวจสอบความแม่นยำกับเครื่องมาตรฐาน และยังไม่ได้ใช้ปรับสเกลค่าในเกม</p>
          </section>
        ) : null}

        <div className="kid-actions">
          {step === 1 ? (
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={goNext}>
              พร้อมแล้ว ต่อไป <Icon name="next" size={20} />
            </button>
          ) : null}
          {collecting ? (
            <>
              <button type="button" className="btn btn--primary btn--lg btn--block" onClick={goNext} disabled={!done}>
                ต่อไป <Icon name="next" size={20} />
              </button>
              {!done ? <p className="kid-actions__hint">พูดให้ครบ {CAL_COLLECT_MS / 1000} วินาทีก่อน</p> : null}
            </>
          ) : null}
          {step === 4 && separationOk ? (
            <>
              <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => navigate(mission ?? "home")}>
                <Icon name="play" size={20} /> เริ่มเล่น
              </button>
              <button type="button" className="btn btn--secondary btn--block" onClick={() => navigate("home")}>
                กลับหน้าหลัก
              </button>
            </>
          ) : null}
          {step === 4 && !separationOk ? (
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={restartAll}>
              <Icon name="refresh" size={20} /> เริ่มใหม่ตั้งแต่ขั้นที่ 1
            </button>
          ) : null}
          {saved ? <p className="kid-actions__hint">บันทึกค่าฐานจำลองแล้ว</p> : null}
        </div>

        {/* demo tools stay with the adult, folded until needed (same as in the games) */}
        <details className="card care">
          <summary className="care__summary">
            <Icon name="user" size={18} /> สำหรับผู้ดูแล: เครื่องมือสาธิต (เมื่อยังไม่ต่ออุปกรณ์จริง)
          </summary>
          <div className="care__body">
            <DemoPanel target={{ kind: step === 3 ? "nasal" : "oral", threshold: step === 3 ? plan.gateThreshold : plan.oralThreshold }} hint={hint} />
          </div>
        </details>
      </div>
    </div>
  );
}
