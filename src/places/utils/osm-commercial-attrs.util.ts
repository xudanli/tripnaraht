/**
 * 从 OSM tags / Place.metadata 规范化：营业时间、联系方式、预订、费用说明。
 * 不编造人均花费；无数据时返回 unknown/null。
 */
import { OsmOpeningHoursParser } from '../../common/utils/osm-opening-hours-parser.util';
import type { PlaceMetadata } from '../interfaces/place-metadata.interface';

export type OsmPriceHintKind = 'free' | 'fee' | 'unknown';

export type OsmCommercialAttrs = {
  openingHoursRaw: string | null;
  openingHours?: PlaceMetadata['openingHours'];
  phone: string | null;
  website: string | null;
  email: string | null;
  contact: NonNullable<PlaceMetadata['contact']>;
  /** true/false 仅在 OSM 有明确 reservation 标签时；否则 null */
  reservationRequired: boolean | null;
  feeCharged: boolean | null;
  feeNote: string | null;
  priceHint: { kind: OsmPriceHintKind; label: string } | null;
};

export type CommercialApiProjection = {
  openingHoursText: string | null;
  openStatus: 'open' | 'closed' | 'unknown';
  phone: string | null;
  website: string | null;
  email: string | null;
  requiresReservation: boolean | null;
  feeLabel: string | null;
  priceHint: { kind: OsmPriceHintKind; label: string } | null;
};

function asTagMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

export function extractOsmTagRecord(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const m = metadata as Record<string, unknown>;
  return asTagMap(m.rawTags);
}

function firstTag(tags: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = tags[k]?.trim();
    if (v) return v;
  }
  return null;
}

function parseReservation(raw: string | null): boolean | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (['yes', 'required', 'recommended', 'only', 'members'].includes(v)) return true;
  if (['no', 'none', 'walk-in', 'no_reservation'].includes(v)) return false;
  return null;
}

function parseFee(tags: Record<string, string>): {
  feeCharged: boolean | null;
  feeNote: string | null;
  priceHint: OsmCommercialAttrs['priceHint'];
} {
  const fee = firstTag(tags, ['fee', 'toll', 'entrance']);
  const charge = firstTag(tags, ['charge', 'fee:amount', 'payment:fee']);
  const feeLower = (fee || '').toLowerCase();

  if (feeLower === 'no' || feeLower === 'free' || feeLower === 'none') {
    return {
      feeCharged: false,
      feeNote: charge,
      priceHint: { kind: 'free', label: '免费' },
    };
  }

  if (feeLower === 'yes' || feeLower === 'donation' || Boolean(charge)) {
    const note = charge || (feeLower === 'donation' ? '自愿捐助' : fee) || '收费';
    return {
      feeCharged: true,
      feeNote: note,
      priceHint: { kind: 'fee', label: note === '收费' ? '收费' : `收费 · ${note}` },
    };
  }

  if (fee) {
    return {
      feeCharged: null,
      feeNote: fee,
      priceHint: { kind: 'unknown', label: fee },
    };
  }

  return { feeCharged: null, feeNote: null, priceHint: null };
}

function resolveOpeningHoursRaw(
  tags: Record<string, string>,
  metadata?: Record<string, unknown> | null,
): string | null {
  const fromTags = firstTag(tags, ['opening_hours', 'opening_hours:covid19']);
  if (fromTags) return fromTags;

  if (!metadata) return null;
  const top = metadata.openingHours;
  if (typeof top === 'string' && top.trim()) return top.trim();
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    const osm = (top as Record<string, unknown>).osmFormat;
    if (typeof osm === 'string' && osm.trim()) return osm.trim();
  }
  if (typeof metadata.opening_hours === 'string' && metadata.opening_hours.trim()) {
    return metadata.opening_hours.trim();
  }
  return null;
}

