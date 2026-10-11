import { useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import type { Trade } from '../../types';
import { useAuth } from '../../context/useAuth';
import { useSettings } from '../../context/useSettings';
import { buildMonthlyReport } from '../../utils/monthlyReport';
import { PageFrame } from '../layout/PageFrame';
import { MonthlyReportDocument } from './MonthlyReportDocument';

interface MonthlyReportViewProps {
  /** The journal's trades as the screens see them — one journal, or all of them in that view. */
  trades: Trade[];
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onBack: () => void;
}

const noopSubscribe = () => () => undefined;

/**
 * The monthly report: a preview of the page in the app, and the same page handed to the browser's
 * print dialog as a PDF.
 *
 * No PDF library and no server. The browser's own "Save as PDF" lays it out properly — real text,
 * selectable and searchable — where an image-based PDF would be a screenshot in a wrapper, and a
 * library would add hundreds of kilobytes to the app for one button.
 *
 * The printed copy is a second render of the document straight into <body>, outside the app. The
 * print stylesheet hides every other child of <body> (see .report-print in index.css), so the PDF
 * is the report alone — not the sidebar, not the dark background, not a blank page after it where
 * the rest of the app would have been.
 */
export function MonthlyReportView({ trades, year, month, onPrevMonth, onNextMonth, onBack }: MonthlyReportViewProps) {
  const { username } = useAuth();
  const { settings, viewingAllJournals } = useSettings();

  const scope = viewingAllJournals
    ? 'All journals'
    : (settings.accounts.find((a) => a.id === settings.activeAccountId)?.name ?? 'Journal');

  const report = useMemo(
    () =>
      buildMonthlyReport({
        trades,
        year,
        month,
        scope,
        rules: settings.tradingRules,
        allJournals: viewingAllJournals,
      }),
    [trades, year, month, scope, settings.tradingRules, viewingAllJournals],
  );

  // Read once: the date on the page is when it was opened, and a render must not read the clock.
  const [generatedOn] = useState(() =>
    new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
  );

  // The portal needs a document; the server render and the tests have none.
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const document_ = (
    <MonthlyReportDocument report={report} currency={settings.currency} username={username} generatedOn={generatedOn} />
  );

  return (
    <PageFrame
      title="Monthly report"
      icon={FileText}
      onBack={onBack}
      subtitle="One month of your journal on a page — the figures, the calendar and where the money came from. Download it as a PDF to keep, or to send to someone who coaches you."
      actions={
        <>
          <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-bg-tertiary/60 p-0.5">
            <button
              type="button"
              onClick={onPrevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-md text-text-secondary hover:text-text-primary focus-ring"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums">{report.label}</span>
            <button
              type="button"
              onClick={onNextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-md text-text-secondary hover:text-text-primary focus-ring"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report.hasTrades}
            title="Opens your browser's print dialog — choose Save as PDF"
            className="btn-primary gap-2 px-4 py-2 text-sm disabled:opacity-40 focus-ring"
          >
            <Download size={15} aria-hidden />
            Download PDF
          </button>
        </>
      }
    >
      <p className="px-0.5 text-[11px] text-text-secondary">
        Download opens your browser&apos;s print dialog — pick <span className="text-text-primary">Save as PDF</span> as
        the printer.
      </p>

      {/* The page as it will print: a sheet on the desk. */}
      <div className="rounded-xl bg-bg-tertiary/30 border border-border/40 p-3 md:p-8 overflow-x-auto">
        <div className="mx-auto w-full max-w-[816px] min-w-[640px] rounded-md bg-white p-6 md:p-12 shadow-2xl shadow-black/40">
          {document_}
        </div>
      </div>

      {inBrowser && createPortal(<div className="report-print">{document_}</div>, document.body)}
    </PageFrame>
  );
}
