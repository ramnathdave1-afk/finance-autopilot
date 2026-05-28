import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-4-6' as const;
export const FAST_MODEL = 'claude-haiku-4-5' as const;

let cached: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');
  cached = new Anthropic({ apiKey });
  return cached;
}

export interface CallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** System prompt — automatically cache-marked when length >= 1024 tokens (~4 KB chars). */
  system?: string;
  user: string | Anthropic.Messages.ContentBlockParam[];
  /** Caller-provided correlation id for token logging. */
  tag?: string;
}

export interface CallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  model: string;
  latencyMs: number;
}

/**
 * Single Claude call with:
 *   - prompt caching on the system block (>= ~1 KB),
 *   - exponential backoff on 429/5xx,
 *   - token usage logged via TOKEN_LOGGER if set.
 */
export async function call(opts: CallOptions): Promise<CallResult> {
  const client = getClaude();
  const model = opts.model ?? DEFAULT_MODEL;
  const start = Date.now();

  const sysBlocks: Anthropic.Messages.TextBlockParam[] = opts.system
    ? [
        {
          type: 'text',
          text: opts.system,
          ...(opts.system.length >= 4096
            ? { cache_control: { type: 'ephemeral' as const } }
            : {}),
        },
      ]
    : [];

  const userContent: Anthropic.Messages.ContentBlockParam[] = Array.isArray(opts.user)
    ? opts.user
    : [{ type: 'text', text: opts.user }];

  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    messages: [{ role: 'user', content: userContent }],
    ...(sysBlocks.length > 0 ? { system: sysBlocks } : {}),
  };

  const res = await withBackoff(() => client.messages.create(params));
  const latencyMs = Date.now() - start;

  const text =
    res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('') ?? '';

  const usage = res.usage;
  const result: CallResult = {
    text,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
    model,
    latencyMs,
  };
  TOKEN_LOGGER?.(result, opts.tag);
  return result;
}

export type TokenLogger = (r: CallResult, tag?: string) => void;
let TOKEN_LOGGER: TokenLogger | null = (r, tag) => {
  // Default: structured log line. Never includes prompt/response bodies.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      kind: 'claude_usage',
      tag: tag ?? null,
      model: r.model,
      in: r.inputTokens,
      out: r.outputTokens,
      cache_read: r.cacheReadTokens,
      cache_create: r.cacheCreateTokens,
      ms: r.latencyMs,
    }),
  );
};

export function setTokenLogger(fn: TokenLogger | null) {
  TOKEN_LOGGER = fn;
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  const max = 4;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < max) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const status = (e as { status?: number })?.status;
      const retryable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retryable) throw e;
      const wait = 250 * 2 ** attempt + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, wait));
      attempt += 1;
    }
  }
  throw lastErr;
}
