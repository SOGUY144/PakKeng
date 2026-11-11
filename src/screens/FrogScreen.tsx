import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frog, LilyPad, StarShape } from "../components/Art";
import { FriendPicture, WordTable, WordTableNote } from "../components/CallParts";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { callWordsFor, orderFrom, type CallWord, type FriendId } from "../data/callWords";
import { finishRound } from "../data/rounds";
import { useActiveChild } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { motionReduced } from "../lib/motion";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { showToast } from "../lib/toast";
import { withViewTransition } from "../lib/transition";
import { CallGame, wordSummary, type CallEvent, type CallState, type WordStat } from "../logic/call";
import { useConnection, useSignalSource, signalKind } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine } from "./callStatus";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";

const fid = (w: { id: string }) => w.id as FriendId;

/**
 * Lily-pad choice list (first friend, or "who next?"). The chosen friend does a happy hop (the others step back)
 * before the game moves on, so the tap visibly leads to "the frog goes to this friend".
 */
function FriendChoices({ words, onPick, label }: { words: { id: string; word: string }[]; onPick: (id: FriendId) => void; label: (w: string) => string }) {
  const [picked, setPicked] = useState<FriendId | null>(null);
  // the game re-renders every frame: keep the latest callback without restarting the hop timer
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });
  useEffect(() => {
    if (picked === null) return;
    const id = setTimeout(() => pickRef.current(picked), motionReduced() ? 160 : 420);
    return () => clearTimeout(id);
  }, [picked]);
  return (
    <ul className={`pick__list${picked ? " has-pick" : ""}`}>
      {words.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            className={`pick-pad${picked === fid(w) ? " is-picked" : ""}`}
            onClick={() => setPicked((p) => p ?? fid(w))}
            aria-label={label(w.word)}
            aria-pressed={picked === fid(w)}
          >
            <span className="pick-pad__pic">
              <FriendPicture id={fid(w)} word={w.word} />
            </span>
            <span className="pick-pad__name" lang="th">
              {w.word}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "วันนี้อยากไปหาใครก่อน" — the child's choice sets the round order (model, example word, results all follow it). */
function FriendPicker({ words, onPick }: { words: CallWord[]; onPick: (id: FriendId) => void }) {
  return (
    <div className="kid-screen kid-screen--pick">
      <div className="pick">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้อยากไปหาใครก่อน?</h1>
        <FriendChoices words={words} onPick={onPick} label={(w) => `ไปหา${w}ก่อน`} />
        <p className="pick__note">แตะเพื่อนที่อยากไปหา กบจะพาไป</p>
      </div>
    </div>
  );
}

/** After a friend has heard the child: who do we visit next? */
function NextSheet({ words, onPick, onClose }: { words: WordStat[]; onPick: (id: FriendId) => void; onClose: () => void }) {
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="next-title">
      <div ref={first} className="overlay__card pick-sheet">
        <h2 id="next-title" className="pick-sheet__title">
          ไปหาใครต่อดี?
        </h2>
        <FriendChoices words={words} onPick={onPick} label={(w) => `ไปหา${w}ต่อ`} />
        <button type="button" className="quiet-btn" onClick={onClose}>
          <Icon name="back" size={18} /> ยังไม่ไป อยู่กับเพื่อนตัวนี้ก่อน
        </button>
      </div>
    </div>
  );
}

/** 2D fallback: the friend's picture turns from its back to its front when it hears the child. */
function Call2D({ s }: { s: CallState }) {
  const i = Math.min(s.index, s.words.length - 1);
  const w = s.words[i];
  const facing = s.phase === "done" || w.heard;
  return (
    <div className="stage2d call2d">
      <div className="call2d__pad call2d__pad--friend" aria-hidden="true">
        <LilyPad size={150} />
      </div>
      <div className={`call2d__friend${facing ? " is-facing" : ""}${s.inAttempt ? " is-listening" : ""}`} aria-hidden="true">
        <FriendPicture key={`${w.id}-${facing}`} id={fid(w)} word={w.word} back={!facing} />
      </div>
      <div className="call2d__pad call2d__pad--frog" aria-hidden="true">
        <LilyPad size={96} />
      </div>
      <div className="call2d__frog" aria-hidden="true">
        <Frog size={52} />
      </div>
    </div>
  );
}

function CallRound({ words, onPlayAgain }: { words: CallWord[]; onPlayAgain: () => void }) {
  const child = useActiveChild();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const src = useSignalSource();
  const conn = useConnection();
  const care = useCareDrawer();
  const startedAt = useRef(new Date().toISOString());
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const [adultModel, setAdultModel] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [, setVoices] = useState(0);
  const nowRef = useRef(0);

  // Thai voices load asynchronously: re-render when the list changes so "ฟังคำ" knows what it can play.
  useEffect(() => subscribeVoices(() => setVoices((n) => n + 1)), []);
  useEffect(() => () => stopExample(), []);

  const rt = useGameRuntime(
    () => new CallGame(words),
    (game, frame, now, dt) => {
      nowRef.current = now;
      for (const ev of game.update(frame, now, dt)) {
        if (ev.type === "heard") {
          setHeardAt(now);
          // The friend answers aloud when the device has a Thai voice; the mic is ignored while it speaks.
          if (exampleKind("ได้ยินแล้ว") === "tts") {
            game.listenStart("reply");
            void playExample("ได้ยินแล้ว", { voiceOnly: true, rate: 0.95 }).then((r) => {
              if (r === "ended") game.listenEnd(performance.now());
            });
          }
        }
      }
    },
  );

  const { game, frame } = rt;
  const s = game.state;
  const N = s.words.length;
  const idx = Math.min(s.index, N - 1);
  const stat = s.words[idx];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  // Only meaningful while the example is "playing" (pause / skip move the game out of that phase).
  const adultModelling = adultModel && playing && s.playKind === "model";
  const waiting = s.words.slice(s.index + 1);
  const heardNow = game.heardNow;
  const line = callStatusLine(s, frame, adultModelling, kind, waiting.length > 0 ? "เรียกอีกก็ได้ หรือไปหาเพื่อนตัวต่อไป" : "เรียกอีกก็ได้ หรือไปฝั่งปลายทาง");
  const bubbleOn = s.phase !== "done" && stat.heard && heardAt !== null && nowRef.current - heardAt < 2600;
  const askOn = s.issue !== null && s.phase === "turn" && !s.inAttempt;
  const frozen = !frame.valid && !playing;

  // Pausing (button or tab hidden) stops any example that is still playing; the game itself has left "playing".
  useEffect(() => {
    if (rt.paused !== null) stopExample();
  }, [rt.paused]);

  const settleAudio = () => {
    stopExample();
    setAdultModel(false);
  };

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.state.phase === "done") return;
    g.listenStart("model");
    if (kind === "none") {
      setAdultModel(true);
      return;
    }
    setAdultModel(false);
    void playExample(stat.word).then((r) => {
      if (rt.gameRef.current !== g) return;
      if (r === "ended") g.listenEnd(performance.now());
      else if (r === "error") setAdultModel(true);
    });
  };

  const adultDone = () => {
    setAdultModel(false);
    rt.gameRef.current?.listenEnd(performance.now());
  };

  const act = (fn: (g: CallGame) => CallEvent[]) => {
    const g = rt.gameRef.current;
    if (!g) return;
    settleAudio();
    setChoosing(false);
    if (fn(g).some((e) => e.type === "done")) rt.end();
  };
  const retry = () =>
    act((g) => {
      g.retry();
      return [];
    });
  /** Go to the friend the child picked (it becomes the next turn, then the frog sets off). */
  const goTo = (id: FriendId) =>
    act((g) => {
      g.chooseNext(id);
      return g.next();
    });

  /** Save this round for the caregiver (words by id, in the order the child met them). */
  const save = (endedEarly: boolean, then: "result" | "again") => {
    const st = game.state;
    if (st.words.every((w) => w.attempts === 0 && w.listens === 0)) {
      showToast("ยังไม่มีการฟังหรือเรียกเพื่อนในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    const summary = st.words.map(wordSummary);
    const heard = summary.filter((w) => w.heard).length;
    finishRound({
      child,
      game: "frog",
      source: signalKind(),
      startedAt: startedAt.current,
      practiceMs: st.practiceMs,
      attempts: [],
      stars: st.stars,
      frog: { steps: heard, target: N },
      call: { words: summary, heard, target: N, source: src.kind === "mock" ? "demo" : "device" },
      choice: { kind: "friends", id: summary.map((w) => w.id).join(","), label: summary.filter((w) => w.heard).map((w) => w.word).join(" ") },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกเพื่อนรอบใหม่ได้เลย");
      onPlayAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const restart = () => {
    settleAudio();
    setChoosing(false);
    startedAt.current = new Date().toISOString();
    setHeardAt(null);
    rt.restart();
  };

  // one round = one signal source: switching demo <-> device mid-round starts the round again (nothing is mixed)
  useSourceGuard(restart);

  const is3d = mode.kind === "3d";
  // the scene places friends in round order; the child's "who next" reorders only friends still waiting (hidden)
  const friendIds = s.words.map((w) => w.id).join(",");
  const heardCount = s.words.filter((w) => w.heard).length;
  const met = s.words.filter((w) => w.heard);
  const blocked = rt.paused !== null || rt.ended || choosing;

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean; after?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (heardNow && waiting.length > 1) primary = { label: "เลือกเพื่อนตัวต่อไป", icon: "next", onClick: () => setChoosing(true), after: true };
  else if (heardNow && waiting.length === 1) primary = { label: `ไปหา${waiting[0].word}`, icon: "next", onClick: () => goTo(fid(waiting[0])), after: true };
  else if (heardNow) primary = { label: "ไปฝั่งปลายทาง", icon: "next", onClick: () => act((g) => g.next()), after: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const listenIsSecondary = heardNow || adultModelling;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--frog${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <World3D
                kind="frog"
                friends={friendIds}
                bubbleRef={bubbleRef}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
              />
            ) : (
              <Call2D s={s} />
            )}
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="pond-trail" aria-label={`เพื่อนที่ได้ยินแล้ว ${heardCount} จาก ${N}`}>
                {s.words.map((w, i) => (
                  <li
                    key={w.id}
                    className={`pond-trail__friend${w.heard ? " is-heard" : w.skipped ? " is-skipped" : i === s.index ? " is-current" : " is-next"}`}
                    aria-current={i === s.index ? "step" : undefined}
                  >
                    <FriendPicture id={fid(w)} word={w.word} />
                    {w.heard ? (
                      <span className="pond-trail__check" aria-hidden="true">
                        <Icon name="check" size={12} />
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {w.word} {w.heard ? "ได้ยินแล้ว" : w.skipped ? "ข้ามไว้" : i === s.index ? "ตัวนี้" : "ยังไม่ถึง"}
                    </span>
                  </li>
                ))}
              </ol>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${s.stars} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{s.stars}</span>
              </span>
            </header>
            <p
              ref={bubbleRef}
              className={`world-bubble${bubbleOn || askOn ? " is-on" : ""}${askOn && !bubbleOn ? " world-bubble--ask" : ""}${is3d ? "" : " world-bubble--flat"}`}
              aria-hidden="true"
            >
              {bubbleOn ? "ได้ยินแล้ว!" : askOn ? "หืม?" : ""}
            </p>
          </div>

          <section className="world-dock world-dock--pond" aria-label="เพื่อนที่จะเรียก">
            <button type="button" className="dock-pic" onClick={listen} disabled={playing || s.phase === "done"} aria-label={`ฟังคำ “${stat.word}”`}>
              <FriendPicture id={fid(stat)} word={stat.word} />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-word" lang="th">
                {stat.word}
              </p>
              <p className={`dock-state dock-state--${line.tone}`} role="status">
                <span className={`dock-state__icon${s.inAttempt ? " is-live" : ""}`} aria-hidden="true">
                  <Icon name={line.icon} size={18} />
                </span>
                <span>
                  <strong>{s.phase === "done" ? "ไปหาเพื่อนครบแล้ว!" : line.text}</strong>
                  {line.sub ? <small>{line.sub}</small> : null}
                </span>
              </p>
            </div>
            <div className="dock-actions">
              <button type="button" className="btn btn--primary btn--lg dock-main" onClick={primary.onClick} disabled={primary.disabled || s.phase === "done"}>
                {primary.after ? null : <Icon name={primary.icon} size={22} />}
                {primary.label}
                {primary.after ? <Icon name={primary.icon} size={22} /> : null}
              </button>
              <div className="dock-quiet">
                {listenIsSecondary ? (
                  <button type="button" className="quiet-btn" onClick={listen} disabled={playing || s.phase === "done"}>
                    <Icon name="speaker" size={18} /> ฟังซ้ำ
                  </button>
                ) : null}
                <button type="button" className="quiet-btn" onClick={retry} disabled={s.phase === "done"}>
                  <Icon name="refresh" size={18} /> ลองใหม่
                </button>
                <button type="button" className="quiet-btn" onClick={() => act((g) => g.skip())} disabled={s.phase === "done"}>
                  <Icon name="skip" size={18} /> ข้าม
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="เพื่อนและผู้ดูแล" inert={rt.paused !== null || rt.ended ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="friends-title">
          <h2 id="friends-title" className="side-card__title">
            เพื่อนในบึงวันนี้
          </h2>
          <ol className="side-list">
            {s.words.map((w, i) => {
              const canGo = heardNow && i > s.index && !choosing;
              const state = w.heard ? "ได้ยินแล้ว" : w.skipped ? "ข้ามไว้" : i === s.index ? "กำลังเรียก" : canGo ? "แตะเพื่อไปหา" : "รอก่อน";
              const body = (
                <>
                  <FriendPicture id={fid(w)} word={w.word} />
                  <span className="side-item__name" lang="th">
                    {w.word}
                  </span>
                  <span className="side-item__state">{state}</span>
                </>
              );
              const cls = `side-item${i === s.index && s.phase !== "done" ? " is-current" : ""}${w.heard ? " is-done" : ""}`;
              return (
                <li key={w.id}>
                  {canGo ? (
                    <button type="button" className={`${cls} is-choice`} onClick={() => goTo(fid(w))}>
                      {body}
                    </button>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <CareDrawer
          careRef={care.ref}
          frame={frame}
          conn={conn}
          issue={s.issue}
          demo={{
            target: { kind: "oral", threshold: plan.oralThreshold },
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = เรียกเพื่อนหนึ่งครั้ง (เสียงเบา ล้น ไมค์ช่องหาย หรืออุปกรณ์หลุด อยู่ใน “ตัวเลือกทดสอบเพิ่ม”)",
          }}
        >
          <p className="call-note">เพื่อนหันมาเมื่อเกมได้ยินเสียงเรียกที่สัญญาณใช้ได้ ไม่ได้ตัดสินว่าออกเสียงถูก ข้ามหรือลองใหม่ได้เสมอโดยไม่หักดาว</p>
          <h3 className="care__title">คำที่ฝึกรอบนี้</h3>
          <WordTable words={s.words.map(wordSummary)} caption="คำที่ฝึกรอบนี้" />
          <WordTableNote />
          <p className="call-note">
            เสียงตัวอย่าง:{" "}
            {kind === "recording"
              ? "ไฟล์เสียงที่อัดไว้"
              : kind === "tts"
                ? "เสียงสังเคราะห์ภาษาไทยของเครื่อง (ชั่วคราว ควรแทนด้วยเสียงที่นักแก้ไขการพูดอัด)"
                : "เครื่องนี้ไม่มีเสียงภาษาไทย ให้ผู้ใหญ่พูดตัวอย่างแทน"}
          </p>
        </CareDrawer>
      </aside>

      {choosing && !rt.ended && rt.paused === null ? <NextSheet words={waiting} onPick={goTo} onClose={() => setChoosing(false)} /> : null}
      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? (
        <RoundDone met={met} total={N} attempts={s.words.reduce((n, w) => n + w.attempts, 0)} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} />
      ) : null}
    </div>
  );
}

/** End of the round: who the child met, then see the summary or pick friends again. */
function RoundDone({ met, total, attempts, onResult, onAgain }: { met: { id: string; word: string }[]; total: number; attempts: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div className="overlay__card overlay__card--done">
        <h2 id="done-title">{met.length > 0 ? "ไปหาเพื่อนครบแล้ว!" : "จบรอบแล้ว"}</h2>
        {met.length > 0 ? (
          <ul className="met" aria-label="เพื่อนที่ได้ยินหนู">
            {met.map((w) => (
              <li key={w.id} className="met__friend">
                <FriendPicture id={fid(w)} word={w.word} />
                <span lang="th">{w.word}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="overlay__text">
          {met.length > 0 ? `เพื่อนได้ยินหนู ${met.length} จาก ${total} ตัว` : `ลองเรียกไป ${attempts} ครั้ง ไว้รอบหน้ามาเรียกเพื่อนกันใหม่นะ`}
        </p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onAgain}>
          <Icon name="refresh" size={20} /> เลือกเพื่อนแล้วเล่นอีกรอบ
        </button>
        <button type="button" className="btn btn--secondary btn--block" onClick={onResult}>
          ดูสรุปรอบ
        </button>
      </div>
    </div>
  );
}

export function FrogScreen() {
  const child = useActiveChild();
  const words = useMemo(() => callWordsFor(child.plan.callWords), [child.plan.callWords]);
  const solo = words.length === 1;
  const [first, setFirst] = useState<FriendId | null>(solo ? words[0].id : null);
  const [round, setRound] = useState(0);
  const ordered = useMemo(() => orderFrom(words, first), [words, first]);
  // picker → pond and back: a soft cross-fade, like changing screens
  const startWith = useCallback((id: FriendId) => {
    withViewTransition(() => {
      setFirst(id);
      setRound((r) => r + 1);
    });
  }, []);
  if (first === null) {
    return <FriendPicker words={words} onPick={startWith} />;
  }
  return (
    <CallRound
      key={round}
      words={ordered}
      onPlayAgain={() => {
        withViewTransition(() => {
          if (solo) setRound((r) => r + 1);
          else setFirst(null);
        });
      }}
    />
  );
}
