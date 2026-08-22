import { logger } from '../lib/logger';

export interface FailureContext {
  error: string;
  attempts: number;
  handler: string;
  recentErrors?: string[];
}

const PATTERNS: [RegExp, string][] = [
  [/timeout|ETIMEDOUT/i, 'Timed out. Check handler timeout or downstream latency.'],
  [/ECONNREFUSED/i, 'Connection refused. Target host/port probably down.'],
  [/ENOTFOUND|getaddrinfo/i, 'DNS failed. Bad hostname in payload URL.'],
  [/rate.?limit|429/i, 'Hit a rate limit. Back off or lower queue throughput.'],
  [/validation|invalid|required/i, 'Bad payload. Missing or invalid fields.'],
  [/unauthorized|401|403/i, 'Auth error. Token or credentials in payload may be stale.'],
  [/ENOMEM|out of memory/i, 'Ran out of memory. Smaller batch or lower concurrency.'],
  [/Intentional failure|random_fail/i, 'Test handler set to fail on purpose.'],
];

export function generateHeuristicSummary(ctx: FailureContext): string {
  const lines: string[] = [];

  for (const [pattern, hint] of PATTERNS) {
    if (pattern.test(ctx.error)) {
      lines.push(hint);
      break;
    }
  }

  if (lines.length === 0) {
    lines.push(`Handler "${ctx.handler}" failed ${ctx.attempts} times. No obvious pattern.`);
  }

  if (ctx.recentErrors && ctx.recentErrors.length > 1) {
    const unique = [...new Set(ctx.recentErrors)];
    if (unique.length === 1) {
      lines.push(`Same error every attempt (${ctx.attempts}x). Probably not transient.`);
    } else {
      lines.push('Errors changed between attempts. Might be flaky infra.');
    }
  }

  lines.push(`Failed after ${ctx.attempts} attempt(s). Last: ${ctx.error.slice(0, 180)}`);

  return lines.join(' ');
}

async function generateAiSummary(ctx: FailureContext): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const recent = ctx.recentErrors?.length
    ? `Recent errors: ${ctx.recentErrors.join(' | ')}`
    : '';

  const prompt = [
    'You analyze failed background jobs for an ops dashboard.',
    'Write 2-3 short sentences: likely root cause, whether it looks transient or permanent, and one actionable fix.',
    'Be specific and plain. No markdown.',
    `Handler: ${ctx.handler}`,
    `Attempts: ${ctx.attempts}`,
    `Last error: ${ctx.error}`,
    recent,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'You are a concise SRE assistant summarizing job failures.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(parseInt(process.env.OPENAI_TIMEOUT_MS || '8000', 10)),
    });

    if (!res.ok) {
      logger.warn('AI failure summary request failed', { status: res.status });
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    logger.warn('AI failure summary error', { error: (err as Error).message });
    return null;
  }
}

export async function generateFailureSummary(ctx: FailureContext): Promise<string> {
  const ai = await generateAiSummary(ctx);
  if (ai) return ai;
  return generateHeuristicSummary(ctx);
}
