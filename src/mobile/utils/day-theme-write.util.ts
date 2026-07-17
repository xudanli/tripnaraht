/** Max display length for day theme / label (trimmed). */
export const DAY_THEME_MAX_LENGTH = 40;

export type NormalizedDayThemeValue = string | null;

/**
 * Normalize theme write input.
 * - empty string → validation error (caller)
 * - null / clearTheme → null (clear)
 * - string → trimmed, length-checked
 */
export function normalizeThemeWriteInput(input: {
  theme?: string | null;
  clearTheme?: boolean;
}): { ok: true; value: NormalizedDayThemeValue } | { ok: false; code: string; message: string } {
  if (input.clearTheme === true || input.theme === null) {
    return { ok: true, value: null };
  }
  if (input.theme === undefined) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'theme 必填；清空请传 theme: null 或 clearTheme: true',
    };
  }
  if (typeof input.theme !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'theme 必须是字符串或 null' };
  }
  const trimmed = input.theme.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'theme 不能为空串；清空请传 theme: null 或 clearTheme: true',
    };
  }
  if (trimmed.length > DAY_THEME_MAX_LENGTH) {
    return {
      ok: false,
      code: 'THEME_TOO_LONG',
      message: `theme 最长 ${DAY_THEME_MAX_LENGTH} 字`,
    };
  }
  return { ok: true, value: trimmed };
}

export function normalizeLabelWriteInput(
  label: string | null | undefined,
): { ok: true; value: NormalizedDayThemeValue | undefined } | { ok: false; code: string; message: string } {
  if (label === undefined) return { ok: true, value: undefined };
  if (label === null) return { ok: true, value: null };
  if (typeof label !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'label 必须是字符串或 null' };
  }
  const trimmed = label.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > DAY_THEME_MAX_LENGTH) {
    return {
      ok: false,
      code: 'THEME_TOO_LONG',
      message: `label 最长 ${DAY_THEME_MAX_LENGTH} 字`,
    };
  }
  return { ok: true, value: trimmed };
}

export function readDayThemeMap(metadata: unknown): Record<string, string> {
  return readStringKeyedMap(metadata, 'dayThemes');
}

export function readDayLabelMap(metadata: unknown): Record<string, string> {
  return readStringKeyedMap(metadata, 'dayLabels');
}

function readStringKeyedMap(metadata: unknown, key: string): Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const raw = (metadata as Record<string, unknown>)[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[String(k)] = v.trim();
  }
  return out;
}

/** Apply theme/label mutation onto metadata maps (1-based dayIndex keys as strings). */
export function applyDayThemeMutation(
  metadata: Record<string, unknown>,
  dayIndex: number,
  theme: NormalizedDayThemeValue | undefined,
  label: NormalizedDayThemeValue | undefined,
  source?: string,
): Record<string, unknown> {
  const next = { ...metadata };
  const themes = { ...readDayThemeMap(metadata) };
  const labels = { ...readDayLabelMap(metadata) };
  const key = String(dayIndex);

  if (theme !== undefined) {
    if (theme === null) delete themes[key];
    else themes[key] = theme;
  }
  if (label !== undefined) {
    if (label === null) delete labels[key];
    else labels[key] = label;
  }

  next.dayThemes = themes;
  next.dayLabels = labels;

  if (source) {
    const sources =
      next.dayThemeSources &&
      typeof next.dayThemeSources === 'object' &&
      !Array.isArray(next.dayThemeSources)
        ? { ...(next.dayThemeSources as Record<string, string>) }
        : {};
    sources[key] = source;
    next.dayThemeSources = sources;
  }

  return next;
}

export function lookupDayTheme(
  map: Record<string, string>,
  dayNumber1Based: number,
): string | null {
  const v = map[String(dayNumber1Based)] ?? map[dayNumber1Based as unknown as string];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
