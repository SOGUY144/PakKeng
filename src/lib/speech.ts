/**
 * เสียงตัวอย่างของคำ: ไฟล์ที่นักแก้ไขการพูดอัด (ถ้ามี) → เสียงภาษาไทยของเครื่อง (speechSynthesis) → ไม่มี (ให้ผู้ใหญ่พูดแทน)
 * เสียงสังเคราะห์เป็นตัวแทนชั่วคราวเท่านั้น ไม่ใช่ต้นแบบการออกเสียงที่ผ่านการตรวจ
 * ระหว่างเล่น เกมต้องหยุดฟังไมค์ (ดู CallGame.listenStart) — สถานะ “กำลังเล่น” อ่านได้จาก isPlaying()
 */
export type ExampleKind = "recording" | "tts" | "none";
export type PlayResult = "ended" | "cancelled" | "error";

/** คำ → URL ไฟล์เสียงที่ตรวจสอบแล้ว เช่น `${import.meta.env.BASE_URL}audio/pu.m4a` (ยังไม่มีไฟล์) */
export const EXAMPLE_AUDIO: Record<string, string> = {};

let current: { cancel: () => void; keep?: unknown } | null = null;
let playing = false;
const listeners = new Set<() => void>();

function setPlaying(v: boolean): void {
  if (playing === v) return;
  playing = v;
  for (const l of listeners) l();
}

export function isPlaying(): boolean {
  return playing;
}

export function subscribePlaying(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function thaiVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("th"));
  // Prefer a voice installed on the device (works offline, starts faster).
  return voices.find((v) => v.localService) ?? voices[0] ?? null;
}

/** What "ฟังคำ" can play on this device right now. */
export function exampleKind(word: string): ExampleKind {
  if (EXAMPLE_AUDIO[word]) return "recording";
  return thaiVoice() ? "tts" : "none";
}

/** Voices load asynchronously in Chromium: re-check exampleKind() when this fires. */
export function subscribeVoices(cb: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", cb);
  return () => s.removeEventListener("voiceschanged", cb);
}

export function stopExample(): void {
  current?.cancel();
}

/** Play `text` (a word, or the friend's reply). Resolves when playback is over; never leaves the game waiting. */
export function playExample(text: string, opts: { rate?: number; voiceOnly?: boolean } = {}): Promise<PlayResult> {
  stopExample();
  const src = opts.voiceOnly ? undefined : EXAMPLE_AUDIO[text];
  return new Promise<PlayResult>((resolve) => {
    let settled = false;
    let guard: ReturnType<typeof setTimeout> | null = null;
    const finish = (r: PlayResult) => {
      if (settled) return;
      settled = true;
      if (guard) clearTimeout(guard);
      current = null;
      setPlaying(false);
      resolve(r);
    };

    if (src) {
      const audio = new Audio(src);
      audio.onended = () => finish("ended");
      audio.onerror = () => finish("error");
      current = {
        cancel: () => {
          audio.pause();
          finish("cancelled");
        },
      };
      setPlaying(true);
      audio.play().catch(() => finish("error"));
      return;
    }

    const s = synth();
    const voice = thaiVoice();
    if (!s || !voice) {
      finish("error");
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = opts.rate ?? 0.8;
    u.pitch = 1.05;
    u.onend = () => finish("ended");
    u.onerror = (e) => finish(e.error === "canceled" || e.error === "interrupted" ? "cancelled" : "error");
    // Chromium sometimes never fires `end`: cap the wait so listening always resumes.
    guard = setTimeout(() => finish("ended"), 2500 + text.length * 350);
    current = {
      cancel: () => {
        s.cancel();
        finish("cancelled");
      },
      keep: u, // keeps the utterance referenced (GC'd utterances lose their events in Chromium)
    };
    setPlaying(true);
    s.cancel();
    s.speak(u);
  });
}
