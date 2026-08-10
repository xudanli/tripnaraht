import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlaceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddActivityNearbyCategory,
  AddActivityNearbyItemDto,
  AddActivityNearbyQueryDto,
} from '../dto/add-activity-nearby.dto';
import {
  defaultRadiusForAddActivityCategory,
  extractNearbyCoverImageUrl,
  resolveAddActivityNearbyCategory,
  SQL_HAS_PLACE_IMAGE,
} from '../utils/add-activity-nearby.util';
import { projectCommercialForApi } from '../../places/utils/osm-commercial-attrs.util';
import { resolveCoordsFromLabel } from '../utils/resolve-nearby-poi-origin.util';
import { parseCoordsFromRestNote } from '../../agent/utils/accommodation-place.util';
import { resolveEffectiveIcelandPlaceCoordinates } from '../../places/utils/iceland-canonical-poi-coords.util';
import {
  findIcelandSafeStopsNearby,
  hashSafeStopPoiId,
  labelIcelandSafeStop,
  ICELAND_GAS_SAFE_STOP_KINDS,
  ICELAND_REST_AREA_SAFE_STOP_KINDS,
} from '../../decision-runtime/packs/knowledge/road/find-iceland-safe-stops-nearby.util';
import { loadIcelandParkingNearPoint } from '../../decision-runtime/packs/knowledge/road/load-iceland-parking-near.util';

