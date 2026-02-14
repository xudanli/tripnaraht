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
var EntityResolutionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityResolutionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const vector_search_service_1 = require("./vector-search.service");
const admin_division_service_1 = require("./admin-division.service");
const amap_poi_service_1 = require("./amap-poi.service");
const google_places_service_1 = require("./google-places.service");
const places_service_1 = require("../places.service");
let EntityResolutionService = EntityResolutionService_1 = class EntityResolutionService {
    constructor(prisma, vectorSearchService, adminDivisionService, amapPOIService, googlePlacesService, placesService) {
        this.prisma = prisma;
        this.vectorSearchService = vectorSearchService;
        this.adminDivisionService = adminDivisionService;
        this.amapPOIService = amapPOIService;
        this.googlePlacesService = googlePlacesService;
        this.placesService = placesService;
        this.logger = new common_1.Logger(EntityResolutionService_1.name);
        this.LOW_SCORE_THRESHOLD = 0.45;
        this.mustHavePoiTokens = new Map([
            ['西湖', ['西湖']],
            ['十里红妆', ['十里', '红妆']],
        ]);
    }
    async resolveEntities(query, mustHavePois = [], lat, lng, limit = 10) {
        this.logger.debug(`[resolveEntities] 开始解析实体，query: "${query}", mustHavePois: [${mustHavePois.join(', ')}]`);
        const results = [];
        const foundPoiNames = new Set();
        const missingPois = [];
        const extracted = this.extractStructuredEntities(query, mustHavePois);
        this.logger.debug(`[resolveEntities] 结构化抽取结果: ${JSON.stringify(extracted, null, 2)}`);
        for (const poiQuery of mustHavePois) {
            const poiResult = await this.resolveMustHavePoi(poiQuery, extracted, lat, lng);
            if (poiResult) {
                if (poiResult.category === 'HOTEL') {
                    this.logger.warn(`[resolveEntities] must-have POI "${poiQuery}" 仅匹配到HOTEL，强制继续召回ATTRACTION类别`);
                    const attractionResult = await this.resolveMustHavePoiWithCategory(poiQuery, extracted, lat, lng, ['ATTRACTION', 'SCENIC', 'PARK', 'MUSEUM', 'CULTURAL_SITE', 'HISTORICAL_SITE', 'NATURE_SITE']);
                    if (attractionResult) {
                        results.push(attractionResult);
                        foundPoiNames.add(poiQuery);
                    }
                    else {
                        results.push(poiResult);
                        missingPois.push(poiQuery);
                    }
                }
                else {
                    results.push(poiResult);
                    foundPoiNames.add(poiQuery);
                }
            }
            else {
                missingPois.push(poiQuery);
            }
        }
        if (results.length < limit) {
            const vectorResults = await this.vectorSearchWithCityScope(query, extracted.cities, lat, lng, limit - results.length);
            const filteredVectorResults = vectorResults.filter(r => r.score >= this.LOW_SCORE_THRESHOLD);
            const mustHaveMatches = new Map();
            const hotelMatches = new Map();
            const otherResults = [];
            for (const result of filteredVectorResults) {
                let matchedPoiQuery = null;
                for (const poiQuery of mustHavePois) {
                    if (this.matchesMustHavePoi(result, poiQuery)) {
                        matchedPoiQuery = poiQuery;
                        if (result.category === 'HOTEL') {
                            if (!hotelMatches.has(poiQuery) || result.score > hotelMatches.get(poiQuery).score) {
                                hotelMatches.set(poiQuery, result);
                            }
                        }
                        else {
                            if (!mustHaveMatches.has(poiQuery) || result.score > mustHaveMatches.get(poiQuery).score) {
                                mustHaveMatches.set(poiQuery, result);
                            }
                        }
                        break;
                    }
                }
                if (!matchedPoiQuery && result.score >= 0.5) {
                    otherResults.push(result);
                }
            }
            for (const poiQuery of mustHavePois) {
                const nonHotelMatch = mustHaveMatches.get(poiQuery);
                if (nonHotelMatch) {
                    results.push(nonHotelMatch);
                    foundPoiNames.add(poiQuery);
                    const idx = missingPois.indexOf(poiQuery);
                    if (idx >= 0) {
                        missingPois.splice(idx, 1);
                    }
                    this.logger.debug(`[resolveEntities] must-have POI "${poiQuery}" 匹配到非HOTEL类别: ${nonHotelMatch.category}`);
                }
                else {
                    const hotelMatch = hotelMatches.get(poiQuery);
                    if (hotelMatch) {
                        this.logger.warn(`[resolveEntities] must-have POI "${poiQuery}" 仅匹配到HOTEL，标记为缺失以触发进一步搜索`);
                    }
                }
            }
            results.push(...otherResults);
        }
        const needsClarification = [];
        for (const missingPoi of missingPois) {
            const externalResult = await this.tryExternalGeocoding(missingPoi, extracted, lat, lng);
            if (externalResult) {
                if (externalResult.id === 0 && this.placesService) {
                    try {
                        let cityId = null;
                        const cityHint = this.adminDivisionService.mapPoiAliasToCity(missingPoi);
                        const cityName = cityHint || extracted.cities[0];
                        if (cityName) {
                            const matchingCities = await this.prisma.$queryRaw `
                SELECT id, "nameCN", name FROM "City" 
                WHERE "nameCN" = ${cityName} 
                   OR "nameCN" LIKE ${`%${cityName}%`}
                   OR name = ${cityName}
                   OR name LIKE ${`%${cityName}%`}
                LIMIT 1
              `;
                            if (matchingCities.length > 0) {
                                cityId = matchingCities[0].id;
                                this.logger.debug(`[resolveEntities] 找到城市: ${cityName} -> cityId: ${cityId}`);
                            }
                        }
                        const createdPlace = await this.placesService.createPlace({
                            nameCN: externalResult.nameCN || externalResult.name,
                            nameEN: externalResult.nameEN || undefined,
                            category: externalResult.category,
                            lat: externalResult.lat,
                            lng: externalResult.lng,
                            address: externalResult.address || undefined,
                            cityId: cityId || 0,
                            metadata: {
                                ...externalResult.metadata,
                                source: 'external_geocoding',
                                createdAt: new Date().toISOString(),
                            },
                        });
                        externalResult.id = createdPlace.id;
                        this.logger.debug(`[resolveEntities] 自动创建 Place: ${missingPoi} -> ID: ${createdPlace.id}`);
                    }
                    catch (error) {
                        this.logger.warn(`[resolveEntities] 自动创建 Place 失败: ${missingPoi} - ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                }
                results.push(externalResult);
                const idx = missingPois.indexOf(missingPoi);
                if (idx >= 0) {
                    missingPois.splice(idx, 1);
                }
            }
            else {
                const clarificationOptions = this.generateClarificationOptions(missingPoi);
                needsClarification.push({
                    poi: missingPoi,
                    options: clarificationOptions,
                });
            }
        }
        results.sort((a, b) => {
            const aIsMustHave = mustHavePois.some(p => this.matchesMustHavePoi(a, p));
            const bIsMustHave = mustHavePois.some(p => this.matchesMustHavePoi(b, p));
            if (aIsMustHave && !bIsMustHave)
                return -1;
            if (!aIsMustHave && bIsMustHave)
                return 1;
            return b.score - a.score;
        });
        this.logger.debug(`[resolveEntities] 解析完成，找到 ${results.length} 个结果，缺失 ${missingPois.length} 个POI`);
        return {
            results: results.slice(0, limit),
            missingPois,
            needsClarification,
        };
    }
    extractStructuredEntities(query, mustHavePois = []) {
        const cities = [];
        const counties = [];
        const pois = [];
        const cityPattern = /(?:北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|宁波|温州|台州|嘉兴|湖州|绍兴|金华|衢州|舟山|丽水)/g;
        let match;
        while ((match = cityPattern.exec(query)) !== null) {
            cities.push(match[0]);
        }
        const countyPattern = /([^\s，,。.!！？?和以及还有跟与省市县区]{1,10})(?:县|区)/g;
        while ((match = countyPattern.exec(query)) !== null) {
            counties.push(match[0]);
        }
        const countyNamePattern = /(?:宁海|象山|余姚|慈溪|奉化|临安|建德|富阳|桐庐|淳安)/g;
        while ((match = countyNamePattern.exec(query)) !== null) {
            if (!cities.includes(match[0]) && !counties.includes(match[0])) {
                counties.push(match[0]);
            }
        }
        for (const mustHavePoi of mustHavePois) {
            let poiName = mustHavePoi;
            for (const city of cities) {
                if (poiName.startsWith(city)) {
                    poiName = poiName.substring(city.length);
                    break;
                }
            }
            for (const county of counties) {
                if (poiName.startsWith(county)) {
                    poiName = poiName.substring(county.length);
                    break;
                }
            }
            if (poiName.length >= 2 && !/省|市|县|区|镇|村/.test(poiName)) {
                pois.push(poiName);
            }
        }
        if (this.vectorSearchService) {
            const { keywords } = this.vectorSearchService.extractKeywords(query);
            for (const keyword of keywords) {
                if (!cities.includes(keyword) && !counties.includes(keyword) && !pois.includes(keyword)) {
                    if (keyword.length >= 2 && !/省|市|县|区|镇|村/.test(keyword)) {
                        pois.push(keyword);
                    }
                }
            }
        }
        return { cities, counties, pois };
    }
    async resolveMustHavePoi(poiQuery, extracted, lat, lng) {
        const cityHint = this.adminDivisionService.mapPoiAliasToCity(poiQuery);
        const normalizedCity = cityHint ? await this.adminDivisionService.normalizeCityName(cityHint) : null;
        const keywordMatch = await this.keywordExactMatch(poiQuery, normalizedCity || undefined);
        if (keywordMatch) {
            return {
                ...keywordMatch,
                source: 'keyword_match',
                matchReasons: ['关键词精确匹配'],
            };
        }
        const aliasMatch = await this.aliasMatch(poiQuery, normalizedCity || undefined);
        if (aliasMatch) {
            return {
                ...aliasMatch,
                source: 'alias_match',
                matchReasons: ['别名匹配'],
            };
        }
        return null;
    }
    async resolveMustHavePoiWithCategory(poiQuery, extracted, lat, lng, categoryFilter) {
        const cityHint = this.adminDivisionService.mapPoiAliasToCity(poiQuery);
        const normalizedCity = cityHint ? await this.adminDivisionService.normalizeCityName(cityHint) : null;
        const keywordMatch = await this.keywordExactMatch(poiQuery, normalizedCity || undefined, categoryFilter);
        if (keywordMatch) {
            return {
                ...keywordMatch,
                source: 'keyword_match',
                matchReasons: ['关键词精确匹配（类别过滤）'],
            };
        }
        const aliasMatch = await this.aliasMatch(poiQuery, normalizedCity || undefined, categoryFilter);
        if (aliasMatch) {
            return {
                ...aliasMatch,
                source: 'alias_match',
                matchReasons: ['别名匹配（类别过滤）'],
            };
        }
        return null;
    }
    async keywordExactMatch(poiName, city, categoryFilter) {
        try {
            let cityFilter = client_1.Prisma.sql ``;
            if (city) {
                const cityRecord = await this.prisma.city.findFirst({
                    where: {
                        OR: [
                            { nameCN: city },
                            { name: city },
                        ],
                    },
                });
                if (cityRecord) {
                    cityFilter = client_1.Prisma.sql `AND "cityId" = ${cityRecord.id}`;
                }
            }
            const results = await this.prisma.$queryRaw `
        SELECT 
          id,
          "nameCN",
          "nameEN",
          address,
          category,
          metadata,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE 
          (
            "nameCN" ILIKE ${`%${poiName}%`}
            OR "nameEN" ILIKE ${`%${poiName}%`}
            OR address ILIKE ${`%${poiName}%`}
          )
          AND location IS NOT NULL
          ${cityFilter}
        LIMIT 1
      `;
            if (results.length > 0) {
                const place = results[0];
                if (place.lat && place.lng) {
                    return {
                        id: place.id,
                        name: place.nameCN || place.nameEN || '',
                        nameCN: place.nameCN || '',
                        nameEN: place.nameEN,
                        address: place.address,
                        category: place.category,
                        lat: parseFloat(place.lat.toString()),
                        lng: parseFloat(place.lng.toString()),
                        score: 1.0,
                        metadata: place.metadata,
                    };
                }
            }
        }
        catch (error) {
            this.logger.warn(`关键词精确匹配失败: ${error}`);
        }
        return null;
    }
    async aliasMatch(poiName, city, categoryFilter) {
        try {
            let cityFilter = client_1.Prisma.sql ``;
            if (city) {
                const cityRecord = await this.prisma.city.findFirst({
                    where: {
                        OR: [
                            { nameCN: city },
                            { name: city },
                        ],
                    },
                });
                if (cityRecord) {
                    cityFilter = client_1.Prisma.sql `AND "cityId" = ${cityRecord.id}`;
                }
            }
            const results = await this.prisma.$queryRaw `
        SELECT 
          id,
          "nameCN",
          "nameEN",
          address,
          category,
          metadata,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE 
          metadata->'aliases' @> ${JSON.stringify([poiName])}::jsonb
          AND location IS NOT NULL
          ${cityFilter}
          ${categoryFilter && categoryFilter.length > 0 ? client_1.Prisma.sql `AND category IN (${client_1.Prisma.join(categoryFilter.map(c => client_1.Prisma.sql `${c}::"PlaceCategory"`), ', ')})` : client_1.Prisma.sql ``}
        LIMIT 1
      `;
            if (results.length > 0) {
                const place = results[0];
                if (place.lat && place.lng) {
                    return {
                        id: place.id,
                        name: place.nameCN || place.nameEN || '',
                        nameCN: place.nameCN || '',
                        nameEN: place.nameEN,
                        address: place.address,
                        category: place.category,
                        lat: parseFloat(place.lat.toString()),
                        lng: parseFloat(place.lng.toString()),
                        score: 0.9,
                        metadata: place.metadata,
                    };
                }
            }
        }
        catch (error) {
            this.logger.warn(`别名匹配失败: ${error}`);
        }
        return null;
    }
    async vectorSearchWithCityScope(query, cities, lat, lng, limit = 10) {
        const normalizedCities = await this.adminDivisionService.normalizeCityNames(cities);
        const results = await this.vectorSearchService.hybridSearch(query, lat, lng, undefined, undefined, limit);
        return results.map(r => {
            var _a, _b;
            return ({
                id: r.id,
                name: r.nameCN || r.nameEN || '',
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: (_a = r.lat) !== null && _a !== void 0 ? _a : 0,
                lng: (_b = r.lng) !== null && _b !== void 0 ? _b : 0,
                score: r.finalScore,
                source: 'vector_search',
                matchReasons: r.matchReasons || [],
                metadata: {},
            });
        }).filter(r => r.lat !== 0 && r.lng !== 0);
    }
    matchesMustHavePoi(result, poiQuery) {
        const tokens = this.mustHavePoiTokens.get(poiQuery);
        if (!tokens) {
            const coreToken = poiQuery.replace(/^(?:北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|宁波|温州|台州|嘉兴|湖州|绍兴|金华|衢州|舟山|丽水|宁海|象山|余姚|慈溪|奉化)/, '');
            const nameMatch = result.name.includes(coreToken) || result.nameCN.includes(coreToken) || (result.nameEN && result.nameEN.includes(coreToken));
            if (!nameMatch) {
                return false;
            }
        }
        else {
            const resultText = `${result.name} ${result.nameCN} ${result.address || ''}`.toLowerCase();
            if (!tokens.every(token => resultText.includes(token.toLowerCase()))) {
                return false;
            }
        }
        const poiKeywords = ['湖', '山', '寺', '馆', '景区', '古镇', '文化园', '博物馆', '故居', '公园', '广场', '塔', '桥', '庙', '祠', '亭', '楼', '阁', '殿', '宫', '园', '林', '谷', '洞', '泉', '瀑布', '红妆', '西湖'];
        const hasPoiKeyword = poiKeywords.some(keyword => poiQuery.includes(keyword));
        if (hasPoiKeyword) {
            const attractionCategories = ['ATTRACTION', 'SCENIC', 'PARK', 'MUSEUM', 'CULTURAL_SITE', 'HISTORICAL_SITE', 'NATURE_SITE'];
            if (!attractionCategories.includes(result.category)) {
                if (result.category === 'HOTEL') {
                    this.logger.debug(`[matchesMustHavePoi] must-have POI "${poiQuery}" 匹配到HOTEL类别，降权处理`);
                    result.score = result.score * 0.1;
                }
                else {
                    this.logger.debug(`[matchesMustHavePoi] must-have POI "${poiQuery}" 匹配到非景点类别 (${result.category})，不算完成`);
                    return false;
                }
            }
        }
        return true;
    }
    async tryExternalGeocoding(poiName, extracted, lat, lng) {
        const cityHint = this.adminDivisionService.mapPoiAliasToCity(poiName);
        const normalizedCity = cityHint
            ? await this.adminDivisionService.normalizeCityName(cityHint)
            : extracted.cities[0];
        let amapQuotaExceeded = false;
        if (this.amapPOIService) {
            try {
                const amapResult = await this.amapPOIService.searchPOIByName(poiName, normalizedCity);
                if (amapResult) {
                    if (amapResult.error === 'USER_DAILY_QUERY_OVER_LIMIT') {
                        amapQuotaExceeded = true;
                        this.logger.warn(`[tryExternalGeocoding] 高德地图配额超限，切换到fallback provider`);
                    }
                    else if (amapResult.lat && amapResult.lng) {
                        return {
                            id: 0,
                            name: amapResult.name || poiName,
                            nameCN: amapResult.name || poiName,
                            nameEN: null,
                            address: amapResult.address,
                            category: 'ATTRACTION',
                            lat: amapResult.lat,
                            lng: amapResult.lng,
                            score: 0.8,
                            source: 'external_geocoding',
                            matchReasons: ['高德地图地理编码'],
                            metadata: {
                                amapId: amapResult.amapId,
                            },
                        };
                    }
                }
            }
            catch (error) {
                this.logger.warn(`高德地图地理编码失败: ${error}`);
            }
        }
        if (amapQuotaExceeded && this.googlePlacesService) {
            try {
                this.logger.debug(`[tryExternalGeocoding] 尝试 Google Places 作为 fallback`);
            }
            catch (error) {
                this.logger.warn(`Google Places 地理编码失败: ${error}`);
            }
        }
        if (amapQuotaExceeded) {
            this.logger.debug(`[tryExternalGeocoding] 所有外部地理编码服务不可用，建议使用 webbrowse 或 clarification`);
        }
        return null;
    }
    generateClarificationOptions(poiName) {
        if (poiName.includes('十里红妆')) {
            return ['十里红妆博物馆', '十里红妆文化园', '十里红妆景区', '十里红妆一条街'];
        }
        return [];
    }
};
exports.EntityResolutionService = EntityResolutionService;
exports.EntityResolutionService = EntityResolutionService = EntityResolutionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        vector_search_service_1.VectorSearchService,
        admin_division_service_1.AdminDivisionService,
        amap_poi_service_1.AmapPOIService,
        google_places_service_1.GooglePlacesService,
        places_service_1.PlacesService])
], EntityResolutionService);
//# sourceMappingURL=entity-resolution.service.js.map