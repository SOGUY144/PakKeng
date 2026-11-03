import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEscape } from "../lib/hooks";
import { StarShape } from "./Art";
import { Icon } from "./Icon";

export function GameHud({ title, sub, stars, onPause }: { title: string; sub: string; stars: number; onPause: () => void }) {
  return (
    <header className="hud">
      <button type="button" className="icon-btn" onClick={onPause} aria-label="พักเกม">
        <Icon name="pause" size={22} />
      </button>
      <div className="hud__title">
        <span className="hud__game">{title}</span>
        <span className="hud__sub">{sub}</span>
      </div>
      <span className="pill hud__stars" aria-label={`ดาวที่เก็บได้รอบนี้ ${stars} ดวง`}>
        <StarShape size={18} />
        <span aria-hidden="true">ดาว {stars}</span>
      </span>
    </header>
  );
}

/**
 * ยังไม่มีไฟล์เสียงตัวอย่างที่ตรวจสอบแล้ว → ปุ่มบอกสถานะตรง ๆ (ไม่ใช่ปุ่มหลอก)
 * เมื่อมีเสียงที่นักแก้ไขการพูดอัดไว้ ให้ใส่ URL ใน EXAMPLE_AUDIO แล้วปุ่มจะเล่นเสียงจริง
 */
const EXAMPLE_AUDIO: Record<string, string> = {};

export function ListenButton({ word }: { word: string }) {
  const [note, setNote] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const src = EXAMPLE_AUDIO[word];
  const onClick = () => {
    if (src) {
      void new Audio(src).play();
      return;
    }
    setNote(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(false), 4000);
  };
  return (
    <div className="listen">
      <button type="button" className="btn btn--secondary btn--sm listen__btn" onClick={onClick} aria-describedby="listen-note">
        <Icon name="speaker" size={18} />
        <span className="listen__text">
          ฟังตัวอย่าง
          {!src ? <small>ยังไม่มีเสียง</small> : null}
        </span>
      </button>
      <p id="listen-note" className={`listen__note${note ? " is-open" : ""}`} role="status">
        {note ? "ยังไม่มีไฟล์เสียงตัวอย่างที่ตรวจสอบแล้ว ให้ผู้ใหญ่พูดให้ฟังก่อนนะ" : ""}
      </p>
    </div>
  );
}

export function PromptCard({ label, word, sub, children }: { label: string; word: string; sub?: string; children?: ReactNode }) {
  if (children) {
    // Custom content (e.g. the frog's syllable chips) gets the full card width under the label row.
    return (
      <section className="prompt prompt--stack" aria-label="โจทย์">
        <div className="prompt__row">
          <p className="prompt__label">{label}</p>
          <ListenButton word={word} />
        </div>
        {children}
        {sub ? <p className="prompt__sub">{sub}</p> : null}
      </section>
    );
  }
  return (
    <section className="prompt" aria-label="โจทย์">
      <div className="prompt__main">
        <p className="prompt__label">{label}</p>
        {children ?? (
          <p className={`prompt__word${word.length > 6 ? " prompt__word--long" : ""}`} lang="th">
            {word}
          </p>
        )}
        {sub ? <p className="prompt__sub">{sub}</p> : null}
      </div>
      <ListenButton word={word} />
    </section>
  );
}

interface PauseProps {
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
  onFinish?: () => void;
  reason?: "user" | "hidden";
}

export function PauseOverlay({ onResume, onRestart, onHome, onFinish, reason = "user" }: PauseProps) {
  useEscape(true, onResume);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="overlay__card">
        <h2 id="pause-title">{reason === "hidden" ? "พักไว้ให้แล้ว" : "พักก่อนนะ"}</h2>
        <p className="overlay__text">
          {reason === "hidden" ? "ออกจากหน้านี้ไปแป๊บหนึ่ง " : ""}เกมหยุดนับเวลาและคะแนนไว้ ไม่มีอะไรหายไป
        </p>
        <div className="overlay__actions">
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onResume} autoFocus>
            <Icon name="play" size={20} /> เล่นต่อ
          </button>
          {onFinish ? (
            <button type="button" className="btn btn--secondary btn--block" onClick={onFinish}>
              จบรอบและดูสรุป
            </button>
          ) : null}
          <button type="button" className="btn btn--secondary btn--block" onClick={onRestart}>
            <Icon name="refresh" size={18} /> เริ่มรอบใหม่
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onHome}>
            กลับหน้าหลัก
          </button>
        </div>
        <p className="overlay__note">ถ้ากลับหน้าหลักหรือเริ่มรอบใหม่ รอบที่ยังไม่จบจะไม่ถูกบันทึก</p>
      </div>
    </div>
  );
}

/** Sheet shown when a round reaches its goal — one clear next action. */
export function DoneSheet({ title, text, action, onAction, secondary }: { title: string; text: string; action: string; onAction: () => void; secondary?: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div className="overlay__card overlay__card--done">
        <div className="done__burst" aria-hidden="true">
          <StarShape size={40} />
        </div>
        <h2 id="done-title">{title}</h2>
        <p className="overlay__text">{text}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onAction}>
          {action} <Icon name="next" size={20} />
        </button>
        {secondary}
      </div>
    </div>
  );
}
