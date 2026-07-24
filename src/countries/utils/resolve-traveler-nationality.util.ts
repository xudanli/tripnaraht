/**
 * Resolve traveler passport nationality (ISO 3166-1 alpha-2) for Context / Readiness.
 */
import { extractAgentMemoryUserBasicsFromPreferences } from '../../agent/memory/utils/agent-memory-user-basics.util';

export function normalizeTravelerNationality(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined;
  const t = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t)) return undefined;
  return t;
}

/** Lightweight hints from natural-language userQuery (fallback only). */
export function parseTravelerNationalityFromUserQuery(query: string): string | undefined {
  if (!query || typeof query !== 'string') return undefined;
  const t = query;

  const labeled = t.match(
    /(?:护照|国籍|passport|citizenship)\s*[:：]?\s*([A-Za-z]{2})\b/i,
  );
  if (labeled?.[1]) {
    return normalizeTravelerNationality(labeled[1]);
  }

  const hints: Array<[RegExp, string]> = [
    [/中国(护照|国籍|公民)|中国公民|持中国护照|我是中国人/i, 'CN'],
    [/美国(护照|国籍|公民)|US\s*passport|American\s+citizen/i, 'US'],
    [/英国(护照|国籍)|UK\s*passport|British\s+citizen/i, 'GB'],
    [/日本(护照|国籍)|Japanese\s+passport/i, 'JP'],
    [/澳大利亚(护照|国籍)|Australian\s+passport/i, 'AU'],
    [/印度(护照|国籍)|Indian\s+passport/i, 'IN'],
    [/加拿大(护照|国籍)|Canadian\s+passport/i, 'CA'],
    [/德国(护照|国籍)|German\s+passport/i, 'DE'],
    [/法国(护照|国籍)|French\s+passport/i, 'FR'],
  ];
  for (const [re, code] of hints) {
    if (re.test(t)) return code;
  }

  return undefined;
}

export interface ResolveTravelerNationalityInput {
  /** Highest priority: caller override */
  explicit?: string;
  /** L0 userBasics from AgentMemoryContext */
  userBasicsNationality?: string;
  /** DSO userIntent.preferences.nationality */
  userIntentPreferences?: unknown;
  /** UserProfile.preferences JSON (Prisma) */
  userProfilePreferences?: unknown;
  /** Last resort: parse user message */
  userQuery?: string;
}

export function resolveTravelerNationality(
  input: ResolveTravelerNationalityInput,
): string | undefined {
  const candidates: unknown[] = [
    input.explicit,
    input.userBasicsNationality,
  ];

  if (input.userIntentPreferences && typeof input.userIntentPreferences === 'object') {
    const p = input.userIntentPreferences as Record<string, unknown>;
    candidates.push(p.nationality);
  }

  const basics = extractAgentMemoryUserBasicsFromPreferences(input.userProfilePreferences);
  if (basics?.nationality) {
    candidates.push(basics.nationality);
  }

  for (const c of candidates) {
    const n = normalizeTravelerNationality(c);
    if (n) return n;
  }

  return parseTravelerNationalityFromUserQuery(input.userQuery ?? '');
}
