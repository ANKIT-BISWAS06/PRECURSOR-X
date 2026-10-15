import React from 'react';

interface PageHeaderProps {
  title: string;
  /** The single question this page answers. */
  question: string;
  actions?: React.ReactNode;
}

/** Consistent page heading: what the page is, and the one question it answers. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, question, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md">
    <div className="min-w-0">
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">{question}</p>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-space-sm">{actions}</div>}
  </div>
);
