/**
 * Normalize chat POST body utterance across iOS / web field aliases.
 * ValidationPipe may skip undefined `message` (skipUndefinedProperties), so service also calls this.
 */

const TOP_LEVEL_KEYS = [
  'message',
  'text',
  'content',
  'body',
  'prompt',
  'query',
  'user_message',
  'userMessage',
  'utterance',
  'input',
  'msg',
  'question',
] as const;

const NEST_KEYS = ['data', 'payload', 'chat', 'params', 'request'] as const;

function fromContentParts(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string' && item.trim()) {
      parts.push(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const t = row.text ?? row.content ?? row.value;
    if (typeof t === 'string' && t.trim()) parts.push(t.trim());
  }
  return parts.join('\n').trim();
}

function pickStringField(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const direct = obj[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lower && typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return null;
}

export function resolveAgentChatMessageText(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object') return '';

  const obj = input as Record<string, unknown>;

  for (const key of TOP_LEVEL_KEYS) {
    const v = pickStringField(obj, key);
    if (v) return v;
  }

  const fromParts = fromContentParts(obj.content);
  if (fromParts) return fromParts;

  for (const nest of NEST_KEYS) {
    const nested = obj[nest] ?? pickNestedObject(obj, nest);
    if (nested && typeof nested === 'object') {
      const inner = resolveAgentChatMessageText(nested);
      if (inner) return inner;
    }
  }

  return '';
}

function pickNestedObject(
  obj: Record<string, unknown>,
  key: string,
): unknown {
  if (obj[key] && typeof obj[key] === 'object') return obj[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lower && v && typeof v === 'object') return v;
  }
  return undefined;
}

/** Keys present on a plain body — for 400 diagnostics (no values). */
export function listAgentChatBodyKeys(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  return Object.keys(input as object).sort();
}
