import { useEffect, useMemo, useRef, useState } from "react";
import { CakeArt, StarShape, ToppingArt } from "../components/Art";
import { FriendPicture } from "../components/CallParts";
import { PauseOverlay } from "../components/GameParts";
import { Icon, type IconName } from "../components/Icon";
import { StageNote } from "../components/StageNote";
import { CareDrawer, DemoTag, useCareDrawer } from "../components/WorldParts";
import { CALL_WORDS, type FriendId } from "../data/callWords";
import { promptFor } from "../data/plan";
import { finishRound } from "../data/rounds";
import { outfitOf, rewardsOf } from "../data/rewards";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { motionReduced } from "../lib/motion";
import { navigate } from "../lib/router";
import { exampleKind, playExample, stopExample, subscribeVoices } from "../lib/speech";
import { playSuccessChime, stopSfx } from "../lib/sfx";
import { showToast } from "../lib/toast";
import { BakeryShop, CARRIER, ORDER_SIZE, TOPPINGS, bakeryItems, type BakeryLevel, type ToppingId } from "../logic/bakery";
import type { CallIssue } from "../logic/call";
import { bakeryCue } from "../logic/hapticCues";
import { useConnection } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import { callStatusLine, type Line } from "./callStatus";
import { playCue, tapCue } from "./hapticCue";
import { useGameRuntime } from "./useGameRuntime";
import { useSourceGuard } from "./useSourceGuard";
import "../styles/bakery.css";

const BAKERY_ISSUE: Record<CallIssue, string> = {
  quiet: "พูดด้วยเสียงปกติอีกครั้งนะ",
  loud: "พูดเสียงสบาย ๆ อีกครั้งนะ",
  lost: "สัญญาณหลุดไปแป๊บหนึ่ง พูดใหม่ได้เลย",
  channel: "รอผู้ใหญ่ช่วยดูไมค์แป๊บหนึ่ง",
};

const LEVELS: { id: BakeryLevel; name: string; note: string; sample: ToppingId[] }[] = [
  { id: "word", name: "คำเดียว", note: `พูดหนึ่งคำ ได้หน้าขนมหนึ่งชิ้น เค้กละ ${ORDER_SIZE.word} ชิ้น`, sample: ["strawberry", "cream"] },
  { id: "phrase", name: "พูดเป็นวลี", note: `พูดว่า “${CARRIER} …” ได้หน้าขนมหนึ่งชิ้น เค้กละ ${ORDER_SIZE.phrase} ชิ้น`, sample: ["cherry", "cream", "candy"] },
];

const TOPPING_NAME: Record<ToppingId, string> = {
  strawberry: "สตรอว์เบอร์รี",
  cherry: "เชอร์รี",
  sprinkles: "เม็ดสี",
  cream: "วิปครีม",
  candy: "ลูกอม",
};

/** The animal friends who come to the counter, in order (pictures from the 3D models, the name if they cannot load). */
const CUSTOMERS: FriendId[] = ["dog", "crab", "bird", "turtle", "fish"];
const CUSTOMERS_KEY = CUSTOMERS.join(",");
const friendName = (id: FriendId) => CALL_WORDS.find((w) => w.id === id)?.word ?? "";

function LevelPicker({ onPick }: { onPick: (id: BakeryLevel) => void }) {
  const [picked, setPicked] = useState<BakeryLevel | null>(null);
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
    <div className="kid-screen kid-screen--pick">
      <div className="pick">
        <header className="pick__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <DemoTag />
        </header>
        <h1 className="pick__title">วันนี้จะทำขนมแบบไหน?</h1>
        <ul className={`pick__list${picked ? " has-pick" : ""}`}>
          {LEVELS.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`pick-pad pick-pad--bakery${picked === l.id ? " is-picked" : ""}`}
                onClick={() => {
                  if (picked === null) tapCue();
                  setPicked((p) => p ?? l.id);
                }}
                aria-pressed={picked === l.id}
                aria-describedby={`bakery-pick-${l.id}`}
              >
                <span className="pick-pad__pic bakery-pick__pic">
                  <CakeArt toppings={l.sample} slots={l.sample.length} size={150} />
                </span>
                <span className="pick-pad__name" lang="th">
                  {l.name}
                </span>
              </button>
              <p id={`bakery-pick-${l.id}`} className="bakery-pick__note">
                {l.note}
              </p>
            </li>
          ))}
        </ul>
        <p className="pick__note">เพื่อนสัตว์มาสั่งเค้ก หนูเลือกหน้าขนมเอง แล้วพูดคำหนึ่งครั้ง หน้าขนมก็ตกลงบนเค้ก</p>
      </div>
    </div>
  );
}