type PlaceNearbyRow = {
  id: number;
  nameCN: string;
  nameEN: string | null;
  category: PlaceCategory;
  address: string | null;
  rating: number | null;
  metadata: Prisma.JsonValue;
  lat: number;
  lng: number;
  distance_meters: number;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class AddActivityNearbyService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: AddActivityNearbyQueryDto): Promise<AddActivityNearbyItemDto[]> {
    let category: AddActivityNearbyCategory;
    try {
      category = resolveAddActivityNearbyCategory(query);
    } catch (e: any) {
      throw new BadRequestException(e?.message || '无效的 category/chip');
    }

    const origin = await this.resolveOrigin(query);
    const radius =
      query.radius && query.radius > 0 ? query.radius : defaultRadiusForAddActivityCategory(category);
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 30;

    const excludePlaceIds = query.tripId?.trim()
      ? await this.loadScheduledPlaceIds(query.tripId.trim())
      : new Set<number>();

    let items: AddActivityNearbyItemDto[] = [];
    switch (category) {
      case AddActivityNearbyCategory.HOTEL:
        items = await this.searchHotels(origin.lat, origin.lng, radius, limit * 3);
        break;
      case AddActivityNearbyCategory.GAS_STATION:
        items = await this.searchGas(origin.lat, origin.lng, radius, limit * 3);
        break;
      case AddActivityNearbyCategory.SUPERMARKET:
        items = await this.searchSupermarkets(origin.lat, origin.lng, radius, limit * 3);
        break;
      case AddActivityNearbyCategory.INDOOR:
        items = await this.searchIndoor(origin.lat, origin.lng, radius, limit * 3);
        break;
      case AddActivityNearbyCategory.REST_AREA:
        items = await this.searchRestAreas(origin.lat, origin.lng, radius, limit * 3);
        break;
      case AddActivityNearbyCategory.RESTAURANT:
        items = await this.searchByPlaceCategory(
          PlaceCategory.RESTAURANT,
          AddActivityNearbyCategory.RESTAURANT,
          origin.lat,
          origin.lng,
          radius,
          limit * 3,
        );
        break;
      case AddActivityNearbyCategory.ATTRACTION:
      default:
        items = await this.searchAttractions(origin.lat, origin.lng, radius, limit * 3);
        break;
    }

    if (excludePlaceIds.size > 0) {
      items = items.filter((row) => !row.placeId || !excludePlaceIds.has(row.placeId));
    }

    return this.sortImageThenDistance(items).slice(0, limit);
  }

  private sortImageThenDistance(items: AddActivityNearbyItemDto[]): AddActivityNearbyItemDto[] {
    return [...items].sort((a, b) => {
      const img = Number(b.hasImage) - Number(a.hasImage);
      if (img !== 0) return img;
      return a.distanceMeters - b.distanceMeters;
    });
  }

  private mapPlaceRow(
    row: PlaceNearbyRow,
    nearbyCategory: AddActivityNearbyCategory,
  ): AddActivityNearbyItemDto {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const imageUrl = extractNearbyCoverImageUrl(metadata);
    const commercial = projectCommercialForApi(metadata);
    return {
      id: row.id,
      placeId: row.id,
      nearbyCategory,
      nameCN: row.nameCN,
      nameEN: row.nameEN || undefined,
      imageUrl,
      hasImage: Boolean(imageUrl),
      rating: row.rating ?? undefined,
      address: row.address || undefined,
      openingHoursText: commercial.openingHoursText,
      openStatus: commercial.openStatus,
      phone: commercial.phone,
      website: commercial.website,
      requiresReservation: commercial.requiresReservation,
      feeLabel: commercial.feeLabel,
      priceHint: commercial.priceHint,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceMeters: Math.round(Number(row.distance_meters) || 0),
      source: 'place',
      addable: true,
      metadata: {
        ...metadata,
        nearbyCategory,
        placeCategory: row.category,
      },
    };
  }

  private async searchByPlaceCategory(
    placeCategory: PlaceCategory,
    nearbyCategory: AddActivityNearbyCategory,
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND p.category = CAST(${placeCategory} AS "PlaceCategory")
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    return rows.map((r) => this.mapPlaceRow(r, nearbyCategory));
  }

  private async searchHotels(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND p.category = 'HOTEL'::"PlaceCategory"
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        AND UPPER(COALESCE(p.metadata->>'canonicalType', '')) NOT IN ('CAMP_SITE', 'CAMPSITE', 'CAMPING')
        AND COALESCE(p."nameEN",'') !~* '(camp[[:space:]]*site|campsite|camping)'
        AND COALESCE(p."nameCN",'') !~ '(露营地|营地|野营|帐篷营地)'
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    return rows.map((r) => this.mapPlaceRow(r, AddActivityNearbyCategory.HOTEL));
  }

  private async searchGas(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const out: AddActivityNearbyItemDto[] = [];

    const fuelStops = findIcelandSafeStopsNearby({
      lat,
      lng,
      radiusMeters: radius,
      kinds: ICELAND_GAS_SAFE_STOP_KINDS,
    });
    for (const stop of fuelStops) {
      const labels = labelIcelandSafeStop(stop);
      out.push({
        id: hashSafeStopPoiId(stop.poiId),
        nearbyCategory: AddActivityNearbyCategory.GAS_STATION,
        nameCN: labels.nameCN,
        nameEN: labels.nameEN,
        imageUrl: null,
        hasImage: false,
        openingHoursText: null,
        openStatus: 'unknown',
        phone: null,
        website: null,
        requiresReservation: null,
        feeLabel: null,
        priceHint: null,
        lat: stop.lat,
        lng: stop.lng,
        distanceMeters: stop.distanceMeters,
        source: 'safe_stop',
        addable: false,
        metadata: {
          nearbyCategory: AddActivityNearbyCategory.GAS_STATION,
          safeStopPoiId: stop.poiId,
          safeStopKind: stop.kind,
          amenities: stop.amenities,
          source: 'iceland_safe_stop_catalog',
        },
      });
    }

    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND p.category = 'SUPPLY'::"PlaceCategory"
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        AND (
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) LIKE 'FUEL_%'
          OR UPPER(COALESCE(p.metadata->>'canonicalType', '')) = 'EV_CHARGING'
          OR COALESCE(p.metadata->>'source', '') IN ('osm_amenity_fuel', 'iceland_safe_stop_catalog')
          OR COALESCE(p."nameEN",'') ~* '(N1|Orkan|Olis|Ólis|Atlantsol|Gas Station|Fuel|petrol)'
          OR COALESCE(p."nameCN",'') ~ '加油站|加油|充电站'
        )
        AND UPPER(COALESCE(p.metadata->>'canonicalType', '')) NOT LIKE 'SUPERMARKET%'
        AND LOWER(COALESCE(p.metadata->>'shop', p.metadata->'rawTags'->>'shop', ''))
          NOT IN ('supermarket', 'convenience', 'grocery')
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    out.push(...rows.map((r) => this.mapPlaceRow(r, AddActivityNearbyCategory.GAS_STATION)));
    return out;
  }

  private async searchSupermarkets(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND p.category = 'SUPPLY'::"PlaceCategory"
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        AND (
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) LIKE 'SUPERMARKET%'
          OR LOWER(COALESCE(p.metadata->>'shop', p.metadata->'rawTags'->>'shop', '')) = 'supermarket'
          OR UPPER(COALESCE(p.metadata->>'nearbyCategory', '')) = 'SUPERMARKET'
          OR COALESCE(p."nameEN",'') ~* '(Bonus|Bónus|Kronan|Krónan|Netto|Nettó|Hagkaup|Samkaup|Costco|supermarket)'
          OR COALESCE(p."nameCN",'') ~ '超市|Bonus|Bónus|Krónan|Nettó|Hagkaup'
        )
        AND UPPER(COALESCE(p.metadata->>'canonicalType', '')) NOT LIKE 'FUEL_%'
        AND UPPER(COALESCE(p.metadata->>'canonicalType', '')) <> 'CONVENIENCE_STORE'
        AND LOWER(COALESCE(p.metadata->>'shop', p.metadata->'rawTags'->>'shop', '')) <> 'convenience'
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    return rows.map((r) => this.mapPlaceRow(r, AddActivityNearbyCategory.SUPERMARKET));
  }

  private async searchIndoor(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        AND (
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) IN (
            'MUSEUM','GALLERY','SPA_POOL','AQUARIUM','CINEMA','THEATRE','LIBRARY',
            'SWIMMING_POOL','ICE_RINK','SHOPPING'
          )
          OR LOWER(COALESCE(p.metadata->>'tourism', p.metadata->'rawTags'->>'tourism', ''))
            IN ('museum','gallery','aquarium')
          OR LOWER(COALESCE(p.metadata->'rawTags'->>'amenity', ''))
            IN ('arts_centre','cinema','theatre','library','planetarium')
          OR LOWER(COALESCE(p.metadata->'rawTags'->>'leisure', ''))
            IN ('swimming_pool','ice_rink','sauna')
          OR COALESCE(p."nameEN",'') ~* '(museum|gallery|library|aquarium|swimming pool|sundlaug|sundholl|cinema|theatre|harpa|perlan|beer spa)'
          OR COALESCE(p."nameCN",'') ~ '(博物馆|美术馆|图书馆|水族|游泳池|影院|剧院|温泉馆|冰场)'
        )
        AND NOT (
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) IN ('SPORTS_CENTRE','FITNESS_CENTRE','THEME_PARK','ZOO')
          AND COALESCE(p."nameEN",'') !~* '(swimming pool|sundlaug|sundholl|ice rink|spa|laugar)'
          AND COALESCE(p."nameCN",'') !~ '(游泳池|冰场|温泉)'
        )
        AND NOT (
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) ~
            '(WATERFALL|GLACIER|VOLCANO|BEACH|VIEWPOINT|HIKING|HIGHLAND|GEYSER|ARTWORK|CONVENIENCE|SUPERMARKET|FUEL_|CAMP_)'
        )
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    return rows.map((r) => this.mapPlaceRow(r, AddActivityNearbyCategory.INDOOR));
  }

  private async searchRestAreas(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const out: AddActivityNearbyItemDto[] = [];

    const safeStops = findIcelandSafeStopsNearby({
      lat,
      lng,
      radiusMeters: radius,
      kinds: ICELAND_REST_AREA_SAFE_STOP_KINDS,
      includeServiceRestAmenities: false,
    });
    for (const stop of safeStops) {
      const labels = labelIcelandSafeStop(stop);
      out.push({
        id: hashSafeStopPoiId(stop.poiId),
        nearbyCategory: AddActivityNearbyCategory.REST_AREA,
        nameCN: labels.nameCN,
        nameEN: labels.nameEN,
        imageUrl: null,
        hasImage: false,
        openingHoursText: null,
        openStatus: 'unknown',
        phone: null,
        website: null,
        requiresReservation: null,
        feeLabel: null,
        priceHint: null,
        lat: stop.lat,
        lng: stop.lng,
        distanceMeters: stop.distanceMeters,
        source: 'safe_stop',
        addable: false,
        metadata: {
          nearbyCategory: AddActivityNearbyCategory.REST_AREA,
          safeStopPoiId: stop.poiId,
          safeStopKind: stop.kind,
          amenities: stop.amenities,
          source: 'iceland_safe_stop_catalog',
        },
      });
    }

    const parkingRows = await loadIcelandParkingNearPoint(this.prisma, {
      lat,
      lng,
      radiusKm: radius / 1000,
      limit: Math.min(take, 40),
    });
    for (const row of parkingRows) {
      const nameEN = row.nameEN || undefined;
      const nameCN = row.nameCN || row.nameEN || '停车点';
      const anonymous =
        !nameEN ||
        /^(free\s+)?parking$/i.test(nameEN.trim()) ||
        /^(paid\s+)?parking$/i.test(nameEN.trim()) ||
        /^(免费|付费)?停车场$/.test(String(nameCN).trim());
      if (anonymous) continue;
      const distanceMeters = Math.round(haversineMeters(lat, lng, row.lat, row.lng));
      if (distanceMeters > radius) continue;
      out.push({
        id: row.id,
        placeId: row.id,
        nearbyCategory: AddActivityNearbyCategory.REST_AREA,
        nameCN,
        nameEN,
        imageUrl: null,
        hasImage: false,
        openingHoursText: null,
        openStatus: 'unknown',
        phone: null,
        website: null,
        requiresReservation: null,
        feeLabel: null,
        priceHint: null,
        lat: row.lat,
        lng: row.lng,
        distanceMeters,
        source: 'place',
        addable: true,
        metadata: {
          nearbyCategory: AddActivityNearbyCategory.REST_AREA,
          canonicalType: row.canonicalType,
          source: 'iceland_parking_place',
        },
      });
    }

    return out;
  }

  private async searchAttractions(
    lat: number,
    lng: number,
    radius: number,
    take: number,
  ): Promise<AddActivityNearbyItemDto[]> {
    const rows = await this.prisma.$queryRaw<PlaceNearbyRow[]>(Prisma.sql`
      SELECT
        p.id, p."nameCN", p."nameEN", p.category, p.address, p.rating, p.metadata,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_meters
      FROM "Place" p
      WHERE p.location IS NOT NULL
        AND p.category = 'ATTRACTION'::"PlaceCategory"
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        AND COALESCE(p.metadata->>'source', '') NOT LIKE 'osm_%'
        AND COALESCE(p.rating, 0) >= 4
      ORDER BY ${Prisma.raw(SQL_HAS_PLACE_IMAGE)}, distance_meters ASC
      LIMIT ${take}
    `);
    return rows.map((r) => this.mapPlaceRow(r, AddActivityNearbyCategory.ATTRACTION));
  }

  private async loadScheduledPlaceIds(tripId: string): Promise<Set<number>> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { TripDay: { tripId } },
      select: { placeId: true },
    });
    return new Set(
      items.map((i) => i.placeId).filter((id): id is number => typeof id === 'number'),
    );
  }

  private async resolveOrigin(
    query: AddActivityNearbyQueryDto,
  ): Promise<{ lat: number; lng: number }> {
    if (query.itemId?.trim()) {
      const item = await this.prisma.itineraryItem.findUnique({
        where: { id: query.itemId.trim() },
        include: {
          Place: { include: { City: true } },
        },
      });
      if (!item) throw new NotFoundException(`行程项 ${query.itemId} 不存在`);

      if (item.placeId) {
        const row = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
          SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
          FROM "Place" WHERE id = ${item.placeId} AND location IS NOT NULL
          LIMIT 1
        `;
        if (row[0] && Number.isFinite(Number(row[0].lat))) {
          const fixed = resolveEffectiveIcelandPlaceCoordinates({
            id: item.placeId,
            nameCN: item.Place?.nameCN,
            nameEN: item.Place?.nameEN,
            metadata: item.Place?.metadata,
            lat: Number(row[0].lat),
            lng: Number(row[0].lng),
          });
          if (fixed) return { lat: fixed.lat, lng: fixed.lng };
          return { lat: Number(row[0].lat), lng: Number(row[0].lng) };
        }
      }

      const noteCoords = parseCoordsFromRestNote(item.note || '');
      if (noteCoords) return { lat: noteCoords.lat, lng: noteCoords.lng };

      const labelCoords = resolveCoordsFromLabel(
        `${item.note || ''} ${item.Place?.nameCN || ''} ${item.Place?.nameEN || ''}`,
      );
      if (labelCoords) return { lat: labelCoords.lat, lng: labelCoords.lng };

      if (item.tripDayId) {
        const siblings = await this.prisma.itineraryItem.findMany({
          where: { tripDayId: item.tripDayId, placeId: { not: null } },
          select: { placeId: true },
          take: 8,
        });
        for (const sib of siblings) {
          if (!sib.placeId) continue;
          const row = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
            SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
            FROM "Place" WHERE id = ${sib.placeId} AND location IS NOT NULL
            LIMIT 1
          `;
          if (row[0] && Number.isFinite(Number(row[0].lat))) {
            return { lat: Number(row[0].lat), lng: Number(row[0].lng) };
          }
        }
      }
    }

    if (
      query.lat != null &&
      query.lng != null &&
      Number.isFinite(query.lat) &&
      Number.isFinite(query.lng)
    ) {
      return { lat: query.lat, lng: query.lng };
    }

    throw new BadRequestException('必须提供 itemId 或 lat/lng 坐标');
  }
}
