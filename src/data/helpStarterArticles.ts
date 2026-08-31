import type { HelpArticleCategory } from '../services/adminHelpArticles';

export interface StarterArticle {
  title: string;
  category: HelpArticleCategory;
  body: string;
}

/**
 * Articles kept in code so they can be added to the Help Center without being typed out.
 *
 * Help Center content lives in Firestore because it's yours to edit, but a long article is
 * miserable to compose in a textarea. These are drafted here and published from the admin panel;
 * once added they're ordinary articles you can edit or delete like any other.
 *
 * Bodies are plain text — a blank line starts a new paragraph, which is what the public page
 * renders from.
 */
export const HELP_STARTER_ARTICLES: StarterArticle[] = [
  {
    title: 'How your dashboard works',
    category: 'dashboard',
    body: `Your dashboard answers three questions, top to bottom: how did I do, when did I do it, and what should I change. Here's what each part is telling you.

THE BIG NUMBER

Net P&L for the period, with the trade count, the number of days you traded, and your average per day underneath. The Month / Year toggle at the top left switches everything on the page between the month you're viewing and the whole year.

The bar directly under it splits your winners from your losers by count — the green portion is the share of trades that made money.

THE STATS BESIDE IT

Win rate is the share of your trades that were profitable. On its own it means very little, which is why we show "need X%" next to it: that's the win rate your own average win and average loss require just to break even. A 45% win rate is excellent if you need 30% and a disaster if you need 60%.

Profit factor is gross profit divided by gross loss. Above 1.0 means you made money; above 1.5 is generally considered solid. Avg win/loss is the size of your average winner divided by your average loser — the number that decides the break-even win rate above.

Avg/trade is your expectancy: what one trade is worth to you on average, wins and losses together. It's the single most honest number on the page. The W/L pair is your raw record, and the streak counter tracks consecutive days journaled, not consecutive wins.

WORTH FIXING

When the data supports a single clear finding, it appears in the amber banner near the top — the one setup, symbol, or time of day costing you the most. It only appears when there's enough of a sample to mean something.

THE EQUITY CURVE

Cumulative P&L across the period, so you can see the shape of how you got here rather than just the total. The shaded area is drawdown from your running high: the deeper the shading, the further you were below your best point at that moment. Max drawdown is called out underneath.

THE CALENDAR

One cell per day, coloured by result and shaded by size — a deeper green is a bigger day relative to your best. The number underneath each figure is how many trades you took that day. The right-hand column totals each week.

Click any day to open it and see the individual trades, notes, and screenshots attached to that session.

Days you didn't trade stay empty rather than showing a zero, because no trades and a flat day are different things.

THE CHARTS

Performance by Weekday shows which days actually pay. Days you never traded are dimmed with a dashed outline so an empty bar is never mistaken for a break-even one.

Gross Daily P&L plots every day in the period around a zero line — profits above, losses below. Only the best and worst day are labelled to keep it readable; hover any bar for its exact figure.

Long vs Short splits the period by direction: what each side made or lost, how many trades it took, and the win rate for each. A direction you never traded is dimmed with a dashed outline rather than drawn as a flat bar.

FILTERS

The Symbol, Setup, Tag, and Side dropdowns above the charts narrow everything below them. Use them to ask specific questions — how does one setup perform in the morning, or how do your shorts compare with your longs.

WHAT'S WORKING, WHAT'S NOT

The bottom section ranks your symbols and setups by what they made and lost, alongside expectancy, profit factor, best and worst day, and drawdown. Anything with too few trades to be meaningful is left out rather than shown with a misleading percentage.

ASK

The Ask button opens an assistant that reviews the period with you. It reads the same numbers you're looking at — it never recalculates them — so it can't contradict your dashboard. It reviews what already happened and won't tell you what to trade next.`,
  },
];
