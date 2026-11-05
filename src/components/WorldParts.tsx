import { useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "../lib/hooks";
import { useSignalSource } from "../signal/mock";
import type { SignalFrame } from "../signal/SignalProcessor";
import type { ConnectionState } from "../signal/types";
import type { CallIssue } from "../logic/call";
import { DeviceStatus, SourceSwitch } from "./CallParts";
import { CareSummary } from "./Chrome";
import { DemoPanel } from "./DemoPanel";
import { Icon } from "./Icon";

/**
 * Shared pieces of the four game screens: the adult corner (device, demo tools, this round's details) and its tag.
 * The demo tools live here — not in a permanent side panel — and open only when an adult needs them.
 */
const CARE_KEY = "nasal-trainer-demo:care-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(CARE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(CARE_KEY, open ? "1" : "0");
  } catch {
    // per-device convenience only
  }
}

/** Ref + "open it and bring it into view" for the adult corner. */
export function useCareDrawer() {
  const ref = useRef<HTMLDetailsElement>(null);
  const reduced = useReducedMotion();
  const open = () => {
    const d = ref.current;
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  };
  return { ref, open };
}

/** Readable "where do the numbers come from" tag; opens the adult corner. */
export function DemoTag({ onOpen }: { onOpen?: () => void }) {
  const src = useSignalSource();
  const demo = src.kind === "mock";
  const label = demo ? "โหมดสาธิต" : "อุปกรณ์จริง";
  const cls = `demo-tag${demo ? "" : " demo-tag--device"}`;
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen}>
      <Icon name={demo ? "info" : "plug"} size={16} /> {label}
    </button>
  ) : (
    <span className={cls}>
      <Icon name={demo ? "info" : "plug"} size={16} /> {label}
    </span>
  );
}

interface CareDrawerProps {
  careRef: React.RefObject<HTMLDetailsElement | null>;
  frame: SignalFrame;
  conn: ConnectionState;
  issue?: CallIssue | null;
  /** Game-specific notes / this round's table, shown under the device status. */
  children?: ReactNode;
  demo: { target: { kind: "oral" | "nasal"; threshold: number }; hint: string; extra?: ReactNode };
}

/** The adult corner of every game: device status and fixes, this round's details, signal source, demo tools. */
export function CareDrawer({ careRef, frame, conn, issue = null, children, demo }: CareDrawerProps) {
  const [initialOpen] = useState(readOpen);
  return (
    <details ref={careRef} id="caregiver" className="card care" open={initialOpen} onToggle={(e) => writeOpen(e.currentTarget.open)}>
      <CareSummary sub="อุปกรณ์ · เครื่องมือสาธิต · ผลรอบนี้" />
      <div className="care__body">
        <h3 className="care__title">สถานะอุปกรณ์</h3>
        <DeviceStatus frame={frame} conn={conn} issue={issue} />
        {children}
        <h3 className="care__title">แหล่งสัญญาณ</h3>
        <SourceSwitch />
        <DemoPanel target={demo.target} hint={demo.hint}>
          {demo.extra}
        </DemoPanel>
      </div>
    </details>
  );
}
