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
var VectorSearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorSearchService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const embedding_service_1 = require("./embedding.service");
let VectorSearchService = VectorSearchService_1 = class VectorSearchService {
    constructor(prisma, embeddingService) {
        this.prisma = prisma;
        this.embeddingService = embeddingService;
        this.logger = new common_1.Logger(VectorSearchService_1.name);
        this.dbEmbeddingDimension = null;
    }
    getEmbeddingDimension() {
        var _a;
        return ((_a = this.embeddingService) === null || _a === void 0 ? void 0 : _a.getEmbeddingDimension()) || 1536;
    }
    async detectDbEmbeddingDimension() {
        if (this.dbEmbeddingDimension !== null) {
            return this.dbEmbeddingDimension;
        }
        try {
            const result = await this.prisma.$queryRaw `
        SELECT vector_dims(embedding) as dim 
        FROM "Place" 
        WHERE embedding IS NOT NULL 
        LIMIT 1
      `;
            if (result.length > 0 && result[0].dim) {
                this.dbEmbeddingDimension = result[0].dim;
                this.logger.log(`检测到数据库 embedding 维度: ${this.dbEmbeddingDimension}`);
                return this.dbEmbeddingDimension;
            }
        }
        catch (error) {
            this.logger.warn(`检测数据库 embedding 维度失败: ${error.message}`);
        }
        return null;
    }
    async checkDimensionCompatibility(queryDimension) {
        const dbDimension = await this.detectDbEmbeddingDimension();
        if (dbDimension === null) {
            return true;
        }
        if (queryDimension !== dbDimension) {
            this.logger.warn(`⚠️ 维度不匹配: 查询向量=${queryDimension}维, 数据库=${dbDimension}维。` +
                `将降级到关键词搜索。请考虑重新生成 POI embedding。`);
            return false;
        }
        return true;
    }
    async hybridSearch(query, lat, lng, radius, category, limit = 20, countryCode) {
        var _a;
        this.logger.debug(`混合搜索: ${query}, limit: ${limit}`);
        const { city, keywords } = this.extractKeywords(query);
        const cities = this.extractCities(query);
        if (cities.length >= 2) {
            this.logger.debug(`[hybridSearch] 检测到多城市查询: [${cities.join(', ')}]，按实体拆分搜索`);
            return this.hybridSearchMultiCity(query, cities, keywords, lat, lng, radius, category, limit);
        }
        const effectiveCity = city;
        this.logger.debug(`[hybridSearch] 查询参数: {
  query: "${query}",
  cities: [${cities.join(', ')}],
  city: ${effectiveCity || 'null'} (单城市),
  keywords: [${keywords.join(', ')}],
  lat: ${lat || 'null'},
  lng: ${lng || 'null'},
  radius: ${radius || 'null'},
  category: ${category || 'null'},
  limit: ${limit}
}`);
        const placesWithEmbedding = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
        const embeddingCount = Number(((_a = placesWithEmbedding[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        if (embeddingCount === 0) {
            this.logger.warn('[hybridSearch] 数据库中没有 embedding 数据，直接使用关键词搜索');
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit, countryCode);
            this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: ['关键词匹配（无 embedding 数据）'],
                distance: r.distance,
            }));
        }
        if (!this.embeddingService) {
            this.logger.warn('EmbeddingService 不可用，降级到纯关键词搜索');
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit, countryCode);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: ['关键词匹配（EmbeddingService 不可用）'],
                distance: r.distance,
            }));
        }
        const queryEmbedding = await this.embeddingService.generateEmbedding(query);
        const isZeroVector = queryEmbedding.every(v => v === 0);
        const isDimensionCompatible = await this.checkDimensionCompatibility(queryEmbedding.length);
        this.logger.debug(`[hybridSearch] Embedding 信息: {
  dimension: ${queryEmbedding.length},
  isZeroVector: ${isZeroVector},
  isDimensionCompatible: ${isDimensionCompatible},
  placesWithEmbedding: ${embeddingCount}
}`);
        if (isZeroVector || !isDimensionCompatible) {
            const reason = isZeroVector
                ? '检测到零向量（embedding 失败）'
                : `维度不匹配（查询=${queryEmbedding.length}维，数据库=${await this.detectDbEmbeddingDimension()}维）`;
            this.logger.warn(`${reason}，降级到纯关键词搜索`);
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit);
            this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: [`关键词匹配（${reason}）`],
                distance: r.distance,
            }));
        }
        this.logger.debug(`[hybridSearch] 开始向量搜索，topK: ${limit * 2}, city: ${effectiveCity || 'null'}`);
        const vectorResults = await this.vectorSearch(queryEmbedding, lat, lng, radius, category, effectiveCity, limit * 2);
        this.logger.debug(`[hybridSearch] 向量搜索结果数: ${vectorResults.length}`);
        this.logger.debug(`[hybridSearch] 开始关键词搜索，topK: ${limit * 2}, city: ${effectiveCity || 'null'}`);
        const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, effectiveCity, limit * 2);
        this.logger.debug(`[hybridSearch] 关键词搜索结果数: ${keywordResults.length}`);
        const resultMap = new Map();
        vectorResults.forEach((result) => {
            resultMap.set(result.id, {
                id: result.id,
                nameCN: result.nameCN,
                nameEN: result.nameEN,
                address: result.address,
                category: result.category,
                lat: result.lat ? parseFloat(result.lat) : undefined,
                lng: result.lng ? parseFloat(result.lng) : undefined,
                vectorScore: result.vectorScore,
                keywordScore: 0,
                finalScore: result.vectorScore * 0.7,
                matchReasons: [],
                distance: result.distance,
            });
        });
        keywordResults.forEach((result) => {
            const existing = resultMap.get(result.id);
            if (existing) {
                existing.keywordScore = result.keywordScore;
                existing.finalScore = existing.vectorScore * 0.7 + result.keywordScore * 0.3;
                if (!existing.lat && result.lat) {
                    existing.lat = result.lat ? parseFloat(result.lat) : undefined;
                    existing.lng = result.lng ? parseFloat(result.lng) : undefined;
                }
            }
            else {
                resultMap.set(result.id, {
                    id: result.id,
                    nameCN: result.nameCN,
                    nameEN: result.nameEN,
                    address: result.address,
                    category: result.category,
                    lat: result.lat ? parseFloat(result.lat) : undefined,
                    lng: result.lng ? parseFloat(result.lng) : undefined,
                    vectorScore: 0,
                    keywordScore: result.keywordScore,
                    finalScore: result.keywordScore * 0.3,
                    matchReasons: [],
                    distance: result.distance,
                });
            }
        });
        const results = Array.from(resultMap.values())
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, limit);
        const placeIds = results.map((r) => r.id);
        const places = await this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: {
                id: true,
                metadata: true,
            },
        });
        const placeMap = new Map(places.map((p) => [p.id, p]));
        return results.map((result) => {
            const place = placeMap.get(result.id);
            if (place) {
                result.matchReasons = this.extractMatchReasons(place, query, result.vectorScore, result.keywordScore);
            }
            return result;
        });
    }
    async vectorSearch(queryEmbedding, lat, lng, radius, category, city, limit = 20) {
        var _a;
        const filterInfo = {
            locationFilter: lat && lng && radius ? `ST_DWithin(${lat}, ${lng}, ${radius}m)` : 'none',
            categoryFilter: category || 'none',
            cityFilter: city || 'none',
            embeddingDimension: queryEmbedding.length,
            limit,
        };
        this.logger.debug(`[vectorSearch] 过滤条件: ${JSON.stringify(filterInfo, null, 2)}`);
        const locationFilter = lat && lng && radius
            ? client_1.Prisma.sql `AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
            : client_1.Prisma.sql ``;
        const categoryFilter = category
            ? client_1.Prisma.sql `AND category = ${category}::"PlaceCategory"`
            : client_1.Prisma.sql ``;
        let cityFilter = client_1.Prisma.sql ``;
        let districtFilter = client_1.Prisma.sql ``;
        if (city) {
            const matchingCities = await this.prisma.$queryRaw `
        SELECT id, "nameCN", name FROM "City" 
        WHERE "nameCN" = ${city} 
           OR "nameCN" LIKE ${`%${city}%`}
           OR name = ${city}
           OR name LIKE ${`%${city}%`}
           OR "nameEN" = ${city}
           OR "nameEN" LIKE ${`%${city}%`}
        LIMIT 10
      `;
            const cityIds = matchingCities.map(c => c.id);
            if (cityIds.length > 0) {
                const cityIdSqls = cityIds.map(id => client_1.Prisma.sql `${id}`);
                cityFilter = client_1.Prisma.sql `AND "cityId" IN (${client_1.Prisma.join(cityIdSqls, ', ')})`;
                this.logger.debug(`[vectorSearch] 城市过滤: ${city} -> cityIds: [${cityIds.join(', ')}] (匹配到: ${matchingCities.map(c => `${c.nameCN}/${c.name}`).join(', ')})`);
            }
            else {
                const knownCounties = ['宁海', '象山', '余姚', '慈溪', '奉化', '临安', '建德', '富阳', '桐庐', '淳安'];
                if (knownCounties.includes(city)) {
                    districtFilter = client_1.Prisma.sql `AND (address ILIKE ${`%${city}%`} OR "nameCN" ILIKE ${`%${city}%`})`;
                    this.logger.debug(`[vectorSearch] 区县过滤: ${city} (通过 address/nameCN 匹配)`);
                    const parentCityMap = {
                        '宁海': '宁波',
                        '象山': '宁波',
                        '余姚': '宁波',
                        '慈溪': '宁波',
                        '奉化': '宁波',
                        '临安': '杭州',
                        '建德': '杭州',
                        '富阳': '杭州',
                        '桐庐': '杭州',
                        '淳安': '杭州',
                    };
                    const parentCity = parentCityMap[city];
                    if (parentCity) {
                        const parentCities = await this.prisma.$queryRaw `
              SELECT id, "nameCN" FROM "City" 
              WHERE "nameCN" = ${parentCity} OR name = ${parentCity}
              LIMIT 1
            `;
                        if (parentCities.length > 0) {
                            cityFilter = client_1.Prisma.sql `AND "cityId" = ${parentCities[0].id}`;
                            this.logger.debug(`[vectorSearch] 区县 ${city} 的上级城市: ${parentCity} (cityId: ${parentCities[0].id})`);
                        }
                    }
                }
                else {
                    this.logger.warn(`[vectorSearch] 未找到匹配的城市: ${city}，将搜索所有城市`);
                }
            }
        }
        const distanceSelect = lat && lng
            ? client_1.Prisma.sql `, ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters`
            : client_1.Prisma.sql ``;
        const results = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        1 - (embedding <=> ${queryEmbedding}::vector) as "vectorScore",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
        ${distanceSelect}
      FROM "Place"
      WHERE embedding IS NOT NULL
        ${categoryFilter}
        ${cityFilter}
        ${districtFilter}
        ${locationFilter}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;
        this.logger.debug(`[vectorSearch] 数据库查询结果数: ${results.length}`);
        const totalCount = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
        this.logger.debug(`[vectorSearch] 数据库中有 embedding 的 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        return results.map((r) => ({
            ...r,
            vectorScore: parseFloat(r.vectorScore),
            distance: r.distance ? parseFloat(r.distance) : undefined,
        }));
    }
    extractCityName(raw) {
        const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安',
            '天津', '苏州', '长沙', '郑州', '青岛', '大连', '厦门', '福州', '济南', '合肥',
            '昆明', '哈尔滨', '长春', '沈阳', '石家庄', '太原', '南昌', '南宁', '海口', '贵阳',
            '乌鲁木齐', '拉萨', '银川', '西宁', '呼和浩特', '宁波', '温州', '台州', '嘉兴', '湖州',
            '绍兴', '金华', '衢州', '舟山', '丽水', '宁海', '象山', '余姚', '慈溪', '奉化'];
        for (const city of cities) {
            if (raw.includes(city)) {
                return city;
            }
        }
        return null;
    }
    extractCities(raw) {
        const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安',
            '天津', '苏州', '长沙', '郑州', '青岛', '大连', '厦门', '福州', '济南', '合肥',
            '昆明', '哈尔滨', '长春', '沈阳', '石家庄', '太原', '南昌', '南宁', '海口', '贵阳',
            '乌鲁木齐', '拉萨', '银川', '西宁', '呼和浩特', '宁波', '温州', '台州', '嘉兴', '湖州',
            '绍兴', '金华', '衢州', '舟山', '丽水', '宁海', '象山', '余姚', '慈溪', '奉化'];
        const foundCities = [];
        for (const city of cities) {
            if (raw.includes(city)) {
                foundCities.push(city);
            }
        }
        return foundCities;
    }
    extractKeywords(raw) {
        const foundLandmarks = [];
        let remainingText = raw;
        const cities = this.extractCities(raw);
        const cityPattern = /(?:北京|上海|广州|深圳|杭州|南京|成都|重庆|武汉|西安|天津|苏州|长沙|郑州|青岛|大连|厦门|福州|济南|合肥|昆明|哈尔滨|长春|沈阳|石家庄|太原|南昌|南宁|海口|贵阳|乌鲁木齐|拉萨|银川|西宁|呼和浩特|宁波|温州|台州|嘉兴|湖州|绍兴|金华|衢州|舟山|丽水|宁海|象山|余姚|慈溪|奉化)([^\s，,。.!！？?和以及还有跟与省市县区、]{2,30})/g;
        let match;
        const matchedRanges = [];
        while ((match = cityPattern.exec(raw)) !== null) {
            const matchedCity = match[0].substring(0, match[0].length - match[1].length);
            const landmark = match[1];
            if (landmark.length >= 2 && landmark.length <= 30 && !/省|市|县|区|镇|村/.test(landmark)) {
                let containsOtherCity = false;
                for (const otherCity of cities) {
                    if (otherCity !== matchedCity && landmark.includes(otherCity)) {
                        const otherCityIndex = landmark.indexOf(otherCity);
                        if (otherCityIndex >= 0) {
                            const afterOtherCity = landmark.substring(otherCityIndex + otherCity.length);
                            if (afterOtherCity.length >= 2 && afterOtherCity.length <= 30) {
                                foundLandmarks.push(afterOtherCity);
                                matchedRanges.push({
                                    start: match.index,
                                    end: match.index + match[0].length,
                                    landmark: afterOtherCity
                                });
                                containsOtherCity = true;
                                break;
                            }
                        }
                    }
                }
                if (!containsOtherCity) {
                    foundLandmarks.push(landmark);
                    matchedRanges.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        landmark: landmark
                    });
                }
            }
        }
        matchedRanges.sort((a, b) => b.start - a.start);
        for (const range of matchedRanges) {
            remainingText = remainingText.substring(0, range.start) + ' ' + remainingText.substring(range.end);
        }
        const q = remainingText
            .replace(/规划|安排|行程|旅行|旅游|游玩|游|日|一共|包含|包括|想去|打卡|去|到|在/g, ' ')
            .replace(/[，,。.!！？?]/g, ' ')
            .replace(/和|以及|还有|跟|与/g, ' ')
            .replace(/\s+/g, ' ');
        let terms = q.split(' ').map(s => s.trim()).filter(Boolean);
        terms = terms.flatMap(t => {
            const cityCount = cities.filter(city => t.includes(city)).length;
            if (cityCount > 1) {
                return [t];
            }
            return t.split(/[、,]/).map(s => s.trim()).filter(Boolean);
        });
        const allTerms = [...foundLandmarks, ...terms];
        const city = this.extractCityName(raw);
        const uniqueTerms = Array.from(new Set(allTerms))
            .filter(term => {
            if (term.length < 2)
                return false;
            if (/^\d+$/.test(term))
                return false;
            if (city && term.includes(city))
                return false;
            if (/省|市|县|区/.test(term) && !foundLandmarks.includes(term))
                return false;
            if (cities.some(c => term.includes(c) && term.length < 4))
                return false;
            return true;
        })
            .slice(0, 8);
        this.logger.debug(`关键词抽取: "${raw}" -> city: ${city || 'null'}, keywords: [${uniqueTerms.join(', ')}]`);
        return { city, keywords: uniqueTerms };
    }
    async keywordSearch(query, lat, lng, radius, category, city, limit = 20, countryCode) {
        var _a, _b;
        const extracted = this.extractKeywords(query);
        const effectiveCity = city !== undefined ? city : extracted.city;
        const keywords = extracted.keywords.length > 0 ? extracted.keywords : [query];
        const landmarkKeywords = ['故宫', '天安门', '长城', '颐和园', '天坛', '圆明园', '北海', '景山'];
        const hasLandmark = keywords.some(k => landmarkKeywords.includes(k));
        const preferredCategory = hasLandmark && !category ? 'ATTRACTION' : category;
        const keywordConditions = keywords.map(keyword => client_1.Prisma.sql `(
        "nameCN" ILIKE ${`%${keyword}%`} OR
        "nameEN" ILIKE ${`%${keyword}%`} OR
        address ILIKE ${`%${keyword}%`}
      )`);
        const searchCondition = keywordConditions.length > 0
            ? client_1.Prisma.sql `(${client_1.Prisma.join(keywordConditions, ' OR ')})`
            : client_1.Prisma.sql `FALSE`;
        const categoryFilter = preferredCategory
            ? client_1.Prisma.sql `AND category = ${preferredCategory}::"PlaceCategory"`
            : client_1.Prisma.sql ``;
        let cityFilter = client_1.Prisma.sql ``;
        let districtFilter = client_1.Prisma.sql ``;
        if (city) {
            const matchingCities = await this.prisma.$queryRaw `
        SELECT id, "nameCN", name FROM "City" 
        WHERE "nameCN" = ${city} 
           OR "nameCN" LIKE ${`%${city}%`}
           OR name = ${city}
           OR name LIKE ${`%${city}%`}
           OR "nameEN" = ${city}
           OR "nameEN" LIKE ${`%${city}%`}
        LIMIT 10
      `;
            const cityIds = matchingCities.map(c => c.id);
            if (cityIds.length > 0) {
                const cityIdSqls = cityIds.map(id => client_1.Prisma.sql `${id}`);
                cityFilter = client_1.Prisma.sql `AND "cityId" IN (${client_1.Prisma.join(cityIdSqls, ', ')})`;
                this.logger.debug(`[keywordSearch] 城市过滤: ${effectiveCity} -> cityIds: [${cityIds.join(', ')}] (匹配到: ${matchingCities.map(c => `${c.nameCN}/${c.name}`).join(', ')})`);
            }
            else {
                const knownCounties = ['宁海', '象山', '余姚', '慈溪', '奉化', '临安', '建德', '富阳', '桐庐', '淳安'];
                if (knownCounties.includes(city)) {
                    districtFilter = client_1.Prisma.sql `AND (address ILIKE ${`%${city}%`} OR "nameCN" ILIKE ${`%${city}%`})`;
                    this.logger.debug(`[keywordSearch] 区县过滤: ${effectiveCity} (通过 address/nameCN 匹配)`);
                    const parentCityMap = {
                        '宁海': '宁波',
                        '象山': '宁波',
                        '余姚': '宁波',
                        '慈溪': '宁波',
                        '奉化': '宁波',
                        '临安': '杭州',
                        '建德': '杭州',
                        '富阳': '杭州',
                        '桐庐': '杭州',
                        '淳安': '杭州',
                    };
                    const parentCity = parentCityMap[city];
                    if (parentCity) {
                        const parentCities = await this.prisma.$queryRaw `
              SELECT id, "nameCN" FROM "City" 
              WHERE "nameCN" = ${parentCity} OR name = ${parentCity}
              LIMIT 1
            `;
                        if (parentCities.length > 0) {
                            cityFilter = client_1.Prisma.sql `AND "cityId" = ${parentCities[0].id}`;
                            this.logger.debug(`[keywordSearch] 区县 ${effectiveCity} 的上级城市: ${parentCity} (cityId: ${parentCities[0].id})`);
                        }
                    }
                }
                else {
                    this.logger.warn(`[keywordSearch] 未找到匹配的城市: ${effectiveCity}，将搜索所有城市`);
                }
            }
        }
        const locationFilter = lat && lng && radius
            ? client_1.Prisma.sql `AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )`
            : client_1.Prisma.sql ``;
        const countryFilter = countryCode
            ? client_1.Prisma.sql `AND metadata->>'countryCode' = ${countryCode}`
            : client_1.Prisma.sql ``;
        const distanceSelect = lat && lng
            ? client_1.Prisma.sql `, ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters`
            : client_1.Prisma.sql ``;
        const keywordMatches = keywords.map(keyword => client_1.Prisma.sql `(
        CASE WHEN "nameCN" ILIKE ${`%${keyword}%`} THEN 1.0
             WHEN "nameEN" ILIKE ${`%${keyword}%`} THEN 0.8
             WHEN address ILIKE ${`%${keyword}%`} THEN 0.6
             ELSE 0 END
      )`);
        const scoreCase = keywordMatches.length > 0
            ? client_1.Prisma.sql `LEAST(${client_1.Prisma.join(keywordMatches, ' + ')}, 1.0)`
            : client_1.Prisma.sql `0.4`;
        this.logger.debug(`[keywordSearch] SQL 查询条件: {
  keywords: [${keywords.join(', ')}],
  cityFilter: ${city || 'none'},
  categoryFilter: ${preferredCategory || 'none'},
  locationFilter: ${lat && lng && radius ? `ST_DWithin(${lat}, ${lng}, ${radius}m)` : 'none'},
  limit: ${limit}
}`);
        const results = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        address,
        category,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        ${scoreCase} as "keywordScore"
        ${distanceSelect}
      FROM "Place"
      WHERE ${searchCondition}
        ${categoryFilter}
        ${cityFilter}
        ${districtFilter}
        ${locationFilter}
        ${countryFilter}
      ORDER BY "keywordScore" DESC
      LIMIT ${limit}
    `;
        this.logger.debug(`[keywordSearch] 数据库查询结果数: ${results.length}`);
        const totalCount = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count FROM "Place"
    `;
        this.logger.debug(`[keywordSearch] 数据库中 Place 总数: ${((_a = totalCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        if (city) {
            const cityCount = await this.prisma.$queryRaw `
        SELECT COUNT(*) as count 
        FROM "Place" p
        INNER JOIN "City" c ON c.id = p."cityId"
        WHERE c."nameCN" = ${city} OR c.name = ${city}
      `;
            this.logger.debug(`[keywordSearch] 数据库中 ${city} 的 Place 总数: ${((_b = cityCount[0]) === null || _b === void 0 ? void 0 : _b.count) || 0}`);
        }
        return results.map((r) => ({
            ...r,
            keywordScore: parseFloat(r.keywordScore),
            lat: r.lat ? parseFloat(r.lat) : undefined,
            lng: r.lng ? parseFloat(r.lng) : undefined,
            distance: r.distance ? parseFloat(r.distance) : undefined,
        }));
    }
    async hybridSearchMultiCity(query, cities, keywords, lat, lng, radius, category, limit = 20) {
        this.logger.debug(`[hybridSearchMultiCity] 开始多城市拆分搜索: cities=[${cities.join(', ')}], keywords=[${keywords.join(', ')}]`);
        let entities = this.splitQueryIntoEntities(query, cities, keywords);
        entities = entities.filter(entity => {
            const name = entity.name;
            if (name.length < 3) {
                const knownShortPois = ['西湖', '天坛', '故宫', '长城', '天安门', '颐和园', '圆明园', '北海', '景山'];
                if (!knownShortPois.includes(name)) {
                    this.logger.debug(`[hybridSearchMultiCity] 过滤脏实体（长度<3）: "${name}"`);
                    return false;
                }
            }
            const singleCharSuffixes = ['十', '里', '路', '街', '巷', '道', '号', '层', '楼', '座', '间', '个', '只', '条', '张', '把', '本', '支', '根', '块', '片', '粒', '颗', '滴', '点', '次', '回', '趟', '遍', '场', '阵', '顿', '餐', '顿', '餐', '顿', '餐'];
            if (name.length > 0 && singleCharSuffixes.includes(name[name.length - 1])) {
                this.logger.debug(`[hybridSearchMultiCity] 过滤脏实体（末尾单字）: "${name}"`);
                return false;
            }
            const poiKeywords = ['湖', '山', '寺', '馆', '景区', '古镇', '文化园', '博物馆', '故居', '公园', '广场', '塔', '桥', '庙', '祠', '亭', '楼', '阁', '殿', '宫', '园', '林', '谷', '洞', '泉', '瀑布', '红妆', '十里红妆', '文化', '艺术', '展览', '中心', '基地', '遗址', '纪念', '景区', '风景', '名胜'];
            const hasPoiKeyword = poiKeywords.some(keyword => name.includes(keyword));
            const knownPoiNames = ['十里红妆', '天安门', '故宫', '长城', '颐和园', '圆明园', '北海', '景山', '天坛', '地坛', '日坛', '月坛', '雍和宫', '恭王府', '什刹海', '南锣鼓巷', '798', '鸟巢', '水立方', '大观园', '大观楼', '大观塔'];
            if (name.length >= 4 && !hasPoiKeyword && !knownPoiNames.includes(name)) {
                const knownDistricts = ['宁海', '象山', '余姚', '慈溪', '奉化', '临安', '建德', '富阳', '桐庐', '淳安'];
                if (!knownDistricts.includes(name)) {
                    this.logger.debug(`[hybridSearchMultiCity] 过滤脏实体（无POI关键词）: "${name}"`);
                    return false;
                }
            }
            return true;
        });
        this.logger.debug(`[hybridSearchMultiCity] 拆分后的实体（过滤后）: ${JSON.stringify(entities, null, 2)}`);
        const searchPromises = entities.map(async (entity) => {
            const entityQuery = entity.name;
            const entityCity = entity.cityHint;
            this.logger.debug(`[hybridSearchMultiCity] 搜索实体: "${entityQuery}" (cityHint: ${entityCity || 'null'})`);
            const results = await this.hybridSearchSingleEntity(entityQuery, entityCity, lat, lng, radius, category, Math.ceil(limit / entities.length));
            return results;
        });
        const allResults = await Promise.all(searchPromises);
        const resultMap = new Map();
        for (const results of allResults) {
            for (const result of results) {
                const existing = resultMap.get(result.id);
                if (existing) {
                    if (result.finalScore > existing.finalScore) {
                        resultMap.set(result.id, result);
                    }
                }
                else {
                    resultMap.set(result.id, result);
                }
            }
        }
        let mergedResults = Array.from(resultMap.values());
        const hasAttractionIntent = /西湖|景区|公园|博物馆|古镇|文化园|景点|风景|名胜|山|湖|寺|馆|塔|桥|庙|祠|亭|楼|阁|殿|宫|园|林|谷|洞|泉|瀑布|红妆/.test(query);
        if (hasAttractionIntent) {
            mergedResults = mergedResults.map(r => {
                const attractionCategories = ['ATTRACTION', 'SCENIC', 'PARK', 'MUSEUM', 'CULTURAL_SITE', 'HISTORICAL_SITE', 'NATURE_SITE'];
                const isAttraction = attractionCategories.includes(r.category);
                const isHotel = r.category === 'HOTEL';
                if (isAttraction) {
                    r.finalScore = r.finalScore * 1.5;
                }
                else if (isHotel) {
                    r.finalScore = r.finalScore * 0.3;
                }
                return r;
            });
        }
        mergedResults = mergedResults
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, limit);
        this.logger.debug(`[hybridSearchMultiCity] 合并后结果数: ${mergedResults.length}`);
        return mergedResults;
    }
    async hybridSearchSingleEntity(query, cityHint, lat, lng, radius, category, limit = 20) {
        var _a;
        const placesWithEmbedding = await this.prisma.$queryRaw `
      SELECT COUNT(*) as count FROM "Place" WHERE embedding IS NOT NULL
    `;
        const embeddingCount = Number(((_a = placesWithEmbedding[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        if (embeddingCount === 0) {
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: ['关键词匹配（无 embedding 数据）'],
                distance: r.distance,
            }));
        }
        if (!this.embeddingService) {
            this.logger.warn('EmbeddingService 不可用，降级到纯关键词搜索');
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: ['关键词匹配（EmbeddingService 不可用）'],
                distance: r.distance,
            }));
        }
        const queryEmbedding = await this.embeddingService.generateEmbedding(query);
        if (!queryEmbedding) {
            this.logger.warn('EmbeddingService 不可用，跳过向量搜索');
            return [];
        }
        const isZeroVector = queryEmbedding.every(v => v === 0);
        const isDimensionCompatible = await this.checkDimensionCompatibility(queryEmbedding.length);
        if (isZeroVector || !isDimensionCompatible) {
            const reason = isZeroVector
                ? '检测到零向量（embedding 失败）'
                : `维度不匹配（查询=${queryEmbedding.length}维，数据库=${await this.detectDbEmbeddingDimension()}维）`;
            const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit);
            return keywordResults.map(r => ({
                id: r.id,
                nameCN: r.nameCN,
                nameEN: r.nameEN,
                address: r.address,
                category: r.category,
                lat: r.lat,
                lng: r.lng,
                vectorScore: 0,
                keywordScore: r.keywordScore,
                finalScore: r.keywordScore,
                matchReasons: [`关键词匹配（${reason}）`],
                distance: r.distance,
            }));
        }
        const vectorResults = await this.vectorSearch(queryEmbedding, lat, lng, radius, category, cityHint, limit * 2);
        const keywordResults = await this.keywordSearch(query, lat, lng, radius, category, cityHint, limit * 2);
        const resultMap = new Map();
        vectorResults.forEach((result) => {
            resultMap.set(result.id, {
                id: result.id,
                nameCN: result.nameCN,
                nameEN: result.nameEN,
                address: result.address,
                category: result.category,
                lat: result.lat ? parseFloat(result.lat) : undefined,
                lng: result.lng ? parseFloat(result.lng) : undefined,
                vectorScore: result.vectorScore,
                keywordScore: 0,
                finalScore: result.vectorScore * 0.7,
                matchReasons: [],
                distance: result.distance,
            });
        });
        keywordResults.forEach((result) => {
            const existing = resultMap.get(result.id);
            if (existing) {
                existing.keywordScore = result.keywordScore;
                existing.finalScore = existing.vectorScore * 0.7 + result.keywordScore * 0.3;
                if (!existing.lat && result.lat) {
                    existing.lat = result.lat ? parseFloat(result.lat) : undefined;
                    existing.lng = result.lng ? parseFloat(result.lng) : undefined;
                }
            }
            else {
                resultMap.set(result.id, {
                    id: result.id,
                    nameCN: result.nameCN,
                    nameEN: result.nameEN,
                    address: result.address,
                    category: result.category,
                    lat: result.lat ? parseFloat(result.lat) : undefined,
                    lng: result.lng ? parseFloat(result.lng) : undefined,
                    vectorScore: 0,
                    keywordScore: result.keywordScore,
                    finalScore: result.keywordScore * 0.3,
                    matchReasons: [],
                    distance: result.distance,
                });
            }
        });
        let results = Array.from(resultMap.values());
        const hasAttractionIntent = /西湖|景区|公园|博物馆|古镇|文化园|景点|风景|名胜|山|湖|寺|馆|塔|桥|庙|祠|亭|楼|阁|殿|宫|园|林|谷|洞|泉|瀑布|红妆/.test(query);
        if (hasAttractionIntent) {
            results = results.map(r => {
                const attractionCategories = ['ATTRACTION', 'SCENIC', 'PARK', 'MUSEUM', 'CULTURAL_SITE', 'HISTORICAL_SITE', 'NATURE_SITE'];
                const isAttraction = attractionCategories.includes(r.category);
                const isHotel = r.category === 'HOTEL';
                if (isAttraction) {
                    r.finalScore = r.finalScore * 1.5;
                }
                else if (isHotel) {
                    r.finalScore = r.finalScore * 0.3;
                }
                return r;
            });
        }
        results = results
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, limit);
        const placeIds = results.map((r) => r.id);
        const places = await this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: {
                id: true,
                metadata: true,
            },
        });
        const placeMap = new Map(places.map((p) => [p.id, p]));
        return results.map((result) => {
            const place = placeMap.get(result.id);
            if (place) {
                result.matchReasons = this.extractMatchReasons(place, query, result.vectorScore, result.keywordScore);
            }
            return result;
        });
    }
    splitQueryIntoEntities(query, cities, keywords) {
        const entities = [];
        const processedKeywords = new Set();
        for (const city of cities) {
            const cityIndex = query.indexOf(city);
            if (cityIndex >= 0) {
                const afterCity = query.substring(cityIndex + city.length, cityIndex + city.length + 30);
                const poiPattern = /^([^\s，,。.!！？?和以及还有跟与省市县区]{2,8})/;
                const match = afterCity.match(poiPattern);
                if (match && match[1]) {
                    const landmark = match[1];
                    let foundNestedCity = false;
                    for (const otherCity of cities) {
                        if (otherCity !== city && landmark.includes(otherCity)) {
                            const otherCityIndex = landmark.indexOf(otherCity);
                            if (otherCityIndex >= 0) {
                                const afterOtherCity = landmark.substring(otherCityIndex + otherCity.length);
                                if (afterOtherCity.length >= 2 && afterOtherCity.length <= 30) {
                                    entities.push({
                                        name: afterOtherCity,
                                        cityHint: otherCity,
                                    });
                                    processedKeywords.add(afterOtherCity);
                                    foundNestedCity = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (!foundNestedCity && landmark.length >= 2 && landmark.length <= 30 && !landmark.includes(city)) {
                        entities.push({
                            name: landmark,
                            cityHint: city,
                        });
                        processedKeywords.add(landmark);
                    }
                }
            }
        }
        for (const keyword of keywords) {
            if (processedKeywords.has(keyword) || entities.some(e => e.name === keyword || keyword.includes(e.name) || e.name.includes(keyword))) {
                continue;
            }
            let matchedCity = null;
            for (const city of cities) {
                if (keyword.includes(city) || query.includes(`${city}${keyword}`) || query.includes(`${keyword}${city}`)) {
                    matchedCity = city;
                    break;
                }
            }
            if (!matchedCity && cities.length > 0) {
                const keywordIndex = query.indexOf(keyword);
                if (keywordIndex >= 0) {
                    let minDistance = Infinity;
                    let nearestCity = null;
                    for (const city of cities) {
                        const cityIndex = query.indexOf(city);
                        if (cityIndex >= 0) {
                            const distance = Math.abs(cityIndex - keywordIndex);
                            if (distance < minDistance && distance < 10) {
                                minDistance = distance;
                                nearestCity = city;
                            }
                        }
                    }
                    matchedCity = nearestCity;
                }
            }
            if (!matchedCity) {
                continue;
            }
            entities.push({
                name: keyword,
                cityHint: matchedCity,
            });
            processedKeywords.add(keyword);
        }
        if (entities.length === 0) {
            entities.push({
                name: query,
                cityHint: null,
            });
        }
        return entities;
    }
    extractMatchReasons(place, query, vectorScore, keywordScore) {
        var _a, _b;
        const reasons = [];
        const metadata = place.metadata;
        if (vectorScore > 0.7) {
            if (metadata === null || metadata === void 0 ? void 0 : metadata.reviews) {
                const reviews = Array.isArray(metadata.reviews) ? metadata.reviews : [];
                const keywords = [];
                reviews.forEach((review) => {
                    const text = (review.text || '').toLowerCase();
                    if (text.includes('安静') || text.includes('静谧'))
                        keywords.push('静谧');
                    if (text.includes('日式') || text.includes('和风'))
                        keywords.push('日式');
                    if (text.includes('庭院') || text.includes('花园'))
                        keywords.push('庭院');
                    if (text.includes('冥想') || text.includes('静心'))
                        keywords.push('适合冥想');
                });
                if (keywords.length > 0) {
                    const uniqueKeywords = Array.from(new Set(keywords));
                    reasons.push(`根据评论提到的"${uniqueKeywords.join('"、"')}"推荐`);
                }
            }
            if (metadata === null || metadata === void 0 ? void 0 : metadata.tags) {
                const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
                const matchingTags = tags.filter((tag) => {
                    const tagLower = tag.toLowerCase();
                    return (tagLower.includes('日式') ||
                        tagLower.includes('庭院') ||
                        tagLower.includes('安静') ||
                        tagLower.includes('静谧') ||
                        tagLower.includes('京都'));
                });
                if (matchingTags.length > 0) {
                    reasons.push(`标签：${matchingTags.join('、')}`);
                }
            }
            if (metadata === null || metadata === void 0 ? void 0 : metadata.description) {
                const desc = metadata.description.toLowerCase();
                if (desc.includes('日式') || desc.includes('和风')) {
                    reasons.push('描述中提到日式风格');
                }
                if (desc.includes('安静') || desc.includes('静谧')) {
                    reasons.push('描述中提到安静氛围');
                }
            }
        }
        if (keywordScore > 0.5) {
            if ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.nameCN) === null || _a === void 0 ? void 0 : _a.includes(query)) {
                reasons.push(`名称包含"${query}"`);
            }
            else if ((_b = metadata === null || metadata === void 0 ? void 0 : metadata.nameEN) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(query.toLowerCase())) {
                reasons.push(`英文名称包含"${query}"`);
            }
        }
        if (reasons.length === 0) {
            if (vectorScore > 0.7) {
                reasons.push('语义相似度高');
            }
            else if (keywordScore > 0.5) {
                reasons.push('关键词匹配');
            }
        }
        return reasons;
    }
};
exports.VectorSearchService = VectorSearchService;
exports.VectorSearchService = VectorSearchService = VectorSearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        embedding_service_1.EmbeddingService])
], VectorSearchService);
//# sourceMappingURL=vector-search.service.js.map