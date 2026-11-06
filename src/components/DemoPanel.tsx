import { useEffect, type ReactNode } from "react";
import { isPlaying, subscribePlaying } from "../lib/speech";
import { mockSource, switchToDemo, useConnection, useMockParams, useSignalSource } from "../signal/mock";
import type { MicChannels, SpeechMode, ValuePattern, VoiceLevel } from "../signal/MockSignalSource";
import { renderDelayStats } from "../signal/latency";
import { useMotionPref } from "../lib/hooks";
import { setMotionPref, type MotionPref } from "../lib/motion";
import { setGfxPref, stageMode, TIER_LABEL, useGfx, type GfxPref, type GfxState } from "../three/gfx";
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

const LEVELS: { id: VoiceLevel; label: string }[] = [
  { id: "normal", label: "ปกติ" },
  { id: "quiet", label: "เบาเกินไป" },
  { id: "loud", label: "ดังจนล้น" },
];

const CHANNELS: { id: MicChannels; label: string }[] = [
  { id: "both", label: "ครบสองช่อง" },
  { id: "nasal-missing", label: "ไมค์บน (จมูก) หลุด" },
  { id: "oral-missing", label: "ไมค์ล่าง (ปาก) หลุด" },
];

const GFX: { id: GfxPref; label: string }[] = [
  { id: "auto", label: "อัตโนมัติ" },
  { id: "high", label: "3D สูง" },
  { id: "low", label: "3D ประหยัด" },
  { id: "2d", label: "2D" },
];

const MOTION: { id: MotionPref; label: string }[] = [
  { id: "system", label: "ตามเครื่อง" },
  { id: "reduce", label: "ลดลง" },
  { id: "full", label: "เต็ม" },
];

function gfxText(g: GfxState): string {
  const mode = stageMode(g);
  if (mode.kind === "2d") {
    return mode.reason === "pref" ? "แสดงแบบ 2D" : mode.reason === "no-webgl" ? "เบราว์เซอร์นี้ไม่มี WebGL → 2D" : `${mode.message ?? "3D มีปัญหา"} → 2D`;
  }
  const st = g.stats;
  const tier = `3D ระดับ${TIER_LABEL[mode.tier]}${g.pref === "auto" ? " (เลือกอัตโนมัติ)" : ""}`;
  if (!st) return `${tier} · กำลังวัดเฟรม…`;
  return `${tier} · ${st.fps} fps · ${st.calls} draw calls · ${(st.triangles / 1000).toFixed(1)}k สามเหลี่ยม · pixel ratio ${st.dpr}`;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY", "A"].includes(t.tagName);
}

export function DemoPanel(props: DemoPanelProps) {
  const src = useSignalSource();
  if (src.kind !== "mock") {
    return (
      <aside className="demo" aria-label="เครื่องมือเดโม">
        <div className="demo__head">
          <span className="demo__title">ใช้อุปกรณ์จริงอยู่ (ESP32)</span>
        </div>
        <p className="demo__hint">เครื่องมือจำลองสัญญาณปิดอยู่ ค่าทั้งหมดมาจากอุปกรณ์</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={switchToDemo}>
          กลับไปโหมดสาธิต
        </button>
      </aside>
    );
  }
  return <MockControls {...props} />;
}

function MockControls({ target, hint, children }: DemoPanelProps) {
  const params = useMockParams();
  const conn = useConnection();
  const gfx = useGfx();
  const motion = useMotionPref();
  const oscCenter = target.kind === "oral" ? target.threshold : 100 - target.threshold;

  useEffect(() => {
    mockSource.setParams({ oscillateCenter: oscCenter });
  }, [oscCenter]);

  // "Speaker leaks into the mics" demo: follow the example player so the leak lasts exactly as long as playback.
  useEffect(
    () =>
      subscribePlaying(() => {
        mockSource.setParams({ speaker: isPlaying() });
      }),
    [],
  );

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
        <span className="demo__title">จำลองสัญญาณจากอุปกรณ์</span>
        <span className="badge badge--demo">เดโม · ไม่ใช่ค่าจริง</span>
      </div>
      {hint ? <p className="demo__hint">{hint}</p> : null}

      <output htmlFor="demo-oral" className="demo__readout">
        <span className="demo__stat demo__stat--oral">
          <small>ออกปาก</small>
          <strong>{shownOral}%</strong>
        </span>
        <span className="demo__stat demo__stat--nasal">
          <small>ออกจมูก</small>
          <strong>{100 - shownOral}%</strong>
        </span>
      </output>
      <label htmlFor="demo-oral" className="sr-only">
        ค่าออกปาก (จำลอง)
      </label>
      <input
        id="demo-oral"
        className="range range--split"
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
      {/* plain ink: the track's own blue/orange already says which side is which */}
      <div className="demo__ends" aria-hidden="true">
        <span>← ออกจมูกมาก</span>
        <span>ออกปากมาก →</span>
      </div>
      <p id="demo-oral-note" className="sr-only">
        ออกจมูกคำนวณจาก 100 ลบค่าออกปาก
      </p>

      <div className="demo__group">
        <span className="demo__label">เสียงพูด</span>
        <div className="seg seg--fill" role="group" aria-label="เสียงพูด (จำลอง)">
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
      </div>
      <button
        type="button"
        className={`btn btn--block demo__hold${params.holding ? " is-active" : ""}`}
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
        <Icon name="hand" size={20} />
        {params.holding ? "กำลังพูด…" : "กดค้างเพื่อพูด"}
      </button>

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
        <div className="demo__group">
          <span className="demo__label">ความดังเสียงที่ไมค์ (จำลอง)</span>
          <div className="seg" role="group" aria-label="ความดังเสียงที่ไมค์ (จำลอง)">
            {LEVELS.map((o) => (
              <button key={o.id} type="button" className="seg__btn" aria-pressed={params.level === o.id} onClick={() => mockSource.setParams({ level: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="demo__group">
          <span className="demo__label">ช่องไมค์ (จำลอง)</span>
          <div className="seg seg--wrap" role="group" aria-label="ช่องไมค์ (จำลอง)">
            {CHANNELS.map((o) => (
              <button key={o.id} type="button" className="seg__btn" aria-pressed={params.channels === o.id} onClick={() => mockSource.setParams({ channels: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="demo__check">
          <input type="checkbox" checked={params.leak} onChange={(e) => mockSource.setParams({ leak: e.target.checked })} />
          จำลองเสียงลำโพงรั่วเข้าไมค์ระหว่างเล่นเสียงตัวอย่าง (เกมต้องไม่นับ)
        </label>
        <div className="demo__group">
          <span className="demo__label">ภาพฉากเกม</span>
          <div className="seg" role="group" aria-label="ภาพฉากเกม">
            {GFX.map((o) => (
              <button key={o.id} type="button" className="seg__btn" aria-pressed={gfx.pref === o.id} onClick={() => setGfxPref(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <span className="demo__meta">{gfxText(gfx)}</span>
        </div>
        <div className="demo__group">
          <span className="demo__label">ภาพเคลื่อนไหว</span>
          <div className="seg" role="group" aria-label="ภาพเคลื่อนไหว">
            {MOTION.map((o) => (
              <button key={o.id} type="button" className="seg__btn" aria-pressed={motion === o.id} onClick={() => setMotionPref(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <span className="demo__meta">“ตามเครื่อง” ใช้ค่าลดการเคลื่อนไหวของระบบปฏิบัติการ</span>
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
