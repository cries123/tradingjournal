export interface ParsedTrade {
  symbol: string;
  pnl: number;
  date: string;
  side?: 'long' | 'short';
  notes?: string;
  contract?: string;
  assetType?: 'stock' | 'option';
  optionType?: 'call' | 'put';
  expiration?: string;
  strike?: number;
  quantity?: number;
  mark?: number;
  tradePrice?: number;
  pnlOpen?: number;
  netLiq?: number;
  underlyingPrice?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  accountType?: string;
}

interface ParseResponse {
  trades: Partial<ParsedTrade>[];
}

const SYSTEM_PROMPT = `You extract trade data from mobile brokerage screenshots (Thinkorswim/TOS, TD Ameritrade, Schwab, Robinhood, etc.).

Return ONLY valid JSON:
{
  "trades": [
    {
      "symbol": "SPY",
      "pnl": -75.00,
      "pnlDisplay": "($75.00)",
      "date": "2025-06-22",
      "side": "short",
      "contract": "SPY 22 JUN 26 746 P 100 (Weeklys)",
      "assetType": "option",
      "optionType": "put",
      "expiration": "2026-06-22",
      "strike": 746,
      "quantity": 0,
      "mark": 1.90,
      "tradePrice": 0.00,
      "pnlOpen": 0.00,
      "netLiq": 0.00,
      "underlyingPrice": 745.7492,
      "delta": 0.00,
      "gamma": 0.00,
      "theta": 0.00,
      "vega": 0.00,
      "accountType": "Individual",
      "notes": "Any extra context from the screenshot"
    }
  ]
}

Field rules:
- symbol: underlying ticker only (SPY, not full option string)
- pnl: signed number from "P/L Day" (or "P/L Open" if Day not shown). CRITICAL SIGN RULES for Thinkorswim:
  * Parentheses mean LOSS: ($75.00) → pnl: -75, pnlDisplay: "($75.00)"
  * Red text P/L values are losses → negative pnl
  * Green text or leading + → positive pnl
  * NEVER return a positive number when the screenshot shows ($X.XX) in red
  * Always include pnlDisplay: the exact P/L string as shown on screen
- pnlOpen: signed number with same parenthesis/red rules; include pnlOpenDisplay if visible
- date: YYYY-MM-DD; use today if P/L Day with no date shown
- side: "long" or "short"; puts often short, calls often long
- contract: full option/position description line
- assetType: "option" or "stock"
- optionType: "call" or "put"
- expiration: YYYY-MM-DD from contract
- strike, quantity, mark, tradePrice, netLiq, underlyingPrice: numbers when visible
- delta, gamma, theta, vega: numbers when visible (0 is valid)
- accountType: e.g. Individual, IRA
- notes: bid/ask, MM expected move, or other useful details not captured above
- One entry per position row in a table; skip rows with no P/L data
- Omit fields not visible; do not guess values
- If nothing found: { "trades": [] }`;

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function parseSignedPnl(value: unknown, display?: unknown): number | undefined {
  const displayStr = str(display);
  if (displayStr) {
    const parenMatch = displayStr.match(/\(\s*\$?\s*([\d,]+\.?\d*)\s*\)/);
    if (parenMatch) {
      const amount = parseFloat(parenMatch[1].replace(/,/g, ''));
      if (!isNaN(amount)) return -Math.abs(amount);
    }
    if (displayStr.includes('-') || displayStr.startsWith('−')) {
      const amount = parseFloat(displayStr.replace(/[^0-9.]/g, ''));
      if (!isNaN(amount)) return -Math.abs(amount);
    }
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('(') && s.includes(')')) {
      const amount = parseFloat(s.replace(/[$(),]/g, ''));
      if (!isNaN(amount)) return -Math.abs(amount);
    }
  }

  return num(value);
}

function normalizeTrade(t: Partial<ParsedTrade & { pnlDisplay?: string; pnlOpenDisplay?: string }>, today: string): ParsedTrade | null {
  const symbol = str(t.symbol)?.toUpperCase();
  const pnl = parseSignedPnl(t.pnl, t.pnlDisplay);
  if (!symbol || pnl === undefined) return null;

  const pnlOpen = parseSignedPnl(t.pnlOpen, t.pnlOpenDisplay);

  return {
    symbol,
    pnl,
    date: str(t.date) || today,
    side: t.side === 'short' ? 'short' : t.side === 'long' ? 'long' : undefined,
    notes: str(t.notes),
    contract: str(t.contract),
    assetType: t.assetType === 'option' ? 'option' : t.assetType === 'stock' ? 'stock' : undefined,
    optionType: t.optionType === 'put' ? 'put' : t.optionType === 'call' ? 'call' : undefined,
    expiration: str(t.expiration),
    strike: num(t.strike),
    quantity: num(t.quantity),
    mark: num(t.mark),
    tradePrice: num(t.tradePrice),
    pnlOpen: pnlOpen,
    netLiq: num(t.netLiq),
    underlyingPrice: num(t.underlyingPrice),
    delta: num(t.delta),
    gamma: num(t.gamma),
    theta: num(t.theta),
    vega: num(t.vega),
    accountType: str(t.accountType),
  };
}

export async function parseScreenshotWithAI(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<ParsedTrade[]> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required. Add it in the import dialog or set OPENAI_API_KEY in .env');
  }

  const today = new Date().toISOString().slice(0, 10);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Parse this trading screenshot. Today's date is ${today} if you need a fallback.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: 'auto',
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI parser');
  }

  const parsed = JSON.parse(content) as ParseResponse;
  if (!Array.isArray(parsed.trades)) {
    throw new Error('Invalid AI response format');
  }

  return parsed.trades
    .map((t) => normalizeTrade(t, today))
    .filter((t): t is ParsedTrade => t !== null);
}

export async function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}
