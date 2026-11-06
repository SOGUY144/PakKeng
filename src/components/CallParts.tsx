import { useState } from "react";
import { RESONANCE_LABEL, type FriendId } from "../data/callWords";
import { fmtPct } from "../data/format";
import type { CallWordSummary } from "../data/schema";
import type { CallIssue } from "../logic/call";
import { connectDevice, switchToDemo, useSignalSource } from "../signal/mock";
import { CHANNEL_TEXT } from "../signal/quality";
import type { SignalFrame } from "../signal/SignalProcessor";
import type { ConnectionState } from "../signal/types";
import { Icon } from "./Icon";
import { RenderImg } from "./RenderImg";

/** Picture of a friend rendered from its 3D model (front, or from behind while it has not heard the child yet). */
export function FriendPicture({ id, word, back = false, className }: { id: FriendId; word: string; back?: boolean; className?: string }) {
  return (
    <RenderImg
      className={className}
      name={`friend-${id}${back ? "-back" : ""}`}
      fallback={
        <span className={`friend-pic__fallback${className ? ` ${className}` : ""}`} aria-hidden="true">
          {word}
        </span>
      }
    />
  );
}

const ISSUE_LABEL: Record<CallIssue, string> = {
  quiet: "เบาไป",
  loud: "ล้น",
  lost: "หลุดกลางคัน",
  channel: "ไมค์ช่องหาย",
};

