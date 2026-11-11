import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { StageNote } from "../components/StageNote";
import { Disclaimer } from "../components/Chrome";
import { EggArt, PetArt, PlantArt, SpeciesArt, WearArt } from "../components/IslandArt";
import {
  adoptStarter,
  attemptsOnDay,
  BEDS,
  bedView,
  chooseEgg,
  chooseSpecies,
  dayKey,
  dayOffset,
  EGGS,
  eggView,
  harvestBed,
  hatchEgg,
  ledgerOf,
  nowMs,
  outfitOf,
  PET_NAME,
  PLANTS,
  plantSeed,
  rewardsOf,
  setBuddy,
  setDayOffset,
  SPECIES,
  STAGE_NAME,
  STARTER_PETS,
  toggleWear,
  wearViews,
  wornIds,
} from "../data/rewards";
import type { Child, EggKind, PlantKind, RewardLedger, SignalKind } from "../data/schema";
import { useActiveChild, useDB } from "../data/store";
import { useReducedMotion } from "../lib/hooks";
import { navigate } from "../lib/router";
import { showToast } from "../lib/toast";
import { signalKind, useSignalSource } from "../signal/mock";
import { stageMode, useGfx } from "../three/gfx";
import { World3D } from "../three/World3D";
import "../styles/island.css";

type Tab = "me" | "pets" | "garden";
const TABS: { id: Tab; label: string }[] = [
  { id: "me", label: "แต่งตัว" },
  { id: "pets", label: "สัตว์เลี้ยง" },
  { id: "garden", label: "สวน" },
];

const plantName = (k: PlantKind) => PLANTS.find((p) => p.id === k)?.name ?? k;

/** What the child saw on the island last time (this tab): the scene starts from it and grows to today, so progress shows. */
const SEEN_KEY = "nasal-trainer-demo:island-seen";

function readSeen(key: string): { beds: string; egg: string } | null {
  try {
    const v = sessionStorage.getItem(`${SEEN_KEY}:${key}`);
    return v ? (JSON.parse(v) as { beds: string; egg: string }) : null;
  } catch {
    return null;
  }
}

function writeSeen(key: string, v: { beds: string; egg: string }): void {
  try {
    sessionStorage.setItem(`${SEEN_KEY}:${key}`, JSON.stringify(v));
  } catch {
    // per-tab nicety only
  }
}

/** Beds as last seen where the same plant has grown since (then the scene shows it growing), otherwise as now. */
function blendBeds(seen: string, now: string): string {
  const old = seen.split(",");
  return now
    .split(",")
    .map((cur, i) => {
      const was = old[i];
      if (!cur || !was) return cur;
      const [k1, s1] = was.split(":");
      const [k2, s2] = cur.split(":");
      return k1 === k2 && Number(s1) < Number(s2) ? was : cur;
    })
    .join(",");
}

/** The egg as last seen if the same egg has cracked more since. */
function blendEgg(seen: string, now: string): string {
  if (!seen || !now) return now;
  const [k1, c1] = seen.split(":");
  const [k2, c2] = now.split(":");
  return k1 === k2 && Number(c1) < Number(c2) ? seen : now;
}

/** What just happened on the island (the 3D scene plays it once; the data has already changed). */
type IslandFx = { type: "hatch"; egg: EggKind } | { type: "pick"; bed: number; kind: PlantKind } | { type: "cheer" };

