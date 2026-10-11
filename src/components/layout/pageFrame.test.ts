import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InAppProvider, PageFrame } from './PageFrame';

/*
 * Every screen in the app shares one frame, so they stop being different products.
 *
 * Before PageFrame each screen chose its own width and alignment — 1024px centred, 1024px pinned
 * left, 768px, 1400px with extra padding — and beside the full-width Overview every one of them left
 * a third of a desktop screen empty. These pin the frame's two modes and keep the screens on it.
 */

const frame = (inApp: boolean) => {
  const page = createElement(PageFrame, {
    title: 'Support',
    onBack: () => undefined,
    children: createElement('p', null, 'body'),
  });
  return renderToString(inApp ? createElement(InAppProvider, null, page) : page);
};

describe('PageFrame', () => {
  it('is full width inside the app, on the Overview’s card spacing', () => {
    const html = frame(true);
    expect(html).not.toMatch(/max-w-(2xl|3xl|4xl|5xl|6xl)\b[^"]*mx-auto/);
    expect(html).toContain('gap-2 md:gap-3');
  });

  it('keeps the centred column on the public site, where nothing sits beside it', () => {
    expect(frame(false)).toContain('max-w-2xl mx-auto');
  });
});

describe('the app’s screens', () => {
  /** Every screen JournalApp opens beside the sidebar. */
  const SCREENS = [
    'src/components/PerformanceContent.tsx',
    'src/components/simulator/RuleSimulatorContent.tsx',
    'src/components/analytics/AssistantContent.tsx',
    'src/components/trackRecord/TrackRecordContent.tsx',
    'src/components/SettingsPage.tsx',
    'src/components/brokers/BrokerConnectContent.tsx',
    'src/components/support/BrokersContent.tsx',
    'src/components/support/SupportDashboard.tsx',
    'src/components/support/SupportTicketsContent.tsx',
    'src/components/support/ReportBugContent.tsx',
    'src/components/coach/CoachInboxContent.tsx',
    'src/components/account/AccountScreen.tsx',
  ];

  it('all render through PageFrame', () => {
    const off = SCREENS.filter((f) => !readFileSync(f, 'utf8').includes('<PageFrame'));
    expect(off).toEqual([]);
  });

  it('none of them caps its own width again', () => {
    // A page-level `max-w-… mx-auto p-4 md:p-6` wrapper is exactly what made each screen a
    // different width. BrokersContent keeps one for its public layout only, behind useInApp.
    const capped = SCREENS.filter((f) => f !== 'src/components/support/BrokersContent.tsx').filter((f) =>
      /className="max-w-[^"]*mx-auto p-4 md:p-6/.test(readFileSync(f, 'utf8')),
    );
    expect(capped).toEqual([]);
  });

  it('are wrapped as in-app by the journal shell', () => {
    expect(readFileSync('src/pages/JournalApp.tsx', 'utf8')).toContain('<InAppProvider>');
  });
});
