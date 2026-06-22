export interface ParsedTrade {
  symbol: string;
  pnl: number;
  date: string;
  side?: 'long' | 'short';
  notes?: string;
}

interface ParseResponse {
  trades: ParsedTrade[];
}

const SYSTEM_PROMPT = `You extract trade data from mobile brokerage screenshots (Thinkorswim, TD Ameritrade, Schwab, Robinhood, etc.).

Return ONLY valid JSON with this shape:
{
  "trades": [
    {
      "symbol": "SPY",
      "pnl": 260.00,
      "date": "2025-06-22",
      "side": "long",
      "notes": "SPY 22 JUN 26 746 P 100 (Weeklys)"
    }
  ]
}

Rules:
- symbol: underlying ticker only (e.g. SPY, QQQ, AAPL) — not the full option string
- pnl: use "P/L Day" when visible; otherwise "P/L Open". Positive = profit, negative = loss. No dollar signs.
- date: YYYY-MM-DD. If no date is shown, use today's date for P/L Day entries.
- side: "long" for calls or long stock; "short" for puts or short positions. Infer from option type (C/P) when visible.
- notes: full contract or position description when visible (option expiry, strike, etc.)
- If multiple positions are in the screenshot table, return one entry per row with its own pnl.
- If nothing trade-related is found, return { "trades": [] }`;

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
      max_tokens: 1024,
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
                detail: 'high',
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
    .filter((t) => t.symbol && typeof t.pnl === 'number')
    .map((t) => ({
      symbol: String(t.symbol).toUpperCase().trim(),
      pnl: Number(t.pnl),
      date: t.date || today,
      side: t.side === 'short' ? 'short' : t.side === 'long' ? 'long' : undefined,
      notes: t.notes?.trim() || undefined,
    }));
}

export async function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}
