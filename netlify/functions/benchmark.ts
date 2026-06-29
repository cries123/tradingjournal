import type { Handler } from '@netlify/functions';
import { handleBenchmarkRequest } from '../../server/benchmarkHandler';

export const handler: Handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;

  const result = await handleBenchmarkRequest(symbol);

  return {
    statusCode: result.statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(result.body),
  };
};
