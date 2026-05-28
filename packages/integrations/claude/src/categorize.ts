import { z } from 'zod';
import { call, FAST_MODEL } from './client';

export interface TxnForCategorize {
  id: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  hint?: string | null;
}

export interface CategorizedTxn {
  id: string;
  category: string;
  confidence: number;
}

/**
 * Canonical category taxonomy. Kept short on purpose — Claude does best with a
 * tight list, and downstream UI charts are easier to render. Tunable post-launch.
 */
export const CATEGORIES = [
  'Groceries',
  'Restaurants',
  'Food Delivery',
  'Coffee',
  'Transportation',
  'Travel',
  'Subscriptions',
  'Entertainment',
  'Shopping',
  'Health',
  'Fitness',
  'Utilities',
  'Rent',
  'Mortgage',
  'Insurance',
  'Personal Care',
  'Gifts & Donations',
  'Education',
  'Childcare',
  'Pets',
  'Income',
  'Transfer',
  'Investment',
  'Cash & ATM',
  'Fees & Interest',
  'Taxes',
  'Business',
  'Other',
] as const;

const SYSTEM_PROMPT = [
  'You categorize US consumer financial transactions.',
  '',
  `Valid categories (use these exact strings, nothing else):`,
  CATEGORIES.map((c) => `- ${c}`).join('\n'),
  '',
  'Rules:',
  '- Pick the single best category for each transaction.',
  '- Confidence is 0.0–1.0; use 0.95+ only when merchant is unambiguous (e.g. Netflix → Subscriptions).',
  '- Positive amount = money out. Negative = income/refund. Income/refunds → "Income".',
  '- "Transfer" only for clear A→B account moves (e.g. Plaid "Transfer" hint, payment to credit card).',
  '- Recurring digital service charges (Netflix, Spotify, ChatGPT, gym apps) → "Subscriptions".',
  '- Coffee shops → "Coffee" (not Restaurants).',
  '- DoorDash/Uber Eats/Grubhub → "Food Delivery".',
  '- Output strictly valid JSON: {"items":[{"id":"...","category":"...","confidence":0.xx}, ...]} — no prose, no markdown fences.',
].join('\n');

const responseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CATEGORIES),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const BATCH_SIZE = 25;

/**
 * Categorize a batch of transactions via Claude Haiku (fast + cheap, matches
 * the throughput we need on the sync path). System prompt is cached.
 */
export async function categorizeBatch(txns: TxnForCategorize[]): Promise<CategorizedTxn[]> {
  const out: CategorizedTxn[] = [];
  for (let i = 0; i < txns.length; i += BATCH_SIZE) {
    const chunk = txns.slice(i, i + BATCH_SIZE);
    const userPayload = JSON.stringify({
      txns: chunk.map((t) => ({
        id: t.id,
        merchant: t.merchant ?? null,
        description: t.description ?? null,
        amount: t.amount,
        plaid_category_hint: t.hint ?? null,
      })),
    });

    const res = await call({
      model: FAST_MODEL,
      system: SYSTEM_PROMPT,
      user: `Categorize these:\n${userPayload}`,
      maxTokens: 1024,
      temperature: 0,
      tag: 'categorize',
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(res.text));
    } catch {
      // On malformed output, skip this chunk rather than poisoning the table.
      continue;
    }
    const safe = responseSchema.safeParse(parsed);
    if (!safe.success) continue;
    out.push(...safe.data.items);
  }
  return out;
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}
