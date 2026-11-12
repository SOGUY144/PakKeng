import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, type Attempt } from "./common";

/** Customers in one round. */
export const BAKERY_CUSTOMERS = 5;
/** A topping falling onto the cake after a usable word. The game does not listen meanwhile. */
export const DROP_MS = 650;
/** The customer eating the finished cake. Not listening either. */
export const EAT_MS = 1800;

/**
 * word ("คำเดียว"): say the word, a topping drops — two toppings per order.
 * phrase ("พูดเป็นวลี"): the prompt is a short carrier phrase ("ใส่ ปา") — three toppings per order, a step towards
 * phrases on the word → phrase → sentence ladder. The game still only knows that a usable attempt happened.
 */
export type BakeryLevel = "word" | "phrase";
export const ORDER_SIZE: Record<BakeryLevel, number> = { word: 2, phrase: 3 };
export const CARRIER = "ใส่";

export const TOPPINGS = ["strawberry", "cherry", "sprinkles", "cream", "candy"] as const;
export type ToppingId = (typeof TOPPINGS)[number];

export type BakeryPhase = "order" | "drop" | "eat" | "done";
export type CustomerResult = "served" | "skip";

export type BakeryEvent =
  | CallEvent
  | { type: "drop"; customer: number; topping: number }
  | { type: "eat"; customer: number }
  | { type: "served"; customer: number }
  | { type: "ready"; customer: number }
  | { type: "finish" };

/** One word turn per topping: customers × order size, cycling the plan's oral words (phrase level adds the carrier). */
export function bakeryItems(words: string[], level: BakeryLevel, customers = BAKERY_CUSTOMERS): CallItem[] {
  const list = words.length ? words : ["ปา"];
  const n = customers * ORDER_SIZE[level];
  return Array.from({ length: n }, (_, k) => {
    const w = list[k % list.length];
    return { id: String(k), word: level === "phrase" ? `${CARRIER} ${w}` : w, resonance: "oral" as const };
  });
}

/**
 * ร้านขนมของเพื่อนสัตว์: เพื่อนสัตว์เข้าร้านมาสั่งขนม เด็กแตะเลือกหน้าขนมเอง แล้วพูดหนึ่งครั้ง = หน้าขนมหนึ่งชิ้นตกลงบนเค้ก
 * ครบตามที่สั่ง → ลูกค้ากินแล้วดีใจ → ลูกค้าคนต่อไป
 * - ตรวจพบเสียงด้วย CallGame ตัวเดียวกับเกมอื่น: เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ ไม่หักอะไร
 * - ไม่มีแพ้ ไม่มีจับเวลา: ทุกคำที่สัญญาณใช้ได้ได้หน้าขนม · ค่าเสียงจมูก/ปากไม่ใช้ตัดสินในฉาก
 *   (เกณฑ์ออกปากของนักแก้ไขการพูดบันทึกให้ผู้ใหญ่ดูเท่านั้น) · ข้ามลูกค้าได้โดยไม่เสียอะไร
 */
export class BakeryShop {
  readonly call: CallGame;
  readonly level: BakeryLevel;
  readonly orderSize: number;
  readonly customers: number;
  private readonly oralThreshold: number;
  phase: BakeryPhase = "order";
  /** The customer at the counter (0-based); equals `customers` once the round is over. */
  customer = 0;
  /** Toppings already on the current cake. */
  placed = 0;
  /** The toppings the child picked for the current cake, in order. */
  cake: ToppingId[] = [];
  /** The topping the next word will drop. */
  next: ToppingId = TOPPINGS[0];
  results: (CustomerResult | null)[];
  /** Progress of the drop / the eating (0 … 1) — what the scene shows. */
  dropK = 0;
  eatK = 0;
  dropSeq = 0;
  eatSeq = 0;
  /** Usable attempts, judged on the expert's oral criterion for the caregiver's history only. */
  attempts: Attempt[] = [];
  private elapsed = 0;
  private readonly eatMs: number;

