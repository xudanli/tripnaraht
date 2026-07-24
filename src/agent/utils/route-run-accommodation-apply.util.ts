import type { AccommodationItemDto } from '../assistants/planning-assistant/dto/v2/shared/accommodation-item.dto';
import { resolveAccommodationDisplayName } from './accommodation-apply-coalesce.util';
import type { AccommodationCardActionDto } from '../assistants/planning-assistant/dto/v2/shared/accommodation-card-action.dto';
import type {
  AccommodationNightGroup,
  HotelRouteRunUiPayload,
  RouteAndRunAccommodationCard,
} from './hotel-mcp-route-run.mapper';

function resolveNightDates(
  card: RouteAndRunAccommodationCard,
  nightGroups?: AccommodationNightGroup[],
): { checkIn?: string; checkOut?: string } {
  if (card.checkIn) {
    return {
      checkIn: card.checkIn.slice(0, 10),
      ...(card.checkOut ? { checkOut: card.checkOut.slice(0, 10) } : {}),
    };
  }
  const nightIndex = card.nightIndex;
  if (nightIndex == null || !nightGroups?.length) return {};
  const group = nightGroups.find((g) => g.night_index === nightIndex);
  if (!group) return {};
  return { checkIn: group.check_in, checkOut: group.check_out };
}

/** 归一化 apply 入参/会话缓存中的入住日期字段（含 snake_case 与 route_and_run 卡片） */
export function normalizeAccommodationForApply(
  raw: AccommodationItemDto & {
    check_in?: string;
    check_out?: string;
    nightIndex?: number;
  },
): AccommodationItemDto & { nightIndex?: number } {
  const checkIn = raw.checkIn ?? raw.check_in;
  const checkOut = raw.checkOut ?? raw.check_out;
  return {
    ...raw,
    ...(checkIn ? { checkIn: checkIn.split('T')[0] } : {}),
    ...(checkOut ? { checkOut: checkOut.split('T')[0] } : {}),
    ...(raw.nightIndex != null ? { nightIndex: raw.nightIndex } : {}),
  };
}

function buildApplyActions(
  accommodationIndex: number,
  card: RouteAndRunAccommodationCard,
  dates: { checkIn?: string; checkOut?: string },
): AccommodationCardActionDto[] {
  const applySnapshot = {
    id: card.id,
    source: card.source,
    name: card.name,
    ...(card.name_en ? { name_en: card.name_en } : {}),
    ...(card.address ? { address: card.address } : {}),
    ...(card.url ? { url: card.url } : {}),
    ...(card.photoUrl ? { photoUrl: card.photoUrl } : {}),
    ...(card.priceLabel ? { priceLabel: card.priceLabel } : {}),
    ...(card.rating != null ? { rating: card.rating } : {}),
    ...(dates.checkIn ? { checkIn: dates.checkIn } : {}),
    ...(dates.checkOut ? { checkOut: dates.checkOut } : {}),
    ...(card.nightIndex != null ? { nightIndex: card.nightIndex } : {}),
    ...(typeof card.listing_lat === 'number' ? { listing_lat: card.listing_lat } : {}),
    ...(typeof card.listing_lng === 'number' ? { listing_lng: card.listing_lng } : {}),
    ...(card.distance_label_zh ? { distance_label_zh: card.distance_label_zh } : {}),
    ...(card.decision_support_zh ? { decision_support_zh: card.decision_support_zh } : {}),
  };
  const actions: AccommodationCardActionDto[] = [
    {
      action: 'add_accommodation_to_itinerary',
      label: 'Add to Trip',
      labelCN: '加入行程',
      params: { accommodationIndex, applySnapshot },
    },
  ];
  if (card.url) {
    actions.unshift({
      action: 'view_accommodation',
      label: 'View',
      labelCN: '查看',
      params: { accommodationIndex, url: card.url },
    });
  }
  return actions;
}

export function enrichRouteRunCardForClientApply(
  card: RouteAndRunAccommodationCard,
  accommodationIndex: number,
  nightGroups?: AccommodationNightGroup[],
): RouteAndRunAccommodationCard {
  const dates = resolveNightDates(card, nightGroups);
  return {
    ...card,
    ...(dates.checkIn ? { checkIn: dates.checkIn } : {}),
    ...(dates.checkOut ? { checkOut: dates.checkOut } : {}),
    actions: buildApplyActions(accommodationIndex, card, dates),
  };
}

/** 为 route_and_run 住宿卡片补齐 checkIn/checkOut 与「加入行程」actions，供 apply 接口使用 */
export function enrichHotelRouteRunUiForClientApply(
  ui: HotelRouteRunUiPayload,
): HotelRouteRunUiPayload {
  const accommodations = ui.accommodations.map((card, i) =>
    enrichRouteRunCardForClientApply(card, i, ui.night_groups),
  );
  const night_groups = ui.night_groups?.map((group) => ({
    ...group,
    cards: group.cards.map((card) => {
      const idx = accommodations.findIndex(
        (a) => a.id === card.id && a.nightIndex === card.nightIndex,
      );
      return idx >= 0 ? accommodations[idx] : enrichRouteRunCardForClientApply(card, idx, ui.night_groups);
    }),
  }));
  return {
    ...ui,
    accommodations,
    ...(night_groups?.length ? { night_groups } : {}),
  };
}

export function mapRouteRunCardToAccommodationItemDto(
  card: RouteAndRunAccommodationCard,
): AccommodationItemDto {
  return {
    id: card.id,
    source: card.source,
    name: resolveAccommodationDisplayName(card),
    ...(card.name_en && card.name_en !== card.name ? { nameEN: card.name_en } : {}),
    ...(card.address ? { address: card.address } : {}),
    ...(card.priceLabel ? { price: card.priceLabel } : {}),
    ...(card.url ? { url: card.url } : {}),
    ...(card.photoUrl ? { photoUrl: card.photoUrl } : {}),
    ...(card.photos?.length ? { photos: card.photos } : {}),
    ...(card.rating != null ? { rating: card.rating } : {}),
    ...(card.checkIn ? { checkIn: card.checkIn } : {}),
    ...(card.checkOut ? { checkOut: card.checkOut } : {}),
    ...(card.anchor_poi_name_zh ? { anchor_poi_name_zh: card.anchor_poi_name_zh } : {}),
    ...(card.distance_label_zh ? { distance_label_zh: card.distance_label_zh } : {}),
    ...(card.decision_support_zh ? { decision_support_zh: card.decision_support_zh } : {}),
    ...(card.distance_to_anchor_km != null ? { distanceKm: card.distance_to_anchor_km } : {}),
    ...(card.listing_lat != null && card.listing_lng != null
      ? { location: { lat: card.listing_lat, lng: card.listing_lng } }
      : {}),
    ...(card.nightIndex != null ? { nightIndex: card.nightIndex } : {}),
    ...(card.actions?.length ? { actions: card.actions } : {}),
  };
}

export function mapHotelRouteRunUiToAccommodationItems(
  ui: HotelRouteRunUiPayload,
): AccommodationItemDto[] {
  const enriched = enrichHotelRouteRunUiForClientApply(ui);
  return enriched.accommodations.map(mapRouteRunCardToAccommodationItemDto);
}
