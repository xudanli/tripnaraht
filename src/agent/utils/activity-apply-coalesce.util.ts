import type { ActivityItemDto } from '../assistants/planning-assistant/dto/v2/shared/activity-item.dto';

type LooseActivity = Partial<ActivityItemDto> & {
  nameCN?: string;
  nameEN?: string;
  title?: string;
  price?: string;
  webUrl?: string;
  dayNumber?: number;
};

function pickNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function resolveActivityDisplayName(raw: LooseActivity | ActivityItemDto | Record<string, unknown>): string {
  const card = raw as LooseActivity;
  return (
    pickNonEmptyString(card.name, card.nameZh, card.nameCN, card.nameEn, card.nameEN, card.title) ??
    'Activity'
  );
}

/** 从 chat 卡片 / apply 请求体合并出 ActivityItemDto */
export function coalesceActivityForApply(
  primary?: LooseActivity | ActivityItemDto | Record<string, unknown> | null,
  fallback?: LooseActivity | ActivityItemDto | Record<string, unknown> | null,
): ActivityItemDto {
  const raw: LooseActivity = {
    ...(fallback ?? {}),
    ...(primary ?? {}),
  } as LooseActivity;
  const name = resolveActivityDisplayName(raw);
  const id = String(raw.id ?? '').trim();
  const source =
    raw.source === 'fliggy' || raw.source === 'catalog' || raw.source === 'unknown'
      ? raw.source
      : String(raw.bookingProvider ?? '') === 'fliggy'
        ? 'fliggy'
        : 'unknown';
  const url = pickNonEmptyString(raw.url, raw.webUrl);
  const priceLabel = pickNonEmptyString(raw.priceLabel, raw.price);
  const dayNumber =
    typeof raw.associatedDayNumber === 'number'
      ? raw.associatedDayNumber
      : typeof raw.dayNumber === 'number'
        ? raw.dayNumber
        : undefined;
  const otaRef =
    raw.otaRef?.provider && pickNonEmptyString(raw.otaRef.externalId)
      ? {
          provider: raw.otaRef.provider,
          externalId: pickNonEmptyString(raw.otaRef.externalId)!,
        }
      : source === 'fliggy' && id
        ? { provider: 'fliggy' as const, externalId: id }
        : undefined;

  return {
    id,
    source,
    name,
    ...(pickNonEmptyString(raw.nameZh, raw.nameCN) ? { nameZh: pickNonEmptyString(raw.nameZh, raw.nameCN) } : {}),
    ...(pickNonEmptyString(raw.nameEn, raw.nameEN) ? { nameEn: pickNonEmptyString(raw.nameEn, raw.nameEN) } : {}),
    ...(raw.category === 'ATTRACTION_TICKET' || raw.category === 'SPECIAL_EXPERIENCE'
      ? { category: raw.category }
      : {}),
    ...(pickNonEmptyString(raw.address) ? { address: pickNonEmptyString(raw.address) } : {}),
    ...(url ? { url } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(dayNumber != null ? { associatedDayNumber: dayNumber } : {}),
    ...(pickNonEmptyString(raw.date) ? { date: pickNonEmptyString(raw.date)!.slice(0, 10) } : {}),
    ...(otaRef ? { otaRef } : {}),
    ...(pickNonEmptyString(raw.bookingProvider) ? { bookingProvider: pickNonEmptyString(raw.bookingProvider) } : {}),
    ...(typeof raw.listing_lat === 'number' ? { listing_lat: raw.listing_lat } : {}),
    ...(typeof raw.listing_lng === 'number' ? { listing_lng: raw.listing_lng } : {}),
    ...(pickNonEmptyString(raw.reasonZh) ? { reasonZh: pickNonEmptyString(raw.reasonZh) } : {}),
  };
}
