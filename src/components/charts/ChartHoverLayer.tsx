import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reusable interaction layer for the app's hand-rolled SVG line/area charts.
 *
 * Wraps a chart's SVG (rendered via `children`) and, given the exact array of
 * plotted points (in the same viewBox coordinate space used to draw the
 * chart), tracks the nearest point to the pointer on hover/tap and renders a
 * tooltip using `renderTooltip`. No values are invented here — callers must
 * pass the identical dataset used to draw the chart.
 *
 * Interaction model:
 * - Desktop (mouse): tooltip follows the pointer on hover, and clears when
 *   the pointer leaves the chart. Unchanged from mouse-only behavior.
 * - Mobile/touch: tapping or dragging a finger over the chart selects the
 *   nearest point and shows its tooltip. Lifting the finger (touchend) does
 *   NOT hide the tooltip, so there's time to read it. Tapping a different
 *   point updates the tooltip. Tapping anywhere outside the chart dismisses
 *   it.
 */

/** Clears the hovered index when a touch/click lands outside the given container. */
function useDismissOnOutsideTap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (e: Event) => {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) {
        onDismiss();
      }
    };
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [active, containerRef, onDismiss]);
}

export interface HoverPoint {
  x: number;
  y: number;
}

interface ChartHoverLayerProps<T extends HoverPoint> {
  points: T[];
  viewBoxWidth: number;
  viewBoxHeight: number;
  children: (args: { hoveredIndex: number | null }) => React.ReactNode;
  renderTooltip: (point: T, index: number) => React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function ChartHoverLayer<T extends HoverPoint>({
  points,
  viewBoxWidth,
  viewBoxHeight,
  children,
  renderTooltip,
  className = '',
  disabled = false,
}: ChartHoverLayerProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || points.length === 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const relX = ((clientX - rect.left) / rect.width) * viewBoxWidth;
      let nearest = 0;
      let minDist = Infinity;
      points.forEach((p, i) => {
        const d = Math.abs(p.x - relX);
        if (d < minDist) {
          minDist = d;
          nearest = i;
        }
      });
      setHoveredIndex(nearest);
    },
    [points, viewBoxWidth]
  );

  const dismiss = useCallback(() => setHoveredIndex(null), []);
  useDismissOnOutsideTap(containerRef, hoveredIndex != null, dismiss);

  if (disabled || points.length === 0) {
    return <div className={`relative ${className}`}>{children({ hoveredIndex: null })}</div>;
  }

  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;

  let tooltipStyle: React.CSSProperties = {};
  let translateX = '-50%';
  if (hovered) {
    const leftPct = (hovered.x / viewBoxWidth) * 100;
    const topPct = (hovered.y / viewBoxHeight) * 100;
    translateX = leftPct > 82 ? '-100%' : leftPct < 18 ? '0%' : '-50%';
    tooltipStyle = {
      left: `${Math.min(Math.max(leftPct, 0), 100)}%`,
      top: `${Math.max(topPct, 4)}%`,
    };
  }

  return (
    <div
      ref={containerRef}
      className={`relative touch-none ${className}`}
      onMouseMove={(e) => updateFromClientX(e.clientX)}
      onMouseLeave={() => setHoveredIndex(null)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) updateFromClientX(t.clientX);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) updateFromClientX(t.clientX);
      }}
      // Intentionally no onTouchEnd handler here: lifting the finger must not
      // hide the tooltip. Dismissal on touch happens only via a tap outside
      // this container (see useDismissOnOutsideTap above).
    >
      {children({ hoveredIndex })}
      {hovered && hoveredIndex != null && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            ...tooltipStyle,
            transform: `translate(${translateX}, -112%)`,
          }}
        >
          {renderTooltip(hovered, hoveredIndex)}
        </div>
      )}
    </div>
  );
}

/** Dark, telemetry-styled tooltip card shell used by all chart tooltips. */
export const TooltipCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-w-[140px] max-w-[min(78vw,280px)] rounded-lg border border-cyan-500/30 bg-[#0a0e16]/95 backdrop-blur-md px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.55)] font-mono break-words [overflow-wrap:anywhere]">
    {children}
  </div>
);

export const TooltipLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 break-words">{children}</div>
);

export const TooltipRow: React.FC<{ label: string; value: React.ReactNode; valueClassName?: string }> = ({
  label,
  value,
  valueClassName = 'text-cyan-300',
}) => (
  <div className="flex items-start justify-between gap-3 text-[11px] leading-tight">
    <span className="text-slate-400 shrink-0">{label}</span>
    <span className={`font-semibold break-words text-right ${valueClassName}`}>{value}</span>
  </div>
);

/**
 * Lighter-weight variant for charts where only a per-index x-position is
 * reliable (e.g. a curve rendered from a backend-precomputed SVG path
 * string, with a separate discrete series sharing the same x-axis domain).
 * Renders a vertical guide line at the nearest index instead of a dot,
 * since no trustworthy y-value exists for arbitrary points along the path.
 *
 * Same interaction model as ChartHoverLayer: touchend does not dismiss the
 * tooltip; only a tap outside the chart does.
 */
interface ChartXGuideLayerProps<T> {
  series: T[];
  viewBoxWidth: number;
  viewBoxHeight: number;
  children: React.ReactNode;
  renderTooltip: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function ChartXGuideLayer<T>({
  series,
  viewBoxWidth,
  viewBoxHeight,
  children,
  renderTooltip,
  className = '',
}: ChartXGuideLayerProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || series.length === 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      const idx = Math.round(frac * (series.length - 1));
      setHoveredIndex(idx);
    },
    [series]
  );

  const dismiss = useCallback(() => setHoveredIndex(null), []);
  useDismissOnOutsideTap(containerRef, hoveredIndex != null, dismiss);

  if (series.length === 0) {
    return <div className={`relative ${className}`}>{children}</div>;
  }

  const guideX = hoveredIndex != null ? (hoveredIndex / Math.max(1, series.length - 1)) * 100 : null;
  const translateX = guideX != null ? (guideX > 82 ? '-100%' : guideX < 18 ? '0%' : '-50%') : '-50%';

  return (
    <div
      ref={containerRef}
      className={`relative touch-none ${className}`}
      onMouseMove={(e) => updateFromClientX(e.clientX)}
      onMouseLeave={() => setHoveredIndex(null)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) updateFromClientX(t.clientX);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) updateFromClientX(t.clientX);
      }}
      // No onTouchEnd dismissal — see ChartHoverLayer above for rationale.
    >
      {children}
      {guideX != null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-cyan-400/40 pointer-events-none z-20"
          style={{ left: `${guideX}%` }}
        />
      )}
      {guideX != null && hoveredIndex != null && (
        <div
          className="absolute z-30 pointer-events-none top-1"
          style={{ left: `${guideX}%`, transform: `translate(${translateX}, 0)` }}
        >
          {renderTooltip(series[hoveredIndex], hoveredIndex)}
        </div>
      )}
    </div>
  );
}
