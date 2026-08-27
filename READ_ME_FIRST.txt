TREND CHASERS — EVERYTHING FROM THIS SESSION, ONE ZIP
==================================================

This is the full set of changes from leaderboard through the starfield
on the landing/sign-up screens — every file touched across all of this
session's updates, consolidated into one drop-in package.

HOW TO APPLY
------------
Every file in this zip goes to the SAME PATH under your project root
(e.g. src/pages/JournalApp.tsx -> src/pages/JournalApp.tsx,
public/broker-logos/fidelity.png -> public/broker-logos/fidelity.png).
Overwrite existing files; the broker-logo PNGs and src/components/
Starfield.tsx, LeaderboardContent.tsx, and DashboardWeekTotalCell.tsx
are new files your project doesn't have yet.

ONE FILE TO DELETE: src/components/PerformanceChart.tsx is no longer
used — it was replaced by DailyPnlChart.tsx and WeekdayChart.tsx during
the trading-insights rework. It's not in this zip; remove it from your
project if it's still there.

Verified: npx tsc -b --force -> 0 errors. npm run lint -> 18 warnings
(the pre-existing baseline — unchanged by any of this work).
npx vite build -> compiles clean.

EVERYTHING THIS COVERS, IN ORDER
---------------------------------

1. LEADERBOARD
   Three ranked categories — Most Profitable (net P&L), Most Consistent
   (win rate), Best Risk Management (avg R:R) — gated to broker-synced
   trades only, with an opt-in/opt-out toggle and an anonymous-display
   option in Settings. New file: LeaderboardContent.tsx.

2. TRADE HISTORY SHARING + RICHER SNAPTRADE DATA
   Coach share is now a date-range trade-history link (view-only,
   expandable per-trade detail) instead of a fixed month. SnapTrade
   sync now pulls and structures everything it can — entry/exit price,
   entry/exit time, fees, gross P&L — as real fields instead of burying
   it in a notes blob. Touches coachShare.ts, mapSnapTradeActivities.ts,
   CoachViewPage.tsx, TradeDetails.tsx, types.ts, and related utils.

3. THEME ACCENT — NOW COLORS THE WHOLE APP
   The Emerald / Cyan / Violet picker in Settings used to only recolor
   the P&L text and a faint glow. It now recolors buttons, banners,
   badges, nav highlights, focus rings, chart bars, and the calendar's
   "today" ring across the entire authenticated app — everything except
   the logo, the public landing page, and the exported/shareable trade-
   recap image, which intentionally keep a fixed brand look. Cyan also
   got its own distinct accent color (it used to reuse Emerald's blue
   by mistake). Touches index.css, SettingsContext.tsx, and ~30
   component files.

4. MILKY WAY STARFIELD BACKGROUND
   Replaced the old flat two-gradient background with a real starfield
   — nebula glow, faint twinkling stars, constellation lines — first
   across the whole authenticated app (dashboard, settings, leaderboard,
   connect broker, the trade-history share page), then extended to the
   public landing page and the sign-in/sign-up + username screens.
   New file: Starfield.tsx. On the dashboard and the sign-in/sign-up/
   username screens, the nebula glow recolors to match your Theme
   accent; on the landing page it stays the fixed brand emerald/blue,
   same reasoning as the logo staying fixed there.

WHAT DELIBERATELY STAYED FIXED, EVERYWHERE IN THIS ZIP
---------------------------------------------------------
  - The logo (BrandLogo.tsx — not included, untouched)
  - The public landing page's own brand colors (though it now has the
    starfield behind it)
  - The downloadable/shareable trade-recap card — the PNG you save or
    share, and its in-modal preview — kept as a fixed brand asset
  - The Admin panel — a couple of spots there use green vs. cyan to
    tell two different activity types apart, not as decorative brand
    color, so it was left alone rather than risk erasing that
    distinction. Say the word if you want that addressed separately.
  - Loss/red stays red everywhere — that's a P&L semantic, not a brand
    color, so it never moves with the theme picker.

SCREENSHOTS FROM ACROSS THESE UPDATES ARE IN YOUR EARLIER MESSAGES IN
THIS CONVERSATION — this zip is code only, to keep the download small.
Ask if you'd like them re-sent alongside this.
