/** Parse impact time windows from environment event descriptions (e.g. 11:00—18:00). */

export interface ParsedImpactWindow {
  impactStartAt?: string;
  impactEndAt?: string;
}

const TIME_RANGE_RE =
  /(\d{1,2}:\d{2})\s*[—\-–~至到]\s*(\d{1,2}:\d{2})/u;

const AFTER_TIME_RE = /(\d{1,2}:\d{2})\s*后/u;

export function parseImpactWindowFromDescription(
  description: string,
  referenceDate?: string,
): ParsedImpactWindow {
  const date = referenceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const range = TIME_RANGE_RE.exec(description);
  if (range) {
    return {
      impactStartAt: toIso(date, range[1]!),
      impactEndAt: toIso(date, range[2]!),
    };
  }
  const after = AFTER_TIME_RE.exec(description);
  if (after) {
    return { impactStartAt: toIso(date, after[1]!) };
  }
  return {};
}

function toIso(date: string, time: string): string | undefined {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(h)}:${pad(m)}:00.000Z`;
}