  constructor(items: CallItem[], level: BakeryLevel, oralThreshold: number, opts: { eatMs?: number } = {}) {
    this.call = new CallGame(items);
    this.level = level;
    this.orderSize = ORDER_SIZE[level];
    this.customers = Math.max(1, Math.floor(items.length / this.orderSize));
    this.oralThreshold = oralThreshold;
    this.results = Array.from({ length: this.customers }, () => null);
    this.eatMs = opts.eatMs ?? EAT_MS;
  }

  get done(): boolean {
    return this.phase === "done";
  }

  get busy(): boolean {
    return this.phase === "drop" || this.phase === "eat";
  }

  /** Customers who got their whole order on usable words. */
  get stars(): number {
    return this.results.filter((r) => r === "served").length;
  }

  /** The child picks what the next word drops (any time while the order is open). */
  choose(t: ToppingId): void {
    if (this.phase === "order") this.next = t;
  }

  update(frame: SignalFrame, now: number, dtMs: number): BakeryEvent[] {
    const out: BakeryEvent[] = [];
    if (this.phase === "done") return out;
    if (this.phase === "drop") {
      this.elapsed += clampDt(dtMs);
      this.dropK = Math.min(1, this.elapsed / DROP_MS);
      if (this.dropK >= 1) this.landTopping(out);
      return out;
    }
    if (this.phase === "eat") {
      this.elapsed += clampDt(dtMs);
      this.eatK = Math.min(1, this.elapsed / this.eatMs);
      if (this.eatK >= 1) this.serve(out);
      return out;
    }
    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard" || this.phase !== "order") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      this.drop(out);
    }
    return out;
  }

  /** "ข้ามลูกค้าคนนี้": the customer waves and leaves — nothing is taken away (toppings already spoken stay counted). */
  skip(): BakeryEvent[] {
    if (this.phase !== "order") return [];
    const out: BakeryEvent[] = [];
    // the rest of this customer's word turns are passed over in the call game
    const lastTurn = (this.customer + 1) * this.orderSize;
    while (this.call.state.phase !== "done" && this.call.state.index < lastTurn) {
      if (this.call.heardNow) this.call.next();
      else this.call.skip();
    }
    this.results = this.results.map((r, i) => (i === this.customer ? "skip" : r));
    this.nextCustomer(out);
    return out;
  }

  interrupt(): void {
    this.call.interrupt();
  }

  /** End early: a customer already eating — or whose last topping is falling — is served (every topping was a usable word). */
  finish(): void {
    const full = this.phase === "eat" || (this.phase === "drop" && this.placed + 1 >= this.orderSize);
    if (full) this.results = this.results.map((r, i) => (i === this.customer ? "served" : r));
    this.call.finish();
    this.phase = "done";
  }

  private drop(out: BakeryEvent[]): void {
    this.phase = "drop";
    this.dropK = 0;
    this.elapsed = 0;
    this.dropSeq += 1;
    this.cake = [...this.cake, this.next];
    out.push({ type: "drop", customer: this.customer, topping: this.placed });
  }

  private landTopping(out: BakeryEvent[]): void {
    this.placed += 1;
    this.elapsed = 0;
    if (this.call.heardNow) this.call.next();
    if (this.placed >= this.orderSize) {
      this.phase = "eat";
      this.eatK = 0;
      this.eatSeq += 1;
      out.push({ type: "eat", customer: this.customer });
      return;
    }
    this.phase = "order";
  }

  private serve(out: BakeryEvent[]): void {
    this.results = this.results.map((r, i) => (i === this.customer ? "served" : r));
    out.push({ type: "served", customer: this.customer });
    this.nextCustomer(out);
  }

  private nextCustomer(out: BakeryEvent[]): void {
    this.customer += 1;
    this.placed = 0;
    this.cake = [];
    this.dropK = 0;
    this.eatK = 0;
    this.elapsed = 0;
    if (this.customer >= this.customers) {
      if (this.call.state.phase !== "done") this.call.finish();
      this.phase = "done";
      out.push({ type: "finish" });
      return;
    }
    this.phase = "order";
    out.push({ type: "ready", customer: this.customer });
  }
}
