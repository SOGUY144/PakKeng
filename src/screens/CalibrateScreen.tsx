import { useEffect, useRef, useState } from "react";
import { BaffleDiagram } from "../components/Art";
import { CareSummary } from "../components/Chrome";
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
import "../styles/calibrate.css";

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

  const pct = Math.min(1, take.ms / CAL_COLLECT_MS);
  const side = step === 2 ? "oral" : "nasal";
  const RING = 578.05; // 2π × 92

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

        <div className="cal-top">
          <ol className="stepper" aria-label="ขั้นตอนการปรับเครื่อง">
            {STEPS.map((s) => (
              <li key={s.n} className={`stepper__item${step > s.n ? " is-done" : step === s.n ? " is-current" : ""}`} aria-current={step === s.n ? "step" : undefined}>
                <span className="stepper__dot" aria-hidden="true">
                  {step > s.n ? <Icon name="check" size={16} /> : s.n}
                </span>
                <span className="stepper__label">{s.label}</span>
              </li>
            ))}
          </ol>
          <p className="sr-only">{step <= 3 ? `ขั้นที่ ${step} จาก 3` : "สรุปผลการปรับเครื่อง"}</p>
          <p className="cal-demo">
            <Icon name="info" size={14} /> เดโม · จำลองการปรับเครื่อง ยังไม่ได้ใช้ฮาร์ดแวร์จริง
          </p>
        </div>

        <div className="cal-body">
          {step === 1 ? (
            <div className="cal-visual cal-visual--setup">
              <BaffleDiagram />
              <p className="cal-visual__cap">ภาพแสดงตำแหน่งโดยประมาณ ไม่ใช่แบบทางวิศวกรรม</p>
            </div>
          ) : null}

          {collecting ? (
            <div className={`cal-visual cal-visual--${side}`}>
              <div
                className={`cal-bubble${done ? " is-done" : ""}${line.kind === "ok" && !done ? " is-live" : ""}`}
                role="progressbar"
                aria-label={`เวลาที่เก็บค่าเสียง “${word}”`}
                aria-valuemin={0}
                aria-valuemax={CAL_COLLECT_MS}
                aria-valuenow={Math.round(take.ms)}
                aria-valuetext={done ? "เก็บค่าครบแล้ว" : `เก็บแล้ว ${fmtSec1(take.ms)} จาก ${CAL_COLLECT_MS / 1000} วินาที`}
              >
                <svg className="cal-bubble__ring" viewBox="0 0 200 200" aria-hidden="true">
                  <circle className="cal-bubble__track" cx="100" cy="100" r="92" />
                  <circle className="cal-bubble__fill" cx="100" cy="100" r="92" strokeDasharray={`${pct * RING} ${RING}`} transform="rotate(-90 100 100)" />
                </svg>
                <span className="cal-bubble__word" lang="th">
                  {word}
                </span>
                <span className="cal-bubble__count" aria-hidden="true">
                  {done ? <Icon name="check" size={20} /> : `${remaining} วิ`}
                </span>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="cal-visual cal-visual--sum">
              <div className="cal-compare" role="img" aria-label={`ค่าออกจมูกเฉลี่ย อาาา ${fmtPct(aa)} มาาา ${fmtPct(ma)}`}>
                {(
                  [
                    ["อาาา", aa],
                    ["มาาา", ma],
                  ] as const
                ).map(([w, v]) => (
                  <div key={w} className="cal-compare__col">
                    <strong>{fmtPct(v)}</strong>
                    <span className="cal-compare__bar">
                      <span style={{ height: `${Math.max(4, v ?? 0)}%` }} />
                    </span>
                    <span lang="th">{w}</span>
                  </div>
                ))}
              </div>
              <p className="cal-visual__cap">ค่าออกจมูกเฉลี่ยของแต่ละเสียง (จำลอง)</p>
            </div>
          ) : null}

          <div className="cal-panel">
            {step === 1 ? (
              <>
                <h2 className="cal-panel__title">จัดแผ่นกั้นให้พร้อม</h2>
                <ul className="cal-list">
                  <li>
                    <span className="cal-list__icon cal-list__icon--mint" aria-hidden="true">
                      <Icon name="nose" size={22} />
                    </span>
                    แผ่นกั้นแนบใต้จมูก แยกจมูกกับปาก
                  </li>
                  <li>
                    <span className="cal-list__icon cal-list__icon--lilac" aria-hidden="true">
                      <Icon name="mic" size={22} />
                    </span>
                    ไมค์บนอยู่ด้านจมูก ไมค์ล่างอยู่ด้านปาก
                  </li>
                  <li>
                    <span className="cal-list__icon cal-list__icon--lemon" aria-hidden="true">
                      <Icon name="ear" size={22} />
                    </span>
                    นั่งในที่เงียบ มีผู้ใหญ่ช่วยประคอง
                  </li>
                </ul>
                <button type="button" className="btn btn--primary btn--lg btn--block" onClick={goNext}>
                  พร้อมแล้ว ไปต่อ <Icon name="next" size={20} />
                </button>
              </>
            ) : null}

            {collecting ? (
              <>
                <h2 className="cal-panel__title">
                  พูด “<span lang="th">{word}</span>” ค้างไว้
                </h2>
                <p className="cal-panel__lead">นับ {CAL_COLLECT_MS / 1000} วินาที เฉพาะตอนที่มีเสียง</p>
                <p className={`cal-status cal-status--${line.kind}`} aria-live="polite">
                  <Icon name={line.kind === "warn" ? "alert" : line.kind === "ok" ? "mic" : "ear"} size={18} /> {line.text}
                </p>
                <p className="cal-meta">
                  เก็บแล้ว {fmtSec1(take.ms)} / {CAL_COLLECT_MS / 1000} วินาที
                </p>
                {done ? (
                  <div className="cal-result">
                    <span>
                      ออกจมูกเฉลี่ย <strong>{fmtPct(mean(take))}</strong>
                    </span>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={retake}>
                      <Icon name="refresh" size={16} /> ลองใหม่
                    </button>
                  </div>
                ) : null}
                <button type="button" className="btn btn--primary btn--lg btn--block" onClick={goNext} disabled={!done}>
                  ต่อไป <Icon name="next" size={20} />
                </button>
                {!done ? <p className="kid-actions__hint">พูดให้ครบ {CAL_COLLECT_MS / 1000} วินาทีก่อน</p> : null}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <h2 className="cal-panel__title">{separationOk ? "ปรับเครื่องเสร็จแล้ว!" : "ยังแยกสองเสียงไม่ได้"}</h2>
                {separationOk ? (
                  <p className="cal-check cal-check--ok">
                    <Icon name="check" size={18} /> สองเสียงต่างกัน {Math.round(separation ?? 0)} จุด แยกกันได้ บันทึกค่าฐานจำลองแล้ว
                  </p>
                ) : (
                  <p className="cal-check cal-check--warn">
                    <Icon name="alert" size={18} /> ต่างกันเพียง {Math.round(separation ?? 0)} จุด (ต้องอย่างน้อย {CAL_MIN_SEPARATION} จุด) ลองจัดแผ่นกั้นให้แนบใต้จมูก แล้วเริ่มใหม่
                  </p>
                )}
                {separationOk ? (
                  <>
                    <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => navigate(mission ?? "home")}>
                      <Icon name="play" size={20} /> เริ่มเล่น
                    </button>
                    <button type="button" className="btn btn--secondary btn--block" onClick={() => navigate("home")}>
                      กลับหน้าหลัก
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--primary btn--lg btn--block" onClick={restartAll}>
                    <Icon name="refresh" size={20} /> เริ่มใหม่ตั้งแต่ขั้นที่ 1
                  </button>
                )}
                {saved ? <p className="kid-actions__hint">บันทึกค่าฐานจำลองแล้ว</p> : null}
                <p className="cal-meta">ค่าฐานรายบุคคลนี้ไม่ใช่การตรวจสอบความแม่นยำกับเครื่องมาตรฐาน และยังไม่ได้ใช้ปรับสเกลค่าในเกม</p>
              </>
            ) : null}
          </div>
        </div>

        {/* demo tools stay with the adult, folded until needed (same as in the games) */}
        <details className="card care">
          <CareSummary sub="เครื่องมือสาธิต เมื่อยังไม่ต่ออุปกรณ์จริง" />
          <div className="care__body">
            <DemoPanel target={{ kind: step === 3 ? "nasal" : "oral", threshold: step === 3 ? plan.gateThreshold : plan.oralThreshold }} hint={hint} />
          </div>
        </details>
      </div>
    </div>
  );
}
