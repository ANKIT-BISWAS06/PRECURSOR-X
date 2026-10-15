import React from 'react';

/**
 * Colour semantics used across the app:
 *  - red (error)   : genuinely critical hazards and failed barriers only
 *  - amber         : warnings / high / moderate
 *  - green         : verified effective controls, completed actions
 *  - cyan / grey   : neutral information
 */
export type SeverityTone = 'critical' | 'warning' | 'good' | 'neutral';

export const toneFromLabel = (label?: string | null): SeverityTone => {
  const v = (label || '').toLowerCase();
  if (v === 'critical' || v === 'failed' || v === 'critical delta') return 'critical';
  if (v === 'high' || v === 'moderate' || v === 'medium' || v === 'degraded' || v === 'warning') return 'warning';
  if (v === 'low' || v === 'completed' || v === 'protected' || v === 'effective' || v === 'verified') return 'good';
  return 'neutral';
};

export const toneClasses: Record<SeverityTone, { badge: string; dot: string; text: string; border: string }> = {
  critical: {
    badge: 'bg-rose-950/60 text-error border-error/40',
    dot: 'bg-error',
    text: 'text-error',
    border: 'border-error/40',
  },
  warning: {
    badge: 'bg-amber-950/40 text-amber-300 border-amber-400/30',
    dot: 'bg-amber-300',
    text: 'text-amber-300',
    border: 'border-amber-400/30',
  },
  good: {
    badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-400/30',
    dot: 'bg-emerald-300',
    text: 'text-emerald-300',
    border: 'border-emerald-400/30',
  },
  neutral: {
    badge: 'bg-surface-container-high text-on-surface-variant border-outline-variant/60',
    dot: 'bg-outline',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/60',
  },
};

export const SeverityBadge: React.FC<{ label: string; tone?: SeverityTone }> = ({ label, tone }) => {
  const t = toneClasses[tone ?? toneFromLabel(label)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full border font-label-code-sm text-label-code-sm font-semibold whitespace-nowrap ${t.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};
