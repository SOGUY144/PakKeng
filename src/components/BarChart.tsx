import { type RefObject, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Single-series bar chart (SVG, no library). One series per chart → no legend box; the title names it.
 * Text uses ink tokens; colour marks identity only. Sample bars are hatched so they never read as live data.
 */
export interface ChartBar {
  key: string;
  label: string;
  value: number | null;
  tone: "current" | "past" | "sample";
  tip: string;
}

interface Props {
  bars: ChartBar[];
  max: number;
  unit: string;
  color: "oral" | "nasal";
  refLine?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
  /** Direct labels: only the current bar (default), first + current ("ends"), or every bar. */
  valueLabels?: "current" | "ends" | "all";
  formatValue?: (v: number) => string;
}

const PAD = { top: 24, right: 8, bottom: 30, left: 34 };

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function BarChart({ bars, max, unit, color, refLine, height = 180, ariaLabel, valueLabels = "current", formatValue }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const hatchId = useId().replace(/:/g, "");
  const fmt = formatValue ?? ((v: number) => `${Math.round(v)}${unit}`);

  const W = Math.max(width, 200);
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, bars.length);
  const barW = Math.max(10, Math.min(44, band * 0.62));
  // Round the axis up so the middle tick is a whole number (e.g. 9 → 0/5/10).
  const top = unit === "%" ? max : max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 10) * 10;
  const y = (v: number) => PAD.top + innerH * (1 - Math.min(v, top) / top);
  const ticks = [0, top / 2, top];

  const fills = {
    oral: { current: "var(--oral)", past: "var(--oral-tint)", sample: `url(#${hatchId}-o)` },
    nasal: { current: "var(--nasal)", past: "var(--nasal-tint)", sample: `url(#${hatchId}-n)` },
  }[color];

  const tipBar = active !== null ? bars[active] : null;
  const firstWithValue = bars.findIndex((b) => b.value !== null);

  return (
    <div className="chart" ref={ref}>
      {refLine ? (
        <p className="chart__refkey">
          <span className="chart__dash" aria-hidden="true" />
          เส้นประ = {refLine.label}
        </p>
      ) : null}
      {width > 0 ? (
        <svg width={W} height={H} role="img" aria-label={ariaLabel}>
          <defs>
            <pattern id={`${hatchId}-o`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--oral-soft)" />
              <rect width="2" height="6" fill="var(--oral-tint)" />
            </pattern>
            <pattern id={`${hatchId}-n`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--nasal-soft)" />
              <rect width="2" height="6" fill="var(--nasal-tint)" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="chart__tick">
                {Number.isInteger(t) ? t : t.toFixed(1)}
                {unit === "%" ? "%" : ""}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.left + band * i + band / 2;
            const showLabel =
              b.value !== null &&
              (valueLabels === "all" || b.tone === "current" || (valueLabels === "ends" && i === firstWithValue));
            return (
              <g
                key={b.key}
                className="chart__bar"
                tabIndex={0}
                role="img"
                aria-label={b.tip}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <rect x={cx - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {b.value !== null ? (
                  (() => {
                    const top = y(b.value);
                    const h = Math.max(2, PAD.top + innerH - top);
                    const r = Math.min(4, h / 2, barW / 2);
                    const x0 = cx - barW / 2;
                    const yb = PAD.top + innerH;
                    const d = `M${x0},${yb} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${yb} Z`;
                    return (
                      <path
                        d={d}
                        fill={fills[b.tone]}
                        stroke={b.tone === "sample" ? `var(--${color === "oral" ? "oral" : "nasal"}-tint)` : "none"}
                        strokeWidth={1}
                        opacity={active !== null && active !== i ? 0.55 : 1}
                      />
                    );
                  })()
                ) : (
                  <text x={cx} y={PAD.top + innerH - 6} textAnchor="middle" className="chart__none">
                    —
                  </text>
                )}
                {showLabel ? (
                  <text x={cx} y={y(b.value as number) - 7} textAnchor="middle" className="chart__value">
                    {fmt(b.value as number)}
                  </text>
                ) : null}
                <text x={cx} y={H - 10} textAnchor="middle" className={`chart__x${b.tone === "current" ? " is-current" : ""}`}>
                  {b.label}
                </text>
              </g>
            );
          })}
          {refLine ? (
            <line
              aria-hidden="true"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ) : null}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--line-strong)" strokeWidth={1} />
        </svg>
      ) : (
        <div style={{ height: H }} />
      )}
      {tipBar ? (
        <div
          className="chart__tip"
          style={{
            left: Math.min(Math.max(PAD.left + band * (active as number) + band / 2, 112), W - 112),
            top: tipBar.value !== null ? Math.max(4, y(tipBar.value) - 44) : PAD.top,
          }}
          role="presentation"
        >
          {tipBar.tip}
        </div>
      ) : null}
    </div>
  );
}