function issuesText(w: CallWordSummary): string | null {
  const parts = (Object.keys(ISSUE_LABEL) as CallIssue[]).filter((k) => w.issues[k] > 0).map((k) => `${ISSUE_LABEL[k]} ${w.issues[k]}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Per-word record for caregivers: what was practised, how often, and how often the signal was usable. */
export function WordTable({ words, caption }: { words: CallWordSummary[]; caption: string }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={`${caption} (เลื่อนแนวนอนได้)`}>
      <table className="table call-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">คำ</th>
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
              ออกจมูกเฉลี่ย*
            </th>
          </tr>
        </thead>
        <tbody>
          {words.map((w) => {
            const issues = issuesText(w);
            return (
              <tr key={w.id}>
                <th scope="row" className="wrap">
                  <span lang="th" className="call-table__word">
                    {w.word}
                  </span>
                  <small className={`call-table__type call-table__type--${w.resonance}`}>{RESONANCE_LABEL[w.resonance]}</small>
                  {w.heard ? <small>เพื่อนได้ยินแล้ว</small> : w.skipped ? <small>ข้ามไว้</small> : null}
                </th>
                <td className="num">{w.listens}</td>
                <td className="num">{w.attempts}</td>
                <td className="num">
                  {w.usable}
                  {issues ? <small>ใช้ไม่ได้: {issues}</small> : null}
                </td>
                <td className="num t-nasal">{w.usable > 0 ? fmtPct(w.meanNasal) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WordTableNote() {
  return (
    <p className="call-note">
      *เชิงพรรณนาเท่านั้น ใช้เฉพาะครั้งที่สัญญาณใช้ได้ · คำที่มีเสียงนาสิก (เช่น หมา นก) ควรมีค่าออกจมูกสูงกว่าคำปาก (เช่น ปู ปลา เต่า) ตามธรรมชาติ
      เกมจึงไม่ใช้กติกา “ยิ่งต่ำยิ่งดี” และไม่ใช้ค่านี้ตัดสินเด็ก · ค่าที่ต่างกัน 1–2 จุดระหว่างรอบอาจเป็นความแปรปรวนของการวัด
    </p>
  );
}

const fmtDb = (v: number | null) => (v === null ? "เงียบสนิท" : `${Math.round(v)} dBFS`);

interface Row {
  label: string;
  value: string;
  ok: boolean;
}

/** Device state for adults, with what to do next. Reads the same frame the game uses. */
export function DeviceStatus({ frame, conn, issue }: { frame: SignalFrame; conn: ConnectionState; issue: CallIssue | null }) {
  const q = frame.quality;
  const rows: Row[] = [
    {
      label: "การเชื่อมต่อ",
      value: conn === "connected" ? (frame.status === "stale" ? "เชื่อมต่ออยู่ แต่ข้อมูลไม่มาใหม่" : "เชื่อมต่อแล้ว") : conn === "connecting" ? "กำลังเชื่อมต่อ…" : "หลุด",
      ok: conn === "connected" && frame.status !== "stale",
    },
  ];
  if (conn === "connected" && q.known) {
    rows.push(
      { label: "ไมค์บน (ช่องจมูก)", value: fmtDb(q.nasalDb), ok: q.channels !== "nasal-missing" && q.channels !== "both-missing" },
      { label: "ไมค์ล่าง (ช่องปาก)", value: fmtDb(q.oralDb), ok: q.channels !== "oral-missing" && q.channels !== "both-missing" },
      { label: "สัญญาณล้น", value: q.clip ? "ล้นอยู่" : "ไม่ล้น", ok: !q.clip },
    );
  }

  let fix: string | null = null;
  if (conn === "disconnected") fix = "ตรวจไฟและการเชื่อมต่อของ ESP32 · เมื่อต่อใหม่ เกมจะเริ่มอ่านค่าใหม่ ไม่ใช้ข้อมูลก่อนหลุด และไม่นับรอบที่หลุดเป็นความผิดของเด็ก";
  else if (conn === "connecting") fix = "กำลังเชื่อมต่อ ถ้านานเกิน 10 วินาที ให้ตรวจที่อยู่ของอุปกรณ์";
  else if (frame.status === "stale") fix = "อุปกรณ์เชื่อมต่ออยู่แต่ไม่ส่งข้อมูลใหม่ ลองรีเซ็ต ESP32";
  else if (frame.status === "channel" && q.channels !== "ok" && q.channels !== "unknown")
    fix = `${CHANNEL_TEXT[q.channels]} · ตรวจสาย I2S (SCK, WS, SD), ไฟเลี้ยง และขา L/R ของ INMP441 ตัวนั้น`;
  else if (issue === "quiet") fix = "ครั้งล่าสุดเสียงเบาเกินไป · จัดแผ่นกั้นให้อยู่ใต้จมูกพอดี ให้เด็กพูดเสียงปกติ (ไม่ต้องตะโกน)";
  else if (issue === "loud") fix = "ครั้งล่าสุดสัญญาณล้น · ให้เด็กพูดเสียงสบาย ๆ หรือลดเกนของอุปกรณ์";
  else if (!q.known && conn === "connected") fix = "อุปกรณ์ไม่ได้ส่งระดับเสียงมา จึงตรวจเสียงเบา ล้น หรือไมค์หลุดไม่ได้ (ดู docs/DEVICE_PROTOCOL.md)";

  return (
    <div className="device-status">
      <ul className="device-status__rows">
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? "is-ok" : "is-bad"}>
            <Icon name={r.ok ? "check" : "alert"} size={16} />
            <span className="device-status__label">{r.label}</span>
            <span className="device-status__value">{r.value}</span>
          </li>
        ))}
      </ul>
      {fix ? (
        <p className="device-status__fix" role="status">
          <strong>วิธีแก้:</strong> {fix}
        </p>
      ) : null}
    </div>
  );
}

const URL_KEY = "nasal-trainer-demo:device-url";

function storedUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? "ws://192.168.4.1:81";
  } catch {
    return "ws://192.168.4.1:81";
  }
}

/** Demo mode ↔ real ESP32 over WebSocket. Games read whichever is active; their logic does not change. */
export function SourceSwitch() {
  const src = useSignalSource();
  const [url, setUrl] = useState(storedUrl);
  const demo = src.kind === "mock";
  const blocked = typeof window !== "undefined" && window.location.protocol === "https:" && url.trim().startsWith("ws://");
  const connect = () => {
    const u = url.trim();
    try {
      localStorage.setItem(URL_KEY, u);
    } catch {
      // per-viewer convenience only
    }
    connectDevice(u);
  };
  return (
    <div className="source-switch">
      <div className="seg" role="group" aria-label="แหล่งสัญญาณ">
        <button type="button" className="seg__btn" aria-pressed={demo} onClick={switchToDemo}>
          โหมดสาธิต
        </button>
        <button type="button" className="seg__btn" aria-pressed={!demo} onClick={connect} disabled={blocked || !/^wss?:\/\/\S+$/.test(url.trim())}>
          อุปกรณ์ ESP32
        </button>
      </div>
      <label className="field source-switch__url">
        <span className="field__label">ที่อยู่ WebSocket ของอุปกรณ์</span>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} />
      </label>
      {blocked ? (
        <p className="call-note">หน้านี้เปิดผ่าน https จึงต่อ ws:// ไม่ได้ ให้ใช้ wss:// หรือเปิดเว็บด้วย npm run dev ในวง Wi-Fi เดียวกับอุปกรณ์</p>
      ) : (
        <p className="call-note">เฟิร์มแวร์อยู่ใน firmware/ (รูปแบบข้อมูล docs/DEVICE_PROTOCOL.md) · หลุดแล้วต่อใหม่เอง · ยังไม่ได้ทดสอบกับ ESP32 จริง</p>
      )}
    </div>
  );
}