/** 从 OSM tags（可选已有 metadata）规范化商业属性 */
export function normalizeOsmCommercialAttrs(input: {
  tags?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): OsmCommercialAttrs {
  const tags = {
    ...extractOsmTagRecord(input.metadata),
    ...asTagMap(input.tags),
  };
  const openingHoursRaw = resolveOpeningHoursRaw(tags, input.metadata);
  const openingHours = openingHoursRaw
    ? OsmOpeningHoursParser.parse(openingHoursRaw) || {
        osmFormat: openingHoursRaw,
      }
    : undefined;

  const phone = firstTag(tags, ['phone', 'contact:phone', 'contact:mobile']);
  const website = firstTag(tags, ['website', 'contact:website', 'url']);
  const email = firstTag(tags, ['email', 'contact:email']);
  const reservationRequired = parseReservation(
    firstTag(tags, ['reservation', 'reservation:required', 'booking']),
  );
  const fee = parseFee(tags);

  const contact: NonNullable<PlaceMetadata['contact']> = {};
  if (phone) contact.phone = phone;
  if (website) contact.website = website;
  if (email) contact.email = email;

  return {
    openingHoursRaw,
    openingHours,
    phone,
    website,
    email,
    contact,
    reservationRequired,
    feeCharged: fee.feeCharged,
    feeNote: fee.feeNote,
    priceHint: fee.priceHint,
  };
}

/** 合并进 Place.metadata（保留 rawTags / source 等） */
export function mergeCommercialIntoMetadata(
  metadata: Record<string, unknown> | null | undefined,
  attrs: OsmCommercialAttrs,
  opts?: { normalizedAt?: string },
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(metadata || {}) };
  const prevCommercial =
    base.commercial && typeof base.commercial === 'object' && !Array.isArray(base.commercial)
      ? (base.commercial as Record<string, unknown>)
      : {};

  if (attrs.openingHours) base.openingHours = attrs.openingHours;
  else if (attrs.openingHoursRaw) base.openingHours = { osmFormat: attrs.openingHoursRaw };

  if (attrs.phone) base.phone = attrs.phone;
  if (attrs.website) base.website = attrs.website;
  if (attrs.email) base.email = attrs.email;

  const prevContact =
    base.contact && typeof base.contact === 'object' && !Array.isArray(base.contact)
      ? (base.contact as Record<string, unknown>)
      : {};
  base.contact = {
    ...prevContact,
    ...attrs.contact,
  };

  if (attrs.reservationRequired != null) {
    base.reservationRequired = attrs.reservationRequired;
    const constraints =
      base.constraints && typeof base.constraints === 'object' && !Array.isArray(base.constraints)
        ? { ...(base.constraints as Record<string, unknown>) }
        : {};
    const capacity =
      constraints.capacity && typeof constraints.capacity === 'object' && !Array.isArray(constraints.capacity)
        ? { ...(constraints.capacity as Record<string, unknown>) }
        : {};
    if (attrs.reservationRequired === true) {
      capacity.requiresReservation = true;
      constraints.capacity = capacity;
      base.constraints = constraints;
    }
    const planning =
      base.planningProfile && typeof base.planningProfile === 'object' && !Array.isArray(base.planningProfile)
        ? { ...(base.planningProfile as Record<string, unknown>) }
        : {};
    planning.reservationRequired = attrs.reservationRequired;
    base.planningProfile = planning;
  }

  base.commercial = {
    ...prevCommercial,
    source: 'osm',
    normalizedAt: opts?.normalizedAt || new Date().toISOString(),
    feeCharged: attrs.feeCharged,
    feeNote: attrs.feeNote,
    reservationRequired: attrs.reservationRequired,
    priceHint: attrs.priceHint,
    openingHoursRaw: attrs.openingHoursRaw,
  };

  return base;
}

function parseDayMinutesRange(range: string): { open: number; close: number } | null {
  const m = range.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  if (![open, close].every(Number.isFinite)) return null;
  return { open, close };
}

/** 用结构化 weekday 字段粗判 open/closed；无法判断则 unknown */
export function resolveOpenStatusFromHours(
  openingHours: unknown,
  now = new Date(),
): 'open' | 'closed' | 'unknown' {
  if (!openingHours) return 'unknown';
  if (typeof openingHours === 'string') {
    const parsed = OsmOpeningHoursParser.parse(openingHours);
    return resolveOpenStatusFromHours(parsed, now);
  }
  if (typeof openingHours !== 'object' || Array.isArray(openingHours)) return 'unknown';

  const row = openingHours as Record<string, unknown>;
  if (row.isOpen === true || row.openNow === true || row.isOpenNow === true) return 'open';
  if (row.isOpen === false || row.openNow === false || row.isOpenNow === false) return 'closed';

  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const dayKey = keys[now.getDay()];
  const dayVal = typeof row[dayKey] === 'string' ? (row[dayKey] as string) : null;
  const weekday = typeof row.weekday === 'string' ? row.weekday : null;
  const weekend = typeof row.weekend === 'string' ? row.weekend : null;
  const candidate =
    dayVal ||
    (now.getDay() === 0 || now.getDay() === 6 ? weekend : weekday) ||
    null;

  if (!candidate) {
    if (typeof row.osmFormat === 'string' && /24\s*\/\s*7/i.test(row.osmFormat)) return 'open';
    return 'unknown';
  }
  if (/24\s*hours|24\/7/i.test(candidate)) return 'open';
  if (/^off$|^closed$/i.test(candidate.trim())) return 'closed';

  const range = parseDayMinutesRange(candidate);
  if (!range) return 'unknown';
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (range.close < range.open) {
    // overnight
    return minutes >= range.open || minutes < range.close ? 'open' : 'closed';
  }
  return minutes >= range.open && minutes < range.close ? 'open' : 'closed';
}

export function projectCommercialForApi(
  metadata: unknown,
  now = new Date(),
): CommercialApiProjection {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const attrs = normalizeOsmCommercialAttrs({ metadata: m });
  const commercial =
    m.commercial && typeof m.commercial === 'object' && !Array.isArray(m.commercial)
      ? (m.commercial as Record<string, unknown>)
      : {};

  const openingHours = attrs.openingHours || m.openingHours;
  const openingHoursText =
    attrs.openingHoursRaw ||
    (typeof commercial.openingHoursRaw === 'string' ? commercial.openingHoursRaw : null) ||
    (openingHours &&
    typeof openingHours === 'object' &&
    typeof (openingHours as any).osmFormat === 'string'
      ? (openingHours as any).osmFormat
      : typeof openingHours === 'string'
        ? openingHours
        : null);

  const feeLabel =
    attrs.priceHint?.label ||
    (typeof commercial.feeNote === 'string' ? commercial.feeNote : null) ||
    null;

  const requiresReservation =
    attrs.reservationRequired ??
    (typeof m.reservationRequired === 'boolean' ? m.reservationRequired : null) ??
    (typeof commercial.reservationRequired === 'boolean'
      ? commercial.reservationRequired
      : null);

  return {
    openingHoursText,
    openStatus: resolveOpenStatusFromHours(openingHours, now),
    phone: attrs.phone,
    website: attrs.website,
    email: attrs.email,
    requiresReservation,
    feeLabel,
    priceHint: attrs.priceHint,
  };
}
