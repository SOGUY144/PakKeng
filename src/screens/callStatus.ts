import type { IconName } from "../components/Icon";
import type { ExampleKind } from "../lib/speech";
import type { CallIssue, CallState } from "../logic/call";
import type { SignalFrame } from "../signal/SignalProcessor";

/** Status line shared by the turn-based games (call a friend, run a route). */
export type Tone = "listen" | "speak" | "heard" | "retry" | "warn" | "done";

export interface Line {
  tone: Tone;
  icon: IconName;
  text: string;
  sub?: string;
}

export const ISSUE_SUB: Record<CallIssue, string> = {
  quiet: "เรียกด้วยเสียงปกติอีกครั้งนะ",
  loud: "เรียกด้วยเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง เรียกใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

/** One short line the child can follow: is the game playing a sound, listening, or did it hear? (text + icon + colour) */
export function callStatusLine(s: CallState, frame: SignalFrame, adultModel: boolean, kind: ExampleKind, heardSub: string, issueSub: Record<CallIssue, string> = ISSUE_SUB): Line {
  if (s.phase === "done") return { tone: "done", icon: "star", text: "ครบแล้ว!" };
  if ((s.phase === "playing" || s.phase === "settle") && s.playKind === "reply") return { tone: "heard", icon: "star", text: "ได้ยินแล้ว!" };
  if (s.phase === "playing") {
    return adultModel
      ? { tone: "listen", icon: "user", text: "ผู้ใหญ่พูดคำนี้ให้ฟังนะ", sub: "เกมยังไม่ฟังไมค์ระหว่างนี้" }
      : { tone: "listen", icon: "speaker", text: "ฟังนะ…", sub: "เกมยังไม่ฟังไมค์ระหว่างเล่นเสียง" };
  }
  if (frame.status === "disconnected") return { tone: "warn", icon: "unplug", text: "อุปกรณ์หลุด", sub: "รอผู้ใหญ่ต่อใหม่ แล้วค่อยพูดต่อ" };
  if (frame.status === "connecting") return { tone: "warn", icon: "plug", text: "กำลังต่ออุปกรณ์…" };
  if (frame.status === "stale") return { tone: "warn", icon: "alert", text: "สัญญาณยังไม่มา", sub: "รอแป๊บหนึ่ง" };
  if (frame.status === "channel") return { tone: "warn", icon: "alert", text: "ไมค์ยังไม่พร้อม", sub: "รอผู้ใหญ่ช่วยดูสายไมค์" };
  if (s.phase === "settle") return { tone: "speak", icon: "ear", text: "ถึงตาหนูแล้ว" };
  if (s.inAttempt) return { tone: "speak", icon: "ear", text: "กำลังฟัง…" };
  if (s.phase === "heard") return { tone: "heard", icon: "star", text: "ได้ยินแล้ว!", sub: heardSub };
  if (s.issue) return { tone: "retry", icon: "refresh", text: "ขอฟังอีกครั้งนะ", sub: issueSub[s.issue] };
  if (s.nudged) return { tone: "speak", icon: "ear", text: "ยังไม่ได้ยินเลย", sub: "ลองพูดอีกครั้ง หรือกดฟังคำ" };
  const listened = (s.words[s.index]?.listens ?? 0) > 0;
  if (listened || kind === "none") return { tone: "speak", icon: "ear", text: "พูดได้เลย" };
  return { tone: "listen", icon: "speaker", text: "ฟังคำก่อนนะ" };
}