/** Where topping `i` of `n` sits on the cake (percent of the cake picture's width) — the same spacing as CakeArt. */
function toppingLeft(i: number, n: number): number {
  const gap = n >= 5 ? 18 : 22;
  return ((60 + (i - (n - 1) / 2) * gap) / 120) * 100;
}

/** The friend's order over the counter: one slot per topping, filled as each one lands (the same over the 2D and 3D shop). */
function OrderBubble({ shop }: { shop: BakeryShop }) {
  if (shop.done) return null;
  const eating = shop.phase === "eat";
  return (
    <div className="shop2d__order" aria-hidden="true">
      {Array.from({ length: shop.orderSize }, (_, i) => (
        <span key={i} className={`shop2d__slot${i < shop.placed ? " is-full" : i === shop.placed && !eating ? " is-next" : ""}`}>
          {i < shop.placed ? <ToppingArt id={shop.cake[i]} size={30} /> : null}
        </span>
      ))}
    </div>
  );
}

/** The shop: the friend at the counter on the right, the cake on the left; a topping falls on each usable word. */
function Shop2D({ shop }: { shop: BakeryShop }) {
  const who = CUSTOMERS[Math.min(shop.customer, shop.customers - 1) % CUSTOMERS.length];
  const dropping = shop.phase === "drop";
  const eating = shop.phase === "eat";
  const onCake = shop.cake.slice(0, shop.placed);
  const falling = dropping ? shop.cake[shop.placed] : null;
  const k = shop.dropK;
  const fallTop = -120 + 162 * k * k;
  return (
    <div className={`stage2d shop2d${eating ? " is-eating" : ""}`}>
      <div className="shop2d__awning" aria-hidden="true" />
      <div className="shop2d__shelf" aria-hidden="true">
        <span className="shop2d__jar" />
        <span className="shop2d__jar shop2d__jar--b" />
        <span className="shop2d__jar shop2d__jar--c" />
      </div>
      {shop.done ? null : (
        <div key={shop.customer} className={`shop2d__customer${eating ? " is-munch" : ""}`} aria-hidden="true">
          <FriendPicture id={who} word={friendName(who)} />
          {eating ? (
            <span className="shop2d__hearts">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </div>
      )}
      <div className="shop2d__counter" aria-hidden="true" />
      {shop.done ? null : (
        <div
          key={`cake-${shop.customer}`}
          className="shop2d__cake"
          style={eating ? { transform: `translateX(${70 * shop.eatK}%) scale(${1 - 0.75 * shop.eatK})`, opacity: 1 - 0.6 * shop.eatK } : undefined}
          aria-hidden="true"
        >
          <CakeArt toppings={onCake} slots={shop.orderSize} size={200} />
          {falling ? (
            // a cake-size track moved by transform (no layout per frame); the topping sits at its top-left corner
            <span className="shop2d__fall-track" style={{ transform: `translate(${toppingLeft(shop.placed, shop.orderSize)}%, ${fallTop}%)` }}>
              <span className="shop2d__falling">
                <ToppingArt id={falling} size={60} />
              </span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ShopRound({ level, onPlayAgain }: { level: BakeryLevel; onPlayAgain: () => void }) {
  const child = useActiveChild();
  const db = useDB();
  const plan = child.plan;
  const reduced = useReducedMotion();
  const mode = stageMode(useGfx());
  const conn = useConnection();
  const care = useCareDrawer();
  const startedAt = useRef(new Date().toISOString());
  const [adultModel, setAdultModel] = useState(false);
  const [, setVoices] = useState(0);
  // word level follows the teacher's level (e.g. a long vowel at level 1); phrase level is its own step ("ใส่ …")
  const items = useMemo(() => bakeryItems(level === "word" ? plan.words.map((w) => promptFor(w, plan.level)) : plan.words, level), [plan.words, plan.level, level]);

  useEffect(() => subscribeVoices(() => setVoices((v) => v + 1)), []);
  useEffect(
    () => () => {
      stopExample();
      stopSfx();
    },
    [],
  );

  const rt = useGameRuntime(
    () => new BakeryShop(items, level, plan.oralThreshold, { eatMs: motionReduced() ? 1100 : undefined }),
    (game, frame, now, dt, round) => {
      const events = game.update(frame, now, dt);
      for (const e of events) {
        // the chime plays while the friend eats (the game is not listening then) and stops before it listens again
        if (e.type === "eat") playSuccessChime();
        else if (e.type === "ready" || e.type === "finish") stopSfx();
        playCue(bakeryCue(e, round), frame, (t) => game.call.holdUntil(t));
      }
      return events.some((e) => e.type === "finish");
    },
  );

  const settleAudio = () => {
    stopExample();
    setAdultModel(false);
  };

  const restart = () => {
    settleAudio();
    startedAt.current = new Date().toISOString();
    rt.restart();
  };

  const source = useSourceGuard(restart);

  // the round re-renders every frame: read the character and its clothes once per data change
  const look = useMemo(() => ({ outfit: outfitOf(db, child, source), species: rewardsOf(db, child.id).species }), [db, child, source]);

  const { game, frame } = rt;
  const s = game.call.state;
  const stat = s.words[Math.min(s.index, s.words.length - 1)];
  const kind = exampleKind(stat.word);
  const playing = s.phase === "playing";
  const adultModelling = adultModel && playing && s.playKind === "model";
  const frozen = !frame.valid && !playing && !game.busy;
  const who = CUSTOMERS[Math.min(game.customer, game.customers - 1) % CUSTOMERS.length];
  const name = friendName(who);

  let line: Line = callStatusLine(s, frame, adultModelling, kind, "", BAKERY_ISSUE);
  if (game.done) line = { tone: "done", icon: "star", text: game.stars > 0 ? `เพื่อนอิ่ม ${game.stars} ตัว!` : "ปิดร้านแล้ว" };
  else if (game.phase === "drop") line = { tone: "heard", icon: "check", text: `ใส่${TOPPING_NAME[game.cake[game.placed] ?? game.next]}แล้ว!`, sub: "ระหว่างนี้เกมยังไม่ฟัง" };
  else if (game.phase === "eat") line = { tone: "done", icon: "star", text: `${name}กำลังกิน อร่อยจัง!`, sub: "ระหว่างนี้เกมยังไม่ฟัง" };
  else if (line.text === "พูดได้เลย") line = { ...line, sub: `พูดแล้ว${TOPPING_NAME[game.next]}ตกลงบนเค้ก` };

  useEffect(() => {
    if (rt.paused !== null) {
      stopExample();
      stopSfx();
    }
  }, [rt.paused]);

  const listen = () => {
    const g = rt.gameRef.current;
    if (!g || g.done || g.busy) return;
    g.call.listenStart("model");
    if (kind === "none") {
      setAdultModel(true);
      return;
    }
    setAdultModel(false);
    void playExample(stat.word).then((r) => {
      if (rt.gameRef.current !== g) return;
      if (r === "ended") g.call.listenEnd(performance.now());
      else if (r === "error") setAdultModel(true);
    });
  };

  const adultDone = () => {
    setAdultModel(false);
    rt.gameRef.current?.call.listenEnd(performance.now());
  };

  const retry = () => {
    settleAudio();
    rt.gameRef.current?.call.retry();
  };

  const skip = () => {
    settleAudio();
    if (rt.gameRef.current?.skip().some((e) => e.type === "finish")) rt.end();
  };

  // no buzz here: the game may be listening while the child picks (a vibration must never reach the mics)
  const choose = (t: ToppingId) => {
    rt.gameRef.current?.choose(t);
  };

  const save = (endedEarly: boolean, then: "result" | "again") => {
    const g = game;
    if (g.attempts.length === 0 && g.stars === 0) {
      showToast("ยังไม่ได้ลองพูดในรอบนี้ จึงยังไม่ได้บันทึก");
      if (then === "again") onPlayAgain();
      else navigate("home");
      return;
    }
    finishRound({
      child,
      game: "bakery",
      source,
      startedAt: startedAt.current,
      practiceMs: g.call.state.practiceMs,
      attempts: g.attempts,
      stars: g.stars,
      // every topping that landed was one usable word
      bakery: { served: g.stars, customers: g.customers, toppings: g.attempts.length, level },
      choice: { kind: "mode", id: level, label: LEVELS.find((l) => l.id === level)?.name ?? "" },
      endedEarly,
    });
    if (then === "again") {
      showToast("บันทึกรอบนี้แล้ว เลือกแบบทำขนมใหม่ได้เลย");
      onPlayAgain();
    } else navigate("result");
  };

  const finishEarly = () => {
    rt.gameRef.current?.finish();
    save(true, "result");
  };

  const blocked = rt.paused !== null || rt.ended;
  const is3d = mode.kind === "3d";

  let primary: { label: string; icon: IconName; onClick: () => void; disabled?: boolean };
  if (adultModelling) primary = { label: "ผู้ใหญ่พูดแล้ว ถึงตาหนู", icon: "ear", onClick: adultDone };
  else if (game.busy) primary = { label: game.phase === "eat" ? "เพื่อนกำลังกิน…" : "กำลังใส่หน้าขนม…", icon: "next", onClick: () => {}, disabled: true };
  else if (playing) primary = { label: "กำลังเล่นเสียง…", icon: "speaker", onClick: () => {}, disabled: true };
  else primary = { label: stat.listens > 0 ? "ฟังอีกครั้ง" : "ฟังคำ", icon: "speaker", onClick: listen };
  const busy = game.done || game.busy;

  return (
    <div className="kid-screen kid-screen--world">
      <div className="world-main" inert={blocked ? true : undefined}>
        <div className="world-frame">
          <div className={`stage stage--world stage--bakery${is3d ? " stage--3d" : ""}${frozen ? " is-frozen" : ""}`}>
            {is3d ? (
              <World3D
                kind="bakery"
                customers={CUSTOMERS_KEY}
                tier={mode.tier}
                active={rt.paused === null}
                reduced={reduced}
                gameRef={rt.gameRef}
                frameRef={rt.frameRef}
                outfit={look.outfit}
                species={look.species}
              />
            ) : (
              <Shop2D shop={game} />
            )}
            <OrderBubble shop={game} />
            <header className="world-bar">
              <button type="button" className="world-btn" onClick={() => rt.pause("user")} aria-label="พักเกม">
                <Icon name="pause" size={22} />
              </button>
              <ol className="bakery-queue" aria-label={`เพื่อนอิ่ม ${game.stars} จาก ${game.customers} ตัว`}>
                {game.results.map((r, i) => {
                  const id = CUSTOMERS[i % CUSTOMERS.length];
                  const state = r === "served" ? "is-done" : r === "skip" ? "is-pass" : i === game.customer && !game.done ? "is-current" : "is-next";
                  return (
                    <li key={i} className={`bakery-queue__friend ${state}`}>
                      <FriendPicture id={id} word={friendName(id)} />
                      <span className="sr-only">
                        {friendName(id)} {r === "served" ? "อิ่มแล้ว" : r === "skip" ? "ข้ามไป" : "ยังไม่ได้กิน"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <span className="world-stars" aria-label={`ดาวรอบนี้ ${game.stars} ดวง`}>
                <StarShape size={20} />
                <span aria-hidden="true">{game.stars}</span>
              </span>
            </header>
            {game.done ? null : (
              <div className="shop-tray" role="group" aria-label="เลือกหน้าขนมชิ้นต่อไป">
                {TOPPINGS.map((t) => (
                  // never disabled: focus stays on the tray between toppings (a pick while one falls applies to the next)
                  <button
                    key={t}
                    type="button"
                    aria-pressed={game.next === t}
                    aria-label={TOPPING_NAME[t]}
                    className={`shop-tray__item${game.next === t ? " is-chosen" : ""}`}
                    onClick={() => choose(t)}
                  >
                    <ToppingArt id={t} size={38} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="world-dock" aria-label="คำของหน้าขนมชิ้นนี้">
            <button type="button" className="dock-pic dock-pic--friend" onClick={listen} disabled={busy || playing} aria-label={`ฟังคำ “${stat.word}”`}>
              <FriendPicture id={who} word={name} />
              <span className="dock-pic__speaker" aria-hidden="true">
                <Icon name="speaker" size={16} />
              </span>
            </button>
            <div className="dock-text">
              <p className="dock-goal">
                {game.done ? "ปิดร้านแล้ว" : `${name}สั่งเค้ก · ชิ้นที่ ${Math.min(game.placed + 1, game.orderSize)} จาก ${game.orderSize}`}
              </p>
              <p className="dock-word" lang="th">
                {stat.word}
              </p>
              <p className={`dock-state dock-state--${line.tone}`} role="status">
                <span className={`dock-state__icon${s.inAttempt ? " is-live" : ""}`} aria-hidden="true">
                  <Icon name={line.icon} size={18} />
                </span>
                <span>
                  <strong>{line.text}</strong>
                  {line.sub ? <small>{line.sub}</small> : null}
                </span>
              </p>
            </div>
            <div className="dock-actions">
              <button type="button" className="btn btn--primary btn--lg dock-main" onClick={primary.onClick} disabled={primary.disabled || game.done}>
                <Icon name={primary.icon} size={22} />
                {primary.label}
              </button>
              <div className="dock-quiet">
                <button type="button" className="quiet-btn" onClick={retry} disabled={busy}>
                  <Icon name="refresh" size={18} /> ลองใหม่
                </button>
                <button type="button" className="quiet-btn" onClick={skip} disabled={busy}>
                  <Icon name="skip" size={18} /> ข้ามเพื่อนคนนี้
                </button>
                <DemoTag onOpen={care.open} />
              </div>
            </div>
          </section>
        </div>
        <StageNote mode={mode} />
      </div>

      <aside className="world-side" aria-label="ลูกค้าในร้านและผู้ดูแล" inert={blocked ? true : undefined}>
        <section className="side-card world-side__info" aria-labelledby="bakery-title">
          <h2 id="bakery-title" className="side-card__title">
            ร้านขนม · {LEVELS.find((l) => l.id === level)?.name}
          </h2>
          <ol className="side-list">
            {game.results.map((r, i) => {
              const id = CUSTOMERS[i % CUSTOMERS.length];
              const now = r === null && i === game.customer && !game.done;
              const state = r === "served" ? "อิ่มแล้ว" : r === "skip" ? "ข้ามไป" : now ? (game.phase === "eat" ? "กำลังกิน" : `รอหน้าขนม ${game.placed}/${game.orderSize}`) : "รอคิว";
              return (
                <li key={i}>
                  <div className={`side-item${now ? " is-current" : ""}${r === "served" ? " is-done" : ""}`}>
                    <FriendPicture id={id} word={friendName(id)} className="side-item__pic" />
                    <span className="side-item__name" lang="th">
                      {friendName(id)}
                    </span>
                    <span className="side-item__state">{state}</span>
                  </div>
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
            hint: "กดค้าง “กดค้างเพื่อพูด” แล้วปล่อย = ลองพูดหนึ่งครั้ง หน้าขนมตกหนึ่งชิ้น",
          }}
        >
          <p className="call-note">
            ทุกครั้งที่ตรวจพบการลองพูดที่สัญญาณใช้ได้ หน้าขนมตกหนึ่งชิ้น เกมไม่ตัดสินเสียงในฉาก · ประวัติบันทึกว่าครั้งไหนออกปากอย่างน้อย {plan.oralThreshold}%
            ไว้ให้ผู้ใหญ่ดูเท่านั้น
          </p>
          <p className="call-note">
            {level === "phrase" ? `วลี “${CARRIER} …” เป็นขั้นต่อจากคำเดียว ` : ""}เครื่องไม่รู้ว่าพูดคำถูกหรือไม่ · หน้าขนมไม่ขึ้นกับความดัง · แหล่งสัญญาณ:{" "}
            {source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต (สัญญาณจำลอง)"}
          </p>
        </CareDrawer>
      </aside>

      {rt.paused !== null ? (
        <PauseOverlay reason={rt.paused} onResume={rt.resume} onRestart={restart} onFinish={finishEarly} onHome={() => navigate("home")} />
      ) : null}
      {rt.ended && rt.paused === null ? <ShopDone served={game.stars} total={game.customers} onResult={() => save(false, "result")} onAgain={() => save(false, "again")} /> : null}
    </div>
  );
}

function ShopDone({ served, total, onResult, onAgain }: { served: number; total: number; onResult: () => void; onAgain: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="overlay overlay--soft" role="dialog" aria-modal="true" aria-labelledby="bakery-done-title">
      <div className="overlay__card overlay__card--done">
        <span className="bakery-done__pic">
          <CakeArt toppings={["strawberry", "cream", "cherry", "candy", "sprinkles"]} size={150} />
        </span>
        <h2 id="bakery-done-title">{served > 0 ? `เพื่อนอิ่ม ${served} ตัว!` : "ปิดร้านแล้ว"}</h2>
        <p className="overlay__text">{served >= total ? "ทำเค้กให้เพื่อนครบทุกตัวแล้ว" : "ปิดร้านแล้ว รอบหน้ามาทำขนมกันอีกนะ"}</p>
        <button ref={ref} type="button" className="btn btn--primary btn--lg btn--block" onClick={onResult}>
          ดูสรุปรอบ <Icon name="next" size={20} />
        </button>
        <button type="button" className="quiet-btn" onClick={onAgain}>
          <Icon name="refresh" size={18} /> ทำขนมอีกรอบ
        </button>
      </div>
    </div>
  );
}

export function BakeryScreen() {
  const [level, setLevel] = useState<BakeryLevel | null>(null);
  const [round, setRound] = useState(0);
  if (level === null) {
    return (
      <LevelPicker
        onPick={(id) => {
          setLevel(id);
          setRound((r) => r + 1);
        }}
      />
    );
  }
  return <ShopRound key={round} level={level} onPlayAgain={() => setLevel(null)} />;
}
