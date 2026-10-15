import React, { useId } from 'react';

interface DisclosureProps {
  title: string;
  /** One-line summary shown under the title. */
  summary?: React.ReactNode;
  /** Kept for backwards compatibility. Sections are always fully visible. */
  defaultOpen?: boolean;
  /** Kept for backwards compatibility. Ignored: sections never collapse. */
  open?: boolean;
  /** Kept for backwards compatibility. Never called: sections never collapse. */
  onOpenChange?: (open: boolean) => void;
  /** Optional controls (filters, search) rendered in the header row. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Section panel. Previously a click-to-reveal disclosure; every section is now
 * always expanded so no content is hidden behind a click. The component name and
 * props are kept so existing call sites keep working.
 */
export const Disclosure: React.FC<DisclosureProps> = ({
  title,
  summary,
  actions,
  children,
  className = '',
}) => {
  const panelId = useId();

  return (
    <section
      className={`bg-surface-container-low rounded-xl border border-surface-container-high/40 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-space-md px-space-lg py-space-md">
        <div className="flex flex-col min-w-0 flex-1">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</h2>
          {summary && (
            <span className="font-body-sm text-body-sm text-on-surface-variant break-words">{summary}</span>
          )}
        </div>
        {actions && <div className="flex items-center gap-space-sm">{actions}</div>}
      </div>
      <div id={panelId} className="px-space-lg pb-space-lg pt-space-xs">
        {children}
      </div>
    </section>
  );
};
