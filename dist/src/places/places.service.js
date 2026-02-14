"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PlacesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlacesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const vector_search_service_1 = require("./services/vector-search.service");
const opening_hours_util_1 = require("../common/utils/opening-hours.util");
const crypto_1 = require("crypto");
const amap_poi_service_1 = require("./services/amap-poi.service");
const google_places_service_1 = require("./services/google-places.service");
const physical_metadata_generator_util_1 = require("./utils/physical-metadata-generator.util");
const embedding_service_1 = require("./services/embedding.service");
const place_trail_enrichment_service_1 = require("./services/place-trail-enrichment.service");
const metadata_enricher_util_1 = require("./utils/metadata-enricher.util");
let PlacesService = PlacesService_1 = class PlacesService {
    constructor(prisma, amapPOIService, googlePlacesService, vectorSearchService, embeddingService, trailEnrichmentService) {
        this.prisma = prisma;
        this.amapPOIService = amapPOIService;
        this.googlePlacesService = googlePlacesService;
        this.vectorSearchService = vectorSearchService;
        this.embeddingService = embeddingService;
        this.trailEnrichmentService = trailEnrichmentService;
        this.logger = new common_1.Logger(PlacesService_1.name);
    }
    buildSearchText(place) {
        const parts = [];
        if (place.nameCN)
            parts.push(place.nameCN);
        if (place.nameEN)
            parts.push(place.nameEN);
        if (place.address)
            parts.push(place.address);
        const metadata = place.metadata;
        if (metadata === null || metadata === void 0 ? void 0 : metadata.description)
            parts.push(metadata.description);
        if (metadata === null || metadata === void 0 ? void 0 : metadata.tags) {
            if (Array.isArray(metadata.tags)) {
                parts.push(metadata.tags.join(' '));
            }
        }
        if (metadata === null || metadata === void 0 ? void 0 : metadata.reviews) {
            const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 3) : [];
            reviews.forEach((review) => {
                if (review.text) {
                    parts.push(review.text.substring(0, 100));
                }
            });
        }
        return parts.join(' ');
    }
    async updatePlaceEmbedding(placeId, place) {
        if (!this.embeddingService) {
            this.logger.debug(`EmbeddingService 未注入，跳过更新 embedding`);
            return;
        }
        try {
            const searchText = this.buildSearchText(place);
            if (!searchText || searchText.trim().length === 0) {
                this.logger.debug(`Place ${placeId} 没有可用的文本，跳过 embedding 更新`);
                return;
            }
            const embedding = await this.embeddingService.generateEmbedding(searchText);
            const isZeroVector = embedding.every(v => v === 0);
            if (isZeroVector) {
                this.logger.warn(`Place ${placeId} embedding 生成失败（零向量），跳过更新`);
                return;
            }
            const embeddingStr = `[${embedding.join(',')}]`;
            await this.prisma.$executeRawUnsafe(`UPDATE "Place" SET embedding = $1::vector WHERE id = $2`, embeddingStr, placeId);
            this.logger.debug(`Place ${placeId} embedding 已更新`);
        }
        catch (error) {
            this.logger.warn(`更新 Place ${placeId} embedding 失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
        }
    }
    async createPlace(dto) {
        var _a;
        const { lat, lng, ...rest } = dto;
        const normalizedGooglePlaceId = ((_a = dto.googlePlaceId) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        if (normalizedGooglePlaceId) {
            const existingPlace = await this.prisma.place.findUnique({
                where: { googlePlaceId: normalizedGooglePlaceId },
                select: { id: true, nameCN: true },
            });
            if (existingPlace) {
                throw new common_1.BadRequestException(`Google Place ID "${normalizedGooglePlaceId}" 已存在，对应的地点ID为 ${existingPlace.id} (${existingPlace.nameCN})`);
            }
        }
        const placeData = {
            ...rest,
            googlePlaceId: normalizedGooglePlaceId,
        };
        const enrichedMetadata = dto.metadata
            ? metadata_enricher_util_1.MetadataEnricher.enrich(dto.metadata)
            : undefined;
        const physicalMetadata = physical_metadata_generator_util_1.PhysicalMetadataGenerator.generateByCategory(dto.category, enrichedMetadata);
        const place = await this.prisma.place.create({
            data: {
                ...placeData,
                uuid: (0, crypto_1.randomUUID)(),
                metadata: enrichedMetadata,
                physicalMetadata: physicalMetadata,
                updatedAt: new Date(),
            },
        });
        await this.prisma.$executeRaw `
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      WHERE id = ${place.id}
    `;
        this.updatePlaceEmbedding(place.id, {
            nameCN: place.nameCN,
            nameEN: place.nameEN,
            address: place.address,
            metadata: dto.metadata,
        }).catch(error => {
            this.logger.warn(`创建 Place ${place.id} 后生成 embedding 失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
        });
        return place;
    }
    async findNearby(lat, lng, radius = 2000, category) {
        const categoryFilter = category
            ? client_1.Prisma.sql `AND category = ${category}::"PlaceCategory"`
            : client_1.Prisma.sql ``;
        const rawResults = await this.prisma.$queryRaw `
      SELECT 
        id, 
        "nameCN", 
        "nameEN",
        category,
        metadata,
        address,
        rating,
        -- 使用 PostGIS 计算球面距离 (单位：米)
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters
      FROM "Place"
      WHERE 
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radius}
        )
        ${categoryFilter} -- 注入上面的动态条件
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;
        return rawResults.map((row) => this.mapToDto(row));
    }
    async findNearbyRestaurants(lat, lng, radiusMeters = 1000, paymentMethod) {
        const paymentFilter = paymentMethod
            ? client_1.Prisma.sql `AND metadata->'facilities'->'payment' ? ${paymentMethod}`
            : client_1.Prisma.sql ``;
        const rawResults = await this.prisma.$queryRaw `
      SELECT 
        id, "nameCN", "nameEN", metadata, address, rating,
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters,
        category
      FROM "Place"
      WHERE 
        -- 1. 地理筛选
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radiusMeters}
        )
        AND
        -- 2. 类别筛选
        category = 'RESTAURANT'
        ${paymentFilter}
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;
        return rawResults.map((row) => this.mapToDto(row));
    }
    mapToDto(row) {
        var _a;
        const meta = row.metadata;
        const timezone = (meta === null || meta === void 0 ? void 0 : meta.timezone) || 'Asia/Tokyo';
        const todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(meta, timezone);
        const isOpen = opening_hours_util_1.OpeningHoursUtil.isOpenNow(todayHours, timezone);
        const displayName = row.nameEN || row.nameCN;
        return {
            id: row.id,
            name: displayName,
            nameCN: row.nameCN,
            nameEN: row.nameEN,
            category: row.category,
            distance: Math.round(row.distance_meters),
            address: row.address,
            rating: row.rating,
            isOpen: isOpen,
            tags: ((_a = meta === null || meta === void 0 ? void 0 : meta.facilities) === null || _a === void 0 ? void 0 : _a.payment) || [],
            status: {
                isOpen: isOpen,
                text: isOpen ? '营业中' : '已打烊',
                hoursToday: todayHours || '休息',
            }
        };
    }
    checkIfOpen(openingHours) {
        return true;
    }
    async enrichPlaceFromAmap(placeId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        const place = await this.prisma.place.findUnique({
            where: { id: placeId },
            include: { City: true },
        });
        if (!place) {
            throw new Error(`地点 ${placeId} 不存在`);
        }
        if (place.category !== 'ATTRACTION') {
            throw new Error('此接口仅支持景点（ATTRACTION）类别');
        }
        const location = place.location;
        if (!location) {
            throw new Error('地点缺少坐标信息');
        }
        const coords = this.extractCoordinates(location);
        if (!coords) {
            throw new Error('无法解析坐标信息');
        }
        const poiData = await this.amapPOIService.getPOIDetails(place.nameCN, coords.lat, coords.lng);
        if (!poiData) {
            throw new Error('未从高德地图获取到 POI 信息');
        }
        const currentMetadata = place.metadata || {};
        const updatedMetadata = {
            ...currentMetadata,
            basic: {
                ...currentMetadata.basic,
                openingHours: poiData.openingHours || ((_a = currentMetadata.basic) === null || _a === void 0 ? void 0 : _a.openingHours),
                openingHoursStructured: poiData.openingHoursStructured || ((_b = currentMetadata.basic) === null || _b === void 0 ? void 0 : _b.openingHoursStructured),
                ticketPrice: poiData.ticketPrice || ((_c = currentMetadata.basic) === null || _c === void 0 ? void 0 : _c.ticketPrice),
                ticketPriceStructured: poiData.ticketPriceStructured || ((_d = currentMetadata.basic) === null || _d === void 0 ? void 0 : _d.ticketPriceStructured),
                contact: {
                    ...(_e = currentMetadata.basic) === null || _e === void 0 ? void 0 : _e.contact,
                    phone: poiData.tel || ((_g = (_f = currentMetadata.basic) === null || _f === void 0 ? void 0 : _f.contact) === null || _g === void 0 ? void 0 : _g.phone),
                    email: poiData.email || ((_j = (_h = currentMetadata.basic) === null || _h === void 0 ? void 0 : _h.contact) === null || _j === void 0 ? void 0 : _j.email),
                    website: poiData.website || ((_l = (_k = currentMetadata.basic) === null || _k === void 0 ? void 0 : _k.contact) === null || _l === void 0 ? void 0 : _l.website),
                },
                officialWebsite: poiData.website || ((_m = currentMetadata.basic) === null || _m === void 0 ? void 0 : _m.officialWebsite),
                type: poiData.type || ((_o = currentMetadata.basic) === null || _o === void 0 ? void 0 : _o.type),
            },
            openingHours: poiData.openingHours
                ? this.parseOpeningHours(poiData.openingHours)
                : currentMetadata.openingHours,
            ticketPrice: poiData.ticketPrice || currentMetadata.ticketPrice,
            type: poiData.type || currentMetadata.type,
            highlights: poiData.highlights || currentMetadata.highlights,
            interestDimensions: poiData.interestDimensions || currentMetadata.interestDimensions,
            amapId: poiData.amapId || currentMetadata.amapId,
            contact: {
                ...currentMetadata.contact,
                phone: poiData.tel || ((_p = currentMetadata.contact) === null || _p === void 0 ? void 0 : _p.phone),
                email: poiData.email || ((_q = currentMetadata.contact) === null || _q === void 0 ? void 0 : _q.email),
                website: poiData.website || ((_r = currentMetadata.contact) === null || _r === void 0 ? void 0 : _r.website),
            },
            address: poiData.address || place.address,
            lastEnrichedAt: new Date().toISOString(),
        };
        const textFieldsChanged = (poiData.address && poiData.address !== place.address) ||
            (updatedMetadata.description && updatedMetadata.description !== (currentMetadata === null || currentMetadata === void 0 ? void 0 : currentMetadata.description)) ||
            (updatedMetadata.tags && JSON.stringify(updatedMetadata.tags) !== JSON.stringify(currentMetadata === null || currentMetadata === void 0 ? void 0 : currentMetadata.tags));
        const updated = await this.prisma.place.update({
            where: { id: placeId },
            data: {
                metadata: updatedMetadata,
                address: poiData.address || place.address,
                updatedAt: new Date(),
            },
        });
        if (textFieldsChanged) {
            this.logger.debug(`Place ${placeId} 文本信息已更新，触发 embedding 更新`);
            this.updatePlaceEmbedding(placeId, {
                nameCN: updated.nameCN,
                nameEN: updated.nameEN,
                address: updated.address,
                metadata: updatedMetadata,
            }).catch(error => {
                this.logger.warn(`更新 Place ${placeId} embedding 失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
            });
        }
        return updated;
    }
    async batchEnrichPlacesFromAmap(placeIds, batchSize = 10, delay = 200) {
        const places = placeIds
            ? await this.prisma.place.findMany({
                where: {
                    id: { in: placeIds },
                    category: 'ATTRACTION',
                },
                include: { City: true },
            })
            : await this.prisma.place.findMany({
                where: { category: 'ATTRACTION' },
                include: { City: true },
            });
        const results = [];
        let success = 0;
        let failed = 0;
        for (let i = 0; i < places.length; i += batchSize) {
            const batch = places.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(batch.map(async (place) => {
                try {
                    await this.enrichPlaceFromAmap(place.id);
                    return {
                        placeId: place.id,
                        name: place.nameEN || place.nameCN,
                        status: 'success',
                    };
                }
                catch (error) {
                    return {
                        placeId: place.id,
                        name: place.nameEN || place.nameCN,
                        status: 'failed',
                        error: error.message,
                    };
                }
            }));
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.status === 'success') {
                        success++;
                    }
                    else {
                        failed++;
                    }
                }
                else {
                    failed++;
                }
            }
            if (i + batchSize < places.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return {
            total: places.length,
            success,
            failed,
            results,
        };
    }
    extractCoordinates(location) {
        if (!location)
            return null;
        if (typeof location === 'string') {
            const match = location.match(/POINT\(([^)]+)\)/);
            if (match) {
                const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                return { lat, lng };
            }
        }
        if (typeof location === 'object') {
            if (location.coordinates) {
                return { lng: location.coordinates[0], lat: location.coordinates[1] };
            }
            if (location.lat && location.lng) {
                return { lat: location.lat, lng: location.lng };
            }
        }
        return null;
    }
    parseOpeningHours(businessTime) {
        if (!businessTime)
            return undefined;
        const result = {};
        const weekdayMatch = businessTime.match(/周一至周五[：:]([^；;]+)/);
        const weekendMatch = businessTime.match(/周六[^：:]*[：:]([^；;]+)/);
        if (weekdayMatch) {
            const timeRange = weekdayMatch[1].split(/[（(]/)[0].trim();
            result.weekday = timeRange;
            const [start, end] = timeRange.split(/[-~]/).map(t => t.trim());
            if (start && end) {
                result.mon = `${start}-${end}`;
                result.tue = `${start}-${end}`;
                result.wed = `${start}-${end}`;
                result.thu = `${start}-${end}`;
                result.fri = `${start}-${end}`;
            }
        }
        if (weekendMatch) {
            const timeRange = weekendMatch[1].split(/[（(]/)[0].trim();
            result.weekend = timeRange;
            const [start, end] = timeRange.split(/[-~]/).map(t => t.trim());
            if (start && end) {
                result.sat = `${start}-${end}`;
                result.sun = `${start}-${end}`;
            }
        }
        if (!result.weekday && !result.weekend) {
            result.weekday = businessTime;
        }
        return result;
    }
    async fetchAttractionsFromOverpass(countryCode, tourismTypes) {
        return this.googlePlacesService.fetchAttractionsByCountry(countryCode, tourismTypes);
    }
    async importIcelandAttractionsFromOverpass(tourismTypes, cityId) {
        let icelandCityId = cityId;
        if (!icelandCityId) {
            let city = await this.prisma.city.findFirst({
                where: { countryCode: 'IS' },
            });
            if (!city) {
                city = await this.prisma.city.create({
                    data: {
                        name: 'Iceland',
                        countryCode: 'IS',
                    },
                });
            }
            icelandCityId = city.id;
        }
        const pois = await this.googlePlacesService.fetchAttractionsByCountry('IS', tourismTypes);
        const results = [];
        let created = 0;
        let skipped = 0;
        let errors = 0;
        for (const poi of pois) {
            try {
                const existingByOsmId = await this.prisma.$queryRaw `
          SELECT id FROM "Place"
          WHERE metadata->>'osmId' = ${poi.osmId.toString()}
          LIMIT 1
        `;
                let existing = existingByOsmId.length > 0
                    ? await this.prisma.place.findUnique({ where: { id: existingByOsmId[0].id } })
                    : null;
                if (!existing) {
                    const existingByNameAndLocation = await this.prisma.$queryRaw `
            SELECT id FROM "Place"
            WHERE "nameEN" = ${poi.nameEn || poi.name}
              AND location IS NOT NULL
              AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)::geography,
                100
              )
            LIMIT 1
          `;
                    if (existingByNameAndLocation.length > 0) {
                        existing = await this.prisma.place.findUnique({
                            where: { id: existingByNameAndLocation[0].id }
                        });
                    }
                }
                if (existing) {
                    skipped++;
                    results.push({
                        osmId: poi.osmId,
                        name: poi.name,
                        status: 'skipped',
                    });
                    continue;
                }
                const place = await this.prisma.place.create({
                    data: {
                        uuid: (0, crypto_1.randomUUID)(),
                        nameCN: poi.name,
                        nameEN: poi.nameEn || poi.name,
                        category: 'ATTRACTION',
                        cityId: icelandCityId,
                        address: poi.rawTags['addr:full'] || poi.rawTags.address || undefined,
                        metadata: {
                            osmId: poi.osmId,
                            osmType: poi.osmType,
                            category: poi.category,
                            type: poi.type,
                            rawTags: poi.rawTags,
                            source: 'google_places',
                            importedAt: new Date().toISOString(),
                        },
                        updatedAt: new Date(),
                    },
                });
                await this.prisma.$executeRaw `
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${poi.lng}, ${poi.lat}), 4326)
          WHERE id = ${place.id}
        `;
                created++;
                results.push({
                    osmId: poi.osmId,
                    name: poi.name,
                    status: 'created',
                });
            }
            catch (error) {
                errors++;
                results.push({
                    osmId: poi.osmId,
                    name: poi.name,
                    status: 'error',
                    error: error.message,
                });
            }
        }
        return {
            total: pois.length,
            created,
            skipped,
            errors,
            results,
        };
    }
    async findOne(id) {
        const place = await this.prisma.place.findUnique({
            where: { id },
            include: {
                City: true,
            },
        });
        if (!place) {
            return null;
        }
        let coords = null;
        try {
            const locationResult = await this.prisma.$queryRaw `
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${id} AND location IS NOT NULL
      `;
            if (locationResult.length > 0) {
                coords = {
                    lat: Number(locationResult[0].lat),
                    lng: Number(locationResult[0].lng),
                };
            }
        }
        catch (error) {
            this.logger.warn(`提取地点 ${id} 的坐标失败: ${error.message}`);
            const location = place.location;
            coords = location ? this.extractCoordinates(location) : null;
        }
        const metadata = place.metadata || {};
        let physicalMetadata = place.physicalMetadata || {};
        const city = place.City;
        const timezone = (metadata === null || metadata === void 0 ? void 0 : metadata.timezone) || (city === null || city === void 0 ? void 0 : city.timezone) || 'Asia/Tokyo';
        const todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(metadata, timezone);
        const isOpen = opening_hours_util_1.OpeningHoursUtil.isOpenNow(todayHours, timezone);
        if (this.trailEnrichmentService && (metadata.trailId || metadata.routeId)) {
            try {
                const trailPatch = await this.trailEnrichmentService.enrichFromTrail(metadata);
                if (trailPatch) {
                    physicalMetadata = {
                        ...physicalMetadata,
                        ...trailPatch,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`获取 Trail 数据失败 (placeId: ${place.id}): ${error.message}`);
            }
        }
        return {
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN,
            category: place.category,
            address: place.address,
            rating: place.rating,
            googlePlaceId: place.googlePlaceId,
            description: place.description,
            location: coords ? { lat: coords.lat, lng: coords.lng } : null,
            metadata,
            physicalMetadata,
            city: city ? {
                id: city.id,
                name: city.name,
                nameCN: city.nameCN,
                nameEN: city.nameEN,
                countryCode: city.countryCode,
                timezone: city.timezone,
            } : null,
            countryCode: (city === null || city === void 0 ? void 0 : city.countryCode) || null,
            status: {
                isOpen,
                text: isOpen ? '营业中' : '已打烊',
                hoursToday: todayHours || '休息',
            },
            createdAt: place.createdAt,
            updatedAt: place.updatedAt,
        };
    }
    async findBatch(ids) {
        if (!ids || ids.length === 0) {
            return [];
        }
        const places = await this.prisma.place.findMany({
            where: {
                id: { in: ids },
            },
            include: {
                City: true,
            },
        });
        return places.map(place => {
            const location = place.location;
            const coords = location ? this.extractCoordinates(location) : null;
            const metadata = place.metadata || {};
            const physicalMetadata = place.physicalMetadata || {};
            const city = place.City;
            const timezone = (metadata === null || metadata === void 0 ? void 0 : metadata.timezone) || (city === null || city === void 0 ? void 0 : city.timezone) || 'Asia/Tokyo';
            const todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(metadata, timezone);
            const isOpen = opening_hours_util_1.OpeningHoursUtil.isOpenNow(todayHours, timezone);
            return {
                id: place.id,
                uuid: place.uuid,
                nameCN: place.nameCN,
                nameEN: place.nameEN,
                category: place.category,
                address: place.address,
                rating: place.rating,
                googlePlaceId: place.googlePlaceId,
                location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                metadata,
                physicalMetadata,
                city: city ? {
                    id: city.id,
                    name: city.name,
                    nameCN: city.nameCN,
                    nameEN: city.nameEN,
                    countryCode: city.countryCode,
                    timezone: city.timezone,
                } : null,
                status: {
                    isOpen,
                    text: isOpen ? '营业中' : '已打烊',
                    hoursToday: todayHours || '休息',
                },
                createdAt: place.createdAt,
                updatedAt: place.updatedAt,
            };
        });
    }
    async getRecommendedActivities(countryCode, category, limit = 20) {
        if (!countryCode) {
            throw new common_1.BadRequestException('国家代码不能为空');
        }
        const categoryFilter = category
            ? client_1.Prisma.sql `AND p.category = ${category}::"PlaceCategory"`
            : client_1.Prisma.sql ``;
        const rawResults = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.metadata,
        p.address,
        p.rating,
        p.category,
        0::float as distance_meters
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode.toUpperCase()}
        AND p.rating >= 4.0
        AND p.rating IS NOT NULL
        ${categoryFilter}
      ORDER BY p.rating DESC, p."nameCN" ASC
      LIMIT ${limit}
    `;
        return rawResults.map((row) => this.mapToDto(row));
    }
    async search(query, lat, lng, radius, category, limit = 20, countryCode) {
        const searchCondition = client_1.Prisma.sql `
      (
        p."nameCN" ILIKE ${`%${query}%`} OR
        p."nameEN" ILIKE ${`%${query}%`} OR
        p.address ILIKE ${`%${query}%`} OR
        p.metadata::text ILIKE ${`%${query}%`}
      )
    `;
        const categoryFilter = category
            ? client_1.Prisma.sql `AND p.category = ${category}::"PlaceCategory"`
            : client_1.Prisma.sql ``;
        const countryFilter = countryCode
            ? client_1.Prisma.sql `AND (c."countryCode" = ${countryCode} OR p.metadata->>'countryCode' = ${countryCode})`
            : client_1.Prisma.sql ``;
        const locationFilter = lat && lng && radius
            ? client_1.Prisma.sql `AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
            : client_1.Prisma.sql ``;
        const orderBy = lat && lng
            ? client_1.Prisma.sql `ORDER BY ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
            : client_1.Prisma.sql `ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC`;
        const rawResults = await this.prisma.$queryRaw `
      SELECT 
        p.id, p."nameCN", p."nameEN", p.metadata, p.address, p.rating, p.category,
        ${lat && lng ? client_1.Prisma.sql `ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters` : client_1.Prisma.sql `NULL as distance_meters`}
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      WHERE ${searchCondition}
        ${categoryFilter}
        ${countryFilter}
        ${locationFilter}
      ${orderBy}
      LIMIT ${limit}
    `;
        return rawResults.map((row) => this.mapToDto(row));
    }
    async autocomplete(query, lat, lng, limit = 10, countryCode) {
        const searchCondition = client_1.Prisma.sql `
      (
        p."nameCN" ILIKE ${`%${query}%`} OR
        p."nameEN" ILIKE ${`%${query}%`}
      )
    `;
        const countryFilter = countryCode
            ? client_1.Prisma.sql `AND (c."countryCode" = ${countryCode} OR p.metadata->>'countryCode' = ${countryCode})`
            : client_1.Prisma.sql ``;
        const orderBy = lat && lng
            ? client_1.Prisma.sql `ORDER BY ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) ASC`
            : client_1.Prisma.sql `ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC`;
        const results = await this.prisma.$queryRaw `
      SELECT 
        p.id, p."nameCN", p."nameEN", p.category, p.address
      FROM "Place" p
      LEFT JOIN "City" c ON p."cityId" = c.id
      WHERE ${searchCondition}
        ${countryFilter}
      ${orderBy}
      LIMIT ${limit}
    `;
        return results.map(row => ({
            id: row.id,
            name: row.nameEN || row.nameCN,
            nameCN: row.nameCN,
            nameEN: row.nameEN,
            category: row.category,
            address: row.address,
        }));
    }
    async semanticSearch(query, lat, lng, radius, category, limit = 20, countryCode) {
        if (!this.vectorSearchService) {
            const results = await this.search(query, lat, lng, radius, category, limit, countryCode);
            return results.map((r) => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                matchReasons: ['关键词匹配'],
                vectorScore: 0,
                keywordScore: 1.0,
                finalScore: 1.0,
                distance: r.distance,
            }));
        }
        const results = await this.vectorSearchService.hybridSearch(query, lat, lng, radius, category, limit, countryCode);
        return results.map((r) => ({
            id: r.id,
            nameCN: r.nameCN,
            nameEN: r.nameEN,
            address: r.address,
            category: r.category,
            matchReasons: r.matchReasons,
            vectorScore: r.vectorScore,
            keywordScore: r.keywordScore,
            finalScore: r.finalScore,
            distance: r.distance,
        }));
    }
    async batchSemanticSearch(queries, lat, lng, radius, category, limit = 20) {
        if (!queries || queries.length === 0) {
            return [];
        }
        const searchPromises = queries.map(async (query) => {
            try {
                const results = await this.semanticSearch(query, lat, lng, radius, category, limit);
                return {
                    query,
                    results,
                    total: results.length,
                };
            }
            catch (error) {
                this.logger.error(`批量搜索中查询 "${query}" 失败: ${error.message}`);
                return {
                    query,
                    results: [],
                    total: 0,
                    error: error.message,
                };
            }
        });
        return Promise.all(searchPromises);
    }
    async updatePlace(id, dto) {
        var _a;
        const place = await this.prisma.place.findUnique({
            where: { id },
        });
        if (!place) {
            throw new common_1.NotFoundException(`Place not found: ${id}`);
        }
        const updateData = {};
        if (dto.nameCN !== undefined)
            updateData.nameCN = dto.nameCN;
        if (dto.nameEN !== undefined)
            updateData.nameEN = dto.nameEN;
        if (dto.category !== undefined)
            updateData.category = dto.category;
        if (dto.address !== undefined)
            updateData.address = dto.address;
        if (dto.cityId !== undefined)
            updateData.cityId = dto.cityId;
        if (dto.googlePlaceId !== undefined) {
            const normalizedGooglePlaceId = ((_a = dto.googlePlaceId) === null || _a === void 0 ? void 0 : _a.trim()) || null;
            if (normalizedGooglePlaceId) {
                const existingPlace = await this.prisma.place.findFirst({
                    where: {
                        googlePlaceId: normalizedGooglePlaceId,
                        id: { not: id },
                    },
                });
                if (existingPlace) {
                    throw new common_1.BadRequestException(`Google Place ID "${normalizedGooglePlaceId}" 已被地点 ID ${existingPlace.id} (${existingPlace.nameCN}) 使用`);
                }
            }
            if (place.googlePlaceId === normalizedGooglePlaceId) {
            }
            else {
                updateData.googlePlaceId = normalizedGooglePlaceId;
            }
        }
        if (dto.rating !== undefined)
            updateData.rating = dto.rating;
        if (dto.description !== undefined)
            updateData.description = dto.description;
        if (dto.metadata !== undefined)
            updateData.metadata = dto.metadata;
        if (dto.physicalMetadata !== undefined)
            updateData.physicalMetadata = dto.physicalMetadata;
        const needsEmbeddingUpdate = dto.nameCN !== undefined || dto.nameEN !== undefined || dto.metadata !== undefined;
        let updatedPlace;
        if (Object.keys(updateData).length > 0) {
            updatedPlace = await this.prisma.place.update({
                where: { id },
                data: updateData,
            });
        }
        else {
            updatedPlace = place;
        }
        if (dto.lat !== undefined && dto.lng !== undefined) {
            await this.prisma.$executeRaw `
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
        WHERE id = ${id}
      `;
            updatedPlace = await this.prisma.place.findUnique({
                where: { id },
                include: {
                    City: true,
                },
            });
        }
        if (needsEmbeddingUpdate && this.embeddingService && updatedPlace) {
            this.updatePlaceEmbedding(id, updatedPlace).catch(error => {
                this.logger.warn(`Failed to update embedding for place ${id}: ${error.message}`);
            });
        }
        return this.findOne(id);
    }
    async deletePlace(id) {
        const place = await this.prisma.place.findUnique({
            where: { id },
            include: {
                ItineraryItem: true,
            },
        });
        if (!place) {
            throw new common_1.NotFoundException(`Place not found: ${id}`);
        }
        if (place.ItineraryItem && place.ItineraryItem.length > 0) {
            throw new common_1.BadRequestException(`Cannot delete place: it is being used by ${place.ItineraryItem.length} itinerary item(s)`);
        }
        await this.prisma.place.delete({
            where: { id },
        });
        return { success: true };
    }
    async getPlacesAdmin(params) {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (params.search) {
            const searchTerm = params.search.trim();
            if (searchTerm.length <= 3) {
                where.OR = [
                    { nameCN: { startsWith: searchTerm, mode: 'insensitive' } },
                    { nameEN: { startsWith: searchTerm, mode: 'insensitive' } },
                ];
            }
            else {
                where.OR = [
                    { nameCN: { contains: searchTerm, mode: 'insensitive' } },
                    { nameEN: { contains: searchTerm, mode: 'insensitive' } },
                    { address: { contains: searchTerm, mode: 'insensitive' } },
                ];
            }
        }
        if (params.category) {
            where.category = params.category;
        }
        if (params.cityId) {
            where.cityId = params.cityId;
        }
        if (params.countryCode) {
            where.City = {
                countryCode: params.countryCode.toUpperCase(),
            };
        }
        try {
            const [total, places] = await Promise.all([
                this.prisma.place.count({ where }),
                this.prisma.place.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        City: {
                            select: {
                                id: true,
                                name: true,
                                nameCN: true,
                                nameEN: true,
                                countryCode: true,
                                timezone: true,
                            },
                        },
                    },
                    orderBy: [
                        { createdAt: 'desc' },
                    ],
                }),
            ]);
            const placeIds = places.map(p => p.id);
            const locationMap = new Map();
            if (placeIds.length > 0) {
                try {
                    const locationResults = await this.prisma.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        locationMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}，将使用降级方法`);
                }
            }
            const placeList = places.map(place => {
                let coords = locationMap.get(place.id) || null;
                if (!coords) {
                    const location = place.location;
                    coords = location ? this.extractCoordinates(location) : null;
                }
                const metadata = place.metadata || {};
                const physicalMetadata = place.physicalMetadata || {};
                const city = place.City;
                return {
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    address: place.address,
                    rating: place.rating,
                    googlePlaceId: place.googlePlaceId,
                    description: place.description,
                    location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                    metadata,
                    physicalMetadata,
                    city: city ? {
                        id: city.id,
                        name: city.name,
                        nameCN: city.nameCN,
                        nameEN: city.nameEN,
                        countryCode: city.countryCode,
                        timezone: city.timezone,
                    } : null,
                    countryCode: (city === null || city === void 0 ? void 0 : city.countryCode) || null,
                    createdAt: place.createdAt,
                    updatedAt: place.updatedAt,
                };
            });
            const totalPages = Math.ceil(total / limit);
            return {
                places: placeList,
                total,
                page,
                limit,
                totalPages,
            };
        }
        catch (error) {
            this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getPlacesList(params) {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (params.category) {
            where.category = params.category;
        }
        if (params.cityId) {
            where.cityId = params.cityId;
        }
        const orderBy = {};
        const orderField = params.orderBy || 'id';
        const orderDir = params.orderDirection || 'desc';
        orderBy[orderField] = orderDir;
        try {
            const [total, places] = await Promise.all([
                this.prisma.place.count({ where }),
                this.prisma.place.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy,
                    include: {
                        City: {
                            select: {
                                id: true,
                                name: true,
                                nameCN: true,
                                nameEN: true,
                                countryCode: true,
                                timezone: true,
                            },
                        },
                    },
                }),
            ]);
            const placeIds = places.map(p => p.id);
            const locationMap = new Map();
            if (placeIds.length > 0) {
                try {
                    const locationResults = await this.prisma.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        locationMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`);
                }
            }
            const placeList = places.map(place => {
                let coords = locationMap.get(place.id) || null;
                if (!coords) {
                    const location = place.location;
                    coords = location ? this.extractCoordinates(location) : null;
                }
                const metadata = place.metadata || {};
                const physicalMetadata = place.physicalMetadata || {};
                const city = place.City;
                return {
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    address: place.address,
                    rating: place.rating,
                    googlePlaceId: place.googlePlaceId,
                    description: place.description,
                    location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                    metadata,
                    physicalMetadata,
                    city: city ? {
                        id: city.id,
                        name: city.name,
                        nameCN: city.nameCN,
                        nameEN: city.nameEN,
                        countryCode: city.countryCode,
                        timezone: city.timezone,
                    } : null,
                    countryCode: (city === null || city === void 0 ? void 0 : city.countryCode) || null,
                    createdAt: place.createdAt,
                    updatedAt: place.updatedAt,
                };
            });
            const totalPages = Math.ceil(total / limit);
            return {
                places: placeList,
                page,
                limit,
                total,
                totalPages,
                hasPrev: page > 1,
                hasNext: page < totalPages,
            };
        }
        catch (error) {
            this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getPlacesByCountryCode(params) {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 50, 100);
        const skip = (page - 1) * limit;
        const where = {};
        const countryFilter = {
            OR: [
                { City: { countryCode: params.countryCode } },
                { metadata: { path: ['countryCode'], equals: params.countryCode } },
            ],
        };
        if (params.category) {
            where.category = params.category;
        }
        if (params.search) {
            where.AND = [
                countryFilter,
                {
                    OR: [
                        { nameCN: { contains: params.search, mode: 'insensitive' } },
                        { nameEN: { contains: params.search, mode: 'insensitive' } },
                        { address: { contains: params.search, mode: 'insensitive' } },
                    ],
                },
            ];
        }
        else {
            where.AND = [countryFilter];
        }
        try {
            const [total, places] = await Promise.all([
                this.prisma.place.count({ where }),
                this.prisma.place.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { rating: 'desc' },
                    include: {
                        City: {
                            select: {
                                id: true,
                                name: true,
                                nameCN: true,
                                nameEN: true,
                                countryCode: true,
                                timezone: true,
                            },
                        },
                    },
                }),
            ]);
            const placeIds = places.map(p => p.id);
            const locationMap = new Map();
            if (placeIds.length > 0) {
                try {
                    const locationResults = await this.prisma.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        locationMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`);
                }
            }
            const placeList = places.map(place => {
                let coords = locationMap.get(place.id) || null;
                if (!coords) {
                    const location = place.location;
                    coords = location ? this.extractCoordinates(location) : null;
                }
                const city = place.City;
                return {
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    rating: place.rating,
                    location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                    city: city ? {
                        id: city.id,
                        name: city.name,
                        countryCode: city.countryCode,
                    } : null,
                };
            });
            return {
                places: placeList,
                total,
                page,
                limit,
            };
        }
        catch (error) {
            this.logger.error(`按国家代码查询POI失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getPlacesByIds(ids) {
        if (!ids || ids.length === 0) {
            return [];
        }
        try {
            const places = await this.prisma.place.findMany({
                where: {
                    id: { in: ids },
                },
                include: {
                    City: {
                        select: {
                            id: true,
                            name: true,
                            nameCN: true,
                            nameEN: true,
                            countryCode: true,
                            timezone: true,
                        },
                    },
                },
            });
            const placeIds = places.map(p => p.id);
            const locationMap = new Map();
            if (placeIds.length > 0) {
                try {
                    const locationResults = await this.prisma.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        locationMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`);
                }
            }
            return places.map(place => {
                let coords = locationMap.get(place.id) || null;
                if (!coords) {
                    const location = place.location;
                    coords = location ? this.extractCoordinates(location) : null;
                }
                const metadata = place.metadata || {};
                const city = place.City;
                return {
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    rating: place.rating,
                    address: place.address,
                    description: place.description,
                    location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                    metadata,
                    city: city ? {
                        id: city.id,
                        name: city.name,
                        countryCode: city.countryCode,
                    } : null,
                };
            });
        }
        catch (error) {
            this.logger.error(`批量获取POI详情失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlacesService = PlacesService;
exports.PlacesService = PlacesService = PlacesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)(vector_search_service_1.VectorSearchService)),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)(embedding_service_1.EmbeddingService)),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        amap_poi_service_1.AmapPOIService,
        google_places_service_1.GooglePlacesService,
        vector_search_service_1.VectorSearchService,
        embedding_service_1.EmbeddingService,
        place_trail_enrichment_service_1.PlaceTrailEnrichmentService])
], PlacesService);
//# sourceMappingURL=places.service.js.map