function MePanel({ child, source, onFx }: { child: Child; source: SignalKind; onFx: (fx: IslandFx) => void }) {
  const d = useDB();
  const r = rewardsOf(d, child.id);
  const views = wearViews(d, child, source);
  const worn = new Set(wornIds(d, child, source));
  return (
    <div className="island-panel">
      <h2 className="island-panel__title">เลือกตัวละคร</h2>
      <ul className="island-grid island-grid--species">
        {SPECIES.map((s) => (
          <li key={s.id}>
            <button type="button" className="island-tile" aria-pressed={r.species === s.id} onClick={() => {
                chooseSpecies(child.id, s.id);
                onFx({ type: "cheer" });
              }}>
              <SpeciesArt id={s.id} size={64} />
              <span className="island-tile__name">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <h2 className="island-panel__title">ตู้เสื้อผ้า</h2>
      <p className="island-panel__hint">แตะเพื่อใส่หรือถอด ใส่ได้ตำแหน่งละชิ้น</p>
      <ul className="island-grid">
        {views.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className={`island-tile${w.unlocked ? "" : " is-locked"}`}
              aria-pressed={w.unlocked ? worn.has(w.id) : undefined}
              disabled={!w.unlocked}
              onClick={() => {
                toggleWear(child, source, w.id);
                onFx({ type: "cheer" });
              }}
            >
              <WearArt id={w.id} size={48} />
              <span className="island-tile__name">{w.name}</span>
              <span className="island-tile__state">
                {w.unlocked ? (worn.has(w.id) ? "ใส่อยู่" : "แตะเพื่อใส่") : `อีก ${w.left} ${w.unit}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PetsPanel({ child, source, l, onFx }: { child: Child; source: SignalKind; l: RewardLedger; onFx: (fx: IslandFx) => void }) {
  const d = useDB();
  const egg = eggView(d, child.id, source, l);
  const eggsLeft = EGGS.filter((e) => !l.pets.includes(e.pet));
  // buttons that disappear after use hand focus to their section heading (keyboard users keep their place)
  const eggTitle = useRef<HTMLHeadingElement>(null);
  const focusEgg = () => requestAnimationFrame(() => eggTitle.current?.focus());
  const hatch = () => {
    const kind = egg?.kind;
    const pet = hatchEgg(child.id, source);
    if (pet && kind) {
      showToast(`${PET_NAME[pet]}ออกมาแล้ว!`);
      onFx({ type: "hatch", egg: kind });
      focusEgg();
    }
  };
  return (
    <div className="island-panel">
      {l.pets.length === 0 ? (
        <>
          <h2 className="island-panel__title">เลือกเพื่อนตัวแรกได้เลย</h2>
          <ul className="island-grid island-grid--two">
            {STARTER_PETS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="island-tile"
                  onClick={() => {
                    adoptStarter(child.id, source, p);
                    focusEgg();
                  }}
                >
                  <PetArt kind={p} size={72} />
                  <span className="island-tile__name">{PET_NAME[p]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 ref={eggTitle} tabIndex={-1} className="island-panel__title">
        ไข่
      </h2>
      {egg ? (
        <div className="island-egg">
          <EggArt kind={egg.kind} crack={egg.crack} size={96} />
          <div className="island-egg__text">
            <p className="island-egg__line">
              {egg.ready ? "ไข่พร้อมฟักแล้ว!" : `ลองพูดอีก ${egg.need - egg.tries} ครั้ง ${PET_NAME[egg.pet]}จะออกมา`}
            </p>
            <div className="island-meter" role="progressbar" aria-label="ความคืบหน้าของไข่" aria-valuemin={0} aria-valuemax={egg.need} aria-valuenow={egg.tries}>
              <span style={{ width: `${(egg.tries / egg.need) * 100}%` }} />
            </div>
            {egg.ready ? (
              <button type="button" className="btn btn--primary" onClick={hatch}>
                ฟักไข่
              </button>
            ) : (
              <p className="island-panel__hint">นับจากการลองพูดในเกมหลังเลือกไข่ใบนี้</p>
            )}
          </div>
        </div>
      ) : eggsLeft.length > 0 ? (
        <>
          <p className="island-panel__hint">เลือกไข่ที่อยากฟัก รู้ก่อนเลยว่ามีใครอยู่ข้างใน</p>
          <ul className="island-grid">
            {eggsLeft.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="island-tile"
                  onClick={() => {
                    chooseEgg(child.id, source, e.id);
                    focusEgg();
                  }}
                >
                  <EggArt kind={e.id} size={64} />
                  <span className="island-tile__name">{e.name}</span>
                  <span className="island-tile__state">มี{PET_NAME[e.pet]}อยู่ข้างใน</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="island-panel__hint">ฟักครบทุกใบแล้ว!</p>
      )}

      {l.pets.length > 0 ? (
        <>
          <h2 className="island-panel__title">เพื่อนของฉัน</h2>
          <p className="island-panel__hint">แตะเพื่อเลือกตัวที่จะพาไปด้วย</p>
          <ul className="island-grid">
            {l.pets.map((p) => (
              <li key={p}>
                <button type="button" className="island-tile" aria-pressed={l.buddy === p} onClick={() => setBuddy(child.id, source, l.buddy === p ? null : p)}>
                  <PetArt kind={p} size={64} />
                  <span className="island-tile__name">{PET_NAME[p]}</span>
                  <span className="island-tile__state">{l.buddy === p ? "พาไปด้วย" : "อยู่บนเกาะ"}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function GardenPanel({ child, source, l, onFx }: { child: Child; source: SignalKind; l: RewardLedger; onFx: (fx: IslandFx) => void }) {
  const d = useDB();
  const now = nowMs(source);
  const beds = Array.from({ length: BEDS }, (_, i) => bedView(d, child.id, source, l, i, now));
  const [choosing, setChoosing] = useState<number | null>(null);
  const picked = Object.entries(l.harvest).filter(([, n]) => (n ?? 0) > 0);
  const gardenTitle = useRef<HTMLHeadingElement>(null);
  const chooser = useRef<HTMLDivElement>(null);
  const focusGarden = () => requestAnimationFrame(() => gardenTitle.current?.focus());
  // the seed choice opens in place of its button: focus its first seed
  useEffect(() => {
    if (choosing !== null) chooser.current?.querySelector("button")?.focus();
  }, [choosing]);
  const pick = (i: number) => {
    const kind = harvestBed(child.id, source, i);
    if (kind) {
      showToast(`เก็บ${plantName(kind)}แล้ว!`);
      onFx({ type: "pick", bed: i, kind });
      focusGarden();
    }
  };
  return (
    <div className="island-panel">
      <h2 ref={gardenTitle} tabIndex={-1} className="island-panel__title">
        แปลงผัก
      </h2>
      <p className="island-panel__hint">ทุกครั้งที่ลองพูดในเกม ต้นไม้ได้น้ำหนึ่งหยด ต้นไม้ไม่เหี่ยว ไม่ต้องรีบ</p>
      <ul className="island-beds">
        {beds.map((b) => (
          <li key={b.index} className="island-bed">
            <PlantArt kind={b.kind} stage={b.stage} size={92} />
            {b.kind ? (
              <>
                <p className="island-bed__name">
                  {plantName(b.kind)} · {STAGE_NAME[b.stage]}
                </p>
                {b.ready ? (
                  <button type="button" className="btn btn--primary" onClick={() => pick(b.index)}>
                    เก็บ{plantName(b.kind)}
                  </button>
                ) : (
                  <p className="island-bed__state">{b.waitTomorrow ? "โตเต็มที่แล้ว พรุ่งนี้มาเก็บได้" : `ลองพูดอีก ${b.toNext ?? 0} ครั้ง ต้นจะโต`}</p>
                )}
              </>
            ) : choosing === b.index ? (
              <div ref={chooser} className="island-bed__choose" role="group" aria-label={`เลือกเมล็ดสำหรับแปลงที่ ${b.index + 1}`}>
                {PLANTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="island-chip"
                    onClick={() => {
                      plantSeed(child.id, source, b.index, p.id);
                      setChoosing(null);
                      focusGarden();
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" className="btn btn--secondary" onClick={() => setChoosing(b.index)}>
                ปลูกต้นไม้
              </button>
            )}
          </li>
        ))}
      </ul>
      {picked.length > 0 ? (
        <p className="island-panel__hint">เก็บแล้ว: {picked.map(([k, n]) => `${plantName(k as PlantKind)} ${n}`).join(" · ")}</p>
      ) : null}
    </div>
  );
}

/** Demo-only: move the demo clock to tomorrow so the garden can be shown without waiting a real night. */
function DemoDayTool({ onChange }: { onChange: () => void }) {
  const off = dayOffset();
  return (
    <section className="island-demo" aria-label="เครื่องมือสาธิตสำหรับผู้ใหญ่">
      <p>
        <strong>สาธิตเท่านั้น:</strong> เลื่อนวันจำลองเพื่อดูสวนโตข้ามวัน {off > 0 ? `(ตอนนี้ +${off} วัน)` : ""}
      </p>
      <div className="island-demo__row">
        <button
          type="button"
          className="quiet-btn"
          onClick={() => {
            setDayOffset(off + 1);
            onChange();
          }}
        >
          ข้ามไปวันพรุ่งนี้
        </button>
        {off > 0 ? (
          <button
            type="button"
            className="quiet-btn"
            onClick={() => {
              setDayOffset(0);
              onChange();
            }}
          >
            กลับวันจริง
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function IslandScreen() {
  const d = useDB();
  const child = useActiveChild();
  useSignalSource();
  const source = signalKind();
  const [tab, setTab] = useState<Tab>("pets");
  const [, setTick] = useState(0);
  const mode = stageMode(useGfx());
  const reduced = useReducedMotion();
  const r = rewardsOf(d, child.id);
  const l = ledgerOf(r, source);
  const today = attemptsOnDay(d, child.id, source, dayKey(nowMs(source)));
  const egg = eggView(d, child.id, source, l);
  const now = nowMs(source);
  const beds = Array.from({ length: BEDS }, (_, i) => bedView(d, child.id, source, l, i, now));

  // a hatch / pick keeps the old egg or plant on screen for the length of its animation (the data already moved on)
  const [fx, setFx] = useState({ hatchSeq: 0, hatching: null as EggKind | null, pickSeq: 0, pickBed: -1, picking: null as PlantKind | null, cheerSeq: 0 });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onFx = (e: IslandFx) => {
    window.clearTimeout(timer.current);
    if (e.type === "hatch") {
      setFx((f) => ({ ...f, hatchSeq: f.hatchSeq + 1, hatching: e.egg }));
      timer.current = window.setTimeout(() => setFx((f) => ({ ...f, hatching: null })), reduced ? 2200 : 1700);
    } else if (e.type === "pick") {
      setFx((f) => ({ ...f, pickSeq: f.pickSeq + 1, pickBed: e.bed, picking: e.kind }));
      timer.current = window.setTimeout(() => setFx((f) => ({ ...f, picking: null })), reduced ? 500 : 1100);
    } else setFx((f) => ({ ...f, cheerSeq: f.cheerSeq + 1 }));
  };
  const eggProp = fx.hatching ? `${fx.hatching}:3:1` : egg ? `${egg.kind}:${egg.crack}:${egg.ready ? 1 : 0}` : "";
  const bedsProp = beds.map((b) => (fx.picking && b.index === fx.pickBed ? `${fx.picking}:3` : b.kind ? `${b.kind}:${b.stage}` : "")).join(",");
  const is3d = mode.kind === "3d";

  // coming back after a game: show last time first, then grow to now (the plant pops, the can pours, the egg cracks)
  const seenKey = `${child.id}:${source}`;
  const [seenAtMount] = useState(() => readSeen(seenKey));
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), reduced ? 300 : 900);
    return () => window.clearTimeout(id);
  }, [reduced]);
  useEffect(() => {
    if (revealed) writeSeen(seenKey, { beds: bedsProp, egg: eggProp });
  }, [revealed, seenKey, bedsProp, eggProp]);
  const seen = seenAtMount;
  const shownBeds = !revealed && seen ? blendBeds(seen.beds, bedsProp) : bedsProp;
  const shownEgg = !revealed && seen && !fx.hatching ? blendEgg(seen.egg, eggProp) : eggProp;

  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page island">
        <header className="island__bar">
          <button type="button" className="world-btn" onClick={() => navigate("home")} aria-label="กลับหน้าหลัก">
            <Icon name="back" size={22} />
          </button>
          <h1 className="island__title">เกาะของฉัน</h1>
          <span className={`island__source island__source--${source}`}>{source === "device" ? "อุปกรณ์จริง" : "โหมดสาธิต"}</span>
        </header>

        <section className={`island__hero${is3d ? " island__hero--3d" : ""}`} aria-label="ตัวละครและเพื่อนที่พาไปด้วย">
          <div className={`island__stage${is3d ? " island__stage--3d" : ""}`} aria-hidden="true">
            {is3d ? (
              <World3D
                kind="island"
                tier={mode.tier}
                active
                reduced={reduced}
                species={r.species}
                outfit={outfitOf(d, child, source)}
                buddy={l.buddy ?? ""}
                pets={l.pets.filter((p) => p !== l.buddy).join(",")}
                egg={shownEgg}
                beds={shownBeds}
                focus={tab}
                hatchSeq={fx.hatchSeq}
                pickSeq={fx.pickSeq}
                pickBed={fx.pickBed}
                cheerSeq={fx.cheerSeq}
              />
            ) : (
              <>
                <span className="island__avatar">
                  <SpeciesArt id={r.species} size={128} />
                </span>
                {l.buddy ? (
                  <span className="island__buddy">
                    <PetArt kind={l.buddy} size={76} />
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div className="island__today">
            <p className="island__count">
              <strong>{today}</strong> ครั้ง
            </p>
            <p className="island__countlabel">วันนี้ลองพูดในเกมแล้ว</p>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate("home")}>
              ไปเล่นกัน <Icon name="next" size={20} />
            </button>
          </div>
        </section>

        <div className="island__tabs" role="tablist" aria-label="ของในเกาะ">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`island-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="island-panel"
              className="island__tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id="island-panel" role="tabpanel" aria-labelledby={`island-tab-${tab}`}>
          {tab === "me" ? (
            <MePanel child={child} source={source} onFx={onFx} />
          ) : tab === "pets" ? (
            <PetsPanel child={child} source={source} l={l} onFx={onFx} />
          ) : (
            <GardenPanel child={child} source={source} l={l} onFx={onFx} />
          )}
        </div>

        <p className="island__note">
          ของในเกาะโตจากการลองพูดในเกมที่ตรวจพบและสัญญาณใช้ได้เท่านั้น ไม่มีของสุ่ม ไม่มีการซื้อ ไม่มีของหายเมื่อไม่ได้มาเล่น
          {source === "demo" ? " · ของที่ได้ในโหมดสาธิตแยกจากของที่ได้กับอุปกรณ์จริง" : ""}
        </p>
        <StageNote mode={mode} />
        {source === "demo" ? <DemoDayTool onChange={() => setTick((n) => n + 1)} /> : null}
        <Disclaimer compact />
      </div>
    </div>
  );
}
