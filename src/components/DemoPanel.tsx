import { useEffect, type ReactNode } from "react";
import { mockSource, useConnection, useMockParams } from "../signal/mock";
import type { SpeechMode, ValuePattern } from "../signal/MockSignalSource";
import { renderDelayStats } from "../signal/latency";
import { Icon } from "./Icon";

interface DemoPanelProps {
  /** Which value the active screen judges, so "oscillate" hovers around the right threshold. */
  target: { kind: "oral" | "nasal"; threshold: number };
  hint?: string;
  children?: ReactNode;
}

const SPEECH: { id: SpeechMode; label: string }[] = [
  { id: "off", label: "ไม่มีเสียง" },
  { id: "on", label: "มีเสียง" },
  { id: "bursts", label: "เป็นช่วง ๆ" },
];

const PATTERNS: { id: ValuePattern; label: string }[] = [
  { id: "manual", label: "ตามแถบเลื่อน" },
  { id: "ramp", label: "ค่อย ๆ เปลี่ยน" },
  { id: "oscillate", label: "แกว่งใกล้เกณฑ์" },
];

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY", "A"].includes(t.tagName);
}

export function DemoPanel({ target, hint, children }: DemoPanelProps) {
  const params = useMockParams();
  const conn = useConnection();
  const oscCenter = target.kind === "oral" ? target.threshold : 100 - target.threshold;

  useEffect(() => {
    mockSource.setParams({ oscillateCenter: oscCenter });
  }, [oscCenter]);

  // Space = hold to speak (ignored while typing or when a control has focus).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      mockSource.setParams({ holding: true });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (mockSource.getParams().holding) mockSource.setParams({ holding: false });
    };
    const blur = () => mockSource.setParams({ holding: false });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      if (mockSource.getParams().holding) mockSource.setParams({ holding: false });
    };
  }, []);

  const latest = mockSource.latest();
  const liveOral = latest ? Math.round(100 - latest.nasalPercent) : params.oralPercent;
  const shownOral = params.pattern === "manual" ? params.oralPercent : liveOral;
  const stats = renderDelayStats();
  const hold = (on: boolean) => mockSource.setParams({ holding: on });

  return (
    <aside className="demo" aria-label="เครื่องมือเดโม">
      <div className="demo__head">
        <span className="demo__title">เดโม: จำลองสัญญาณจากอุปกรณ์</span>
        <span className="badge badge--demo">ไม่ใช่ค่าจริง</span>
      </div>
      {hint ? <p className="demo__hint">{hint}</p> : null}

      <div className="demo__row demo__row--between">
        <label htmlFor="demo-oral" className="demo__label">
          ค่าออกปาก (จำลอง)
        </label>
        <output htmlFor="demo-oral" className="demo__readout">
          <span className="t-oral">ออกปาก {shownOral}%</span> · <span className="t-nasal">ออกจมูก {100 - shownOral}%</span>
        </output>
      </div>
      <input
        id="demo-oral"
        className="range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={shownOral}
        disabled={params.pattern !== "manual"}
        style={{ ["--pct" as string]: `${shownOral}%` }}
        onChange={(e) => mockSource.setParams({ oralPercent: Number(e.target.value) })}
        aria-describedby="demo-oral-note"
      />
      <p id="demo-oral-note" className="sr-only">
        ออกจมูกคำนวณจาก 100 ลบค่าออกปาก
      </p>

      <div className="demo__row demo__row--wrap">
        <div className="seg" role="group" aria-label="เสียงพูด (จำลอง)">
          {SPEECH.map((s) => (
            <button
              key={s.id}
              type="button"
              className="seg__btn"
              aria-pressed={params.speechMode === s.id}
              onClick={() => mockSource.setParams({ speechMode: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`btn btn--secondary btn--sm demo__hold${params.holding ? " is-active" : ""}`}
          aria-pressed={params.holding}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onLostPointerCapture={() => hold(false)}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              hold(true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") hold(false);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Icon name="hand" size={18} />
          {params.holding ? "กำลังพูด…" : "กดค้างเพื่อพูด"}
        </button>
      </div>

      <details className="demo__more">
        <summary>ตัวเลือกทดสอบเพิ่ม</summary>
        <div className="demo__group">
          <span className="demo__label">รูปแบบค่า</span>
          <div className="seg" role="group" aria-label="รูปแบบค่า (จำลอง)">
            {PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="seg__btn"
                aria-pressed={params.pattern === p.id}
                onClick={() => mockSource.setParams({ pattern: p.id })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="demo__group">
          <span className="demo__label">การเชื่อมต่อ (จำลอง)</span>
          <div className="seg" role="group" aria-label="การเชื่อมต่อ (จำลอง)">
            <button
              type="button"
              className="seg__btn"
              aria-pressed={params.linkUp}
              onClick={() => mockSource.setParams({ linkUp: true })}
            >
              <Icon name="plug" size={16} /> เชื่อมต่อ
            </button>
            <button
              type="button"
              className="seg__btn"
              aria-pressed={!params.linkUp}
              onClick={() => mockSource.setParams({ linkUp: false })}
            >
              <Icon name="unplug" size={16} /> ตัดการเชื่อมต่อ
            </button>
          </div>
          <span className="demo__meta">
            สถานะ: {conn === "connected" ? "เชื่อมต่อแล้ว" : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "ขาดการเชื่อมต่อ"}
          </span>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => mockSource.reset()}>
          <Icon name="refresh" size={16} /> รีเซ็ตเครื่องมือเดโม
        </button>
        <p className="demo__meta">
          {stats
            ? `อายุข้อมูล mock ขณะวาดจอ: p50 ${Math.round(stats.p50)} ms · p95 ${Math.round(stats.p95)} ms`
            : "อายุข้อมูล mock ขณะวาดจอ: กำลังเก็บค่า…"}
          <br />
          วัดเฉพาะ mock → หน้าจอ ไม่ใช่เวลาตอบสนองของอุปกรณ์จริง (ยังไม่มีการวัด)
        </p>
      </details>
      {children}
    </aside>
  );
}
