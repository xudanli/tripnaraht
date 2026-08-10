import type {
  ConversationActionV1,
  TripFactCardV1,
} from '../conversation-turn-result.types';

export type DataLookupAssembleSource = {
  answer_text?: string;
  consultation_dashboard?: Record<string, unknown> | null;
  day_view?: { date_iso?: string; title_zh?: string; body_zh?: string } | null;
  readiness_summary_zh?: string | null;
  source?: string;
};

/**
 * DATA_LOOKUP / day-view / readiness → trip_fact 卡。
 */
export function adaptTripFactFromDataLookup(
  src: DataLookupAssembleSource,
): { card: TripFactCardV1; actions: ConversationActionV1[] } | null {
  const day = src.day_view;
  if (day && (day.body_zh || day.title_zh)) {
    return {
      card: {
        kind: 'trip_fact',
        title_zh: day.title_zh?.trim() || '当日安排',
        body_zh: day.body_zh?.trim() || String(src.answer_text ?? '').trim() || '暂无明细',
        focus_date_iso: day.date_iso?.slice(0, 10),
        source: src.source ?? 'day_view',
      },
      actions: [],
    };
  }

  const dash = src.consultation_dashboard;
  const heroTitle =
    dash && typeof dash === 'object'
      ? String(
          (dash as { hero?: { title_zh?: string } }).hero?.title_zh ??
            (dash as { title_zh?: string }).title_zh ??
            '',
        ).trim()
      : '';
  const answer = String(src.answer_text ?? '').trim();
  const readiness = String(src.readiness_summary_zh ?? '').trim();

  if (!answer && !heroTitle && !readiness) return null;

  const bullets: string[] = [];
  if (readiness) bullets.push(readiness);
  if (dash && Array.isArray((dash as { summary_cards?: unknown }).summary_cards)) {
    for (const c of (dash as { summary_cards: Array<{ title_zh?: string; body_zh?: string }> })
      .summary_cards) {
      const t = [c.title_zh, c.body_zh].filter(Boolean).join('：');
      if (t) bullets.push(t);
    }
  }

  return {
    card: {
      kind: 'trip_fact',
      title_zh: heroTitle || '行程答问',
      body_zh: answer || readiness || heroTitle,
      bullets_zh: bullets.length ? bullets.slice(0, 8) : undefined,
      source: src.source ?? (dash ? 'consultation' : readiness ? 'readiness' : 'data_lookup'),
    },
    actions: [],
  };
}
