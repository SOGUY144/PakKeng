import type { SignalFrame } from "../signal/SignalProcessor";
import type { MeterStatus, StatusKind } from "../signal/status";
import { fmtPct } from "../data/format";
import { Icon, type IconName } from "./Icon";

const STATUS_ICON: Record<StatusKind, IconName> = {
  pass: "check",
  try: "info",
  idle: "mic",
  warn: "alert",
  done: "star",
};

interface MeterProps {
  primary: "oral" | "nasal";
  frame: SignalFrame;
  threshold: number;
  thresholdLabel: string;
  status: MeterStatus;
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

export function Meter({ primary, frame, threshold, thresholdLabel, status }: MeterProps) {
  const value = primary === "oral" ? frame.oral : frame.nasal;
  const other = primary === "oral" ? frame.nasal : frame.oral;
  const speaking = frame.speaking && value !== null && other !== null;
  const pct = speaking ? clampPct(value) : 0;
  const otherPct = speaking ? clampPct(other) : 0;
  const name = primary === "oral" ? "ออกปาก" : "ออกจมูก";
  const otherName = primary === "oral" ? "ออกจมูก" : "ออกปาก";
  const markAlign = threshold > 82 ? "end" : threshold < 18 ? "start" : "center";

  return (
    <section className={`meter meter--${primary}${speaking ? "" : " meter--idle"}`} aria-label="แถบสัญญาณเสียง">
      <div className="meter__head">
        <span className="meter__name">
          <Icon name={primary === "oral" ? "mouth" : "nose"} size={18} />
          {name}
        </span>
        <span className="meter__value">{speaking ? fmtPct(value) : "—"}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={`ค่า${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={speaking ? Math.round(pct) : undefined}
        aria-valuetext={speaking ? `${Math.round(pct)}% ${thresholdLabel}` : "ยังไม่มีเสียงพูด"}
      >
        <div className="meter__zone" style={{ left: `${threshold}%` }} />
        <div className="meter__fill" style={{ transform: `scaleX(${pct / 100})` }} />
        <div className="meter__mark" style={{ left: `${threshold}%` }} />
      </div>
      <div className="meter__scale">
        <span className={`meter__marklabel meter__marklabel--${markAlign}`} style={{ left: `${threshold}%` }}>
          {thresholdLabel}
        </span>
      </div>
      <div className="meter__secondary">
        <span className="meter__name meter__name--sm">
          <Icon name={primary === "oral" ? "nose" : "mouth"} size={16} />
          {otherName} {speaking ? fmtPct(other) : "—"}
        </span>
        <div className="meter__mini" aria-hidden="true">
          <div className="meter__minifill" style={{ transform: `scaleX(${otherPct / 100})` }} />
        </div>
      </div>
      <p className={`meter__status meter__status--${status.kind}`} role="status">
        <Icon name={STATUS_ICON[status.kind]} size={18} />
        <span>{status.text}</span>
      </p>
    </section>
  );
}
