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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var GooglePlacesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GooglePlacesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let GooglePlacesService = GooglePlacesService_1 = class GooglePlacesService {
    constructor(configService) {
        var _a, _b;
        this.configService = configService;
        this.logger = new common_1.Logger(GooglePlacesService_1.name);
        this.baseUrl = 'https://maps.googleapis.com/maps/api/place';
        let rawKey = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_PLACES_API_KEY')) ||
            ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_MAPS_API_KEY')) ||
            '';
        if (rawKey && rawKey.includes('your_api_key')) {
            this.apiKey = rawKey.replace('your_api_key', '').trim();
        }
        else {
            this.apiKey = rawKey;
        }
        if (!this.apiKey || this.apiKey.length < 20) {
            this.logger.warn('GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_API_KEY 未配置或格式不正确，Google Places 功能将不可用');
        }
        this.axiosInstance = axios_1.default.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
    }
    async fetchAttractionsByCountry(countryCode, tourismTypes, timeoutMs = 50000) {
        if (!this.apiKey) {
            throw new Error('GOOGLE_PLACES_API_KEY 未配置');
        }
        try {
            this.logger.log(`正在从 Google Places 获取 ${countryCode} 的景点数据...（超时：${timeoutMs}ms）`);
            const pois = [];
            const startTime = Date.now();
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    this.logger.warn(`搜索超时（${timeoutMs}ms），返回已收集的 ${pois.length} 个结果`);
                    resolve(pois);
                }, timeoutMs);
            });
            const searchPromise = (async () => {
                const countryInfo = this.getCountryInfo(countryCode);
                if (countryInfo.isSmallCountry) {
                    this.logger.log(`使用小国策略：国家中心坐标 (${countryInfo.center.lat}, ${countryInfo.center.lng})`);
                    const mergedQuery = this.buildMergedQuery(countryCode, countryCode, tourismTypes);
                    const results = await this.searchPlacesByText(mergedQuery, countryCode);
                    pois.push(...results);
                }
                else {
                    const majorCities = this.getMajorCitiesByCountry(countryCode);
                    const maxCities = 3;
                    const citiesToSearch = majorCities.slice(0, maxCities);
                    this.logger.log(`使用大国策略：搜索前 ${maxCities} 个主要城市（共 ${majorCities.length} 个）`);
                    for (const city of citiesToSearch) {
                        if (Date.now() - startTime >= timeoutMs) {
                            this.logger.warn(`搜索超时，已处理 ${citiesToSearch.indexOf(city)}/${citiesToSearch.length} 个城市`);
                            break;
                        }
                        try {
                            const mergedQuery = this.buildMergedQuery(city.name, countryCode, tourismTypes);
                            const results = await this.searchPlacesByText(mergedQuery, countryCode);
                            pois.push(...results);
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                        catch (error) {
                            this.logger.warn(`搜索城市 ${city.name} 失败: ${error.message}`);
                        }
                    }
                }
                return pois;
            })();
            const result = await Promise.race([searchPromise, timeoutPromise]);
            const uniquePois = this.deduplicatePois(result);
            const elapsed = Date.now() - startTime;
            this.logger.log(`成功获取 ${uniquePois.length} 个景点（耗时：${elapsed}ms，API 调用优化：从 ~15 次减少到 ~3 次）`);
            return uniquePois;
        }
        catch (error) {
            this.logger.error(`获取 ${countryCode} 景点数据失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async searchPlacesInCity(cityName, countryCode, placeType) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const query = this.buildSearchQuery(cityName, countryCode, placeType);
            return await this.searchPlacesByText(query, countryCode);
        }
        catch (error) {
            const errorMsg = ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error_message) || error.message;
            const errorStatus = ((_c = error.response) === null || _c === void 0 ? void 0 : _c.status) || 'N/A';
            this.logger.error(`搜索城市 ${cityName} 的 ${placeType} 失败: ${errorMsg} (HTTP ${errorStatus})`);
            if ((_d = error.response) === null || _d === void 0 ? void 0 : _d.data) {
                this.logger.error(`API 错误详情: ${JSON.stringify(error.response.data)}`);
            }
            if (((_e = error.response) === null || _e === void 0 ? void 0 : _e.status) === 403 || ((_f = error.response) === null || _f === void 0 ? void 0 : _f.status) === 401) {
                throw new Error(`Google Places API 认证失败: ${errorMsg}`);
            }
            return [];
        }
    }
    async searchPlacesNearby(lat, lng, countryCode, placeType, cityName) {
        try {
            const radius = 5000;
            const placeTypeMapped = this.mapPlaceType(placeType);
            const params = {
                location: `${lat},${lng}`,
                radius: radius,
                key: this.apiKey,
                language: 'en',
            };
            if (placeTypeMapped && placeTypeMapped !== 'point_of_interest') {
                params.type = placeTypeMapped;
            }
            else {
                params.keyword = this.buildSearchQuery('', '', placeTypeMapped || 'tourist attraction');
            }
            const response = await this.axiosInstance.get(`${this.baseUrl}/nearbysearch/json`, { params });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                this.logger.warn(`Google Places Nearby Search 返回状态: ${response.data.status}`);
                return [];
            }
            const results = response.data.results || [];
            const limitedResults = results.slice(0, 20);
            const pois = limitedResults.map((result) => this.mapGooglePlaceToPoi(result, countryCode));
            this.logger.log(`在 ${cityName} (${lat}, ${lng}) 附近找到 ${pois.length} 个 ${placeType}`);
            return pois;
        }
        catch (error) {
            this.logger.warn(`Nearby Search 失败，回退到 Text Search: ${error.message}`);
            const query = this.buildSearchQuery(cityName, countryCode, placeType);
            return await this.searchPlacesByText(query, countryCode);
        }
    }
    async searchPlacesByText(query, countryCode) {
        var _a, _b;
        try {
            this.logger.log(`搜索: ${query}`);
            const response = await this.axiosInstance.get(`${this.baseUrl}/textsearch/json`, {
                params: {
                    query: query,
                    key: this.apiKey,
                    language: 'en',
                },
                timeout: 10000,
            });
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                this.logger.warn(`Google Places Text Search 返回状态: ${response.data.status}`);
                return [];
            }
            const results = response.data.results || [];
            const limitedResults = results.slice(0, 10);
            const pois = limitedResults.map((result) => this.mapGooglePlaceToPoi(result, countryCode));
            this.logger.log(`找到 ${pois.length} 个结果`);
            return pois;
        }
        catch (error) {
            const errorMsg = ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error_message) || error.message;
            this.logger.error(`Text Search 失败: ${errorMsg}`);
            return [];
        }
    }
    getCityCoordinates(cityName, countryCode) {
        var _a;
        const cityCoordsMap = {
            US: {
                'New York': { lat: 40.7128, lng: -74.0060 },
                'Los Angeles': { lat: 34.0522, lng: -118.2437 },
                'Chicago': { lat: 41.8781, lng: -87.6298 },
                'San Francisco': { lat: 37.7749, lng: -122.4194 },
                'Washington': { lat: 38.9072, lng: -77.0369 },
                'Miami': { lat: 25.7617, lng: -80.1918 },
                'Las Vegas': { lat: 36.1699, lng: -115.1398 },
                'Boston': { lat: 42.3601, lng: -71.0589 },
            },
            IS: {
                'Reykjavik': { lat: 64.1466, lng: -21.9426 },
            },
            JP: {
                'Tokyo': { lat: 35.6762, lng: 139.6503 },
                'Osaka': { lat: 34.6937, lng: 135.5023 },
                'Kyoto': { lat: 35.0116, lng: 135.7681 },
            },
            GB: {
                'London': { lat: 51.5074, lng: -0.1278 },
                'Manchester': { lat: 53.4808, lng: -2.2426 },
                'Edinburgh': { lat: 55.9533, lng: -3.1883 },
            },
        };
        return ((_a = cityCoordsMap[countryCode]) === null || _a === void 0 ? void 0 : _a[cityName]) || null;
    }
    buildMergedQuery(location, countryCode, tourismTypes) {
        const typeMap = {
            attraction: 'tourist attraction',
            museum: 'museum',
            viewpoint: 'viewpoint',
            monument: 'monument',
            gallery: 'art gallery',
            theater: 'theater',
        };
        if (tourismTypes && tourismTypes.length > 0) {
            const typeKeywords = tourismTypes
                .slice(0, 3)
                .map(type => typeMap[type.toLowerCase()] || type)
                .join(' OR ');
            return `${typeKeywords} in ${location}, ${countryCode}`;
        }
        else {
            return `tourist attraction in ${location}, ${countryCode}`;
        }
    }
    buildSearchQuery(cityName, countryCode, placeType) {
        const typeMap = {
            attraction: 'tourist attraction',
            museum: 'museum',
            viewpoint: 'viewpoint',
            monument: 'monument',
            gallery: 'art gallery',
            theater: 'theater',
        };
        const typeName = typeMap[placeType.toLowerCase()] || placeType;
        return `${typeName} in ${cityName}, ${countryCode}`;
    }
    getCountryInfo(countryCode) {
        const smallCountries = {
            IS: { lat: 64.9631, lng: -19.0208, radius: 50000 },
            LU: { lat: 49.8153, lng: 6.1296, radius: 30000 },
            MT: { lat: 35.9375, lng: 14.3754, radius: 20000 },
            CY: { lat: 35.1264, lng: 33.4299, radius: 40000 },
        };
        const countryInfo = smallCountries[countryCode];
        if (countryInfo) {
            return {
                isSmallCountry: true,
                center: { lat: countryInfo.lat, lng: countryInfo.lng },
                radius: countryInfo.radius,
            };
        }
        const majorCities = this.getMajorCitiesByCountry(countryCode);
        if (majorCities.length > 0) {
            const firstCity = this.getCityCoordinates(majorCities[0].name, countryCode);
            return {
                isSmallCountry: false,
                center: firstCity || { lat: 0, lng: 0 },
            };
        }
        return {
            isSmallCountry: false,
            center: { lat: 0, lng: 0 },
        };
    }
    mapPlaceType(placeType) {
        const typeMap = {
            attraction: 'tourist_attraction',
            museum: 'museum',
            viewpoint: 'point_of_interest',
            monument: 'point_of_interest',
            gallery: 'art_gallery',
            theater: 'movie_theater',
        };
        return typeMap[placeType.toLowerCase()] || 'point_of_interest';
    }
    getMajorCitiesByCountry(countryCode) {
        const cityMap = {
            US: [
                { name: 'New York', countryCode: 'US' },
                { name: 'Los Angeles', countryCode: 'US' },
                { name: 'Chicago', countryCode: 'US' },
                { name: 'San Francisco', countryCode: 'US' },
                { name: 'Washington', countryCode: 'US' },
                { name: 'Miami', countryCode: 'US' },
                { name: 'Las Vegas', countryCode: 'US' },
                { name: 'Boston', countryCode: 'US' },
            ],
            IS: [
                { name: 'Reykjavik', countryCode: 'IS' },
            ],
            JP: [
                { name: 'Tokyo', countryCode: 'JP' },
                { name: 'Osaka', countryCode: 'JP' },
                { name: 'Kyoto', countryCode: 'JP' },
            ],
            GB: [
                { name: 'London', countryCode: 'GB' },
                { name: 'Manchester', countryCode: 'GB' },
                { name: 'Edinburgh', countryCode: 'GB' },
            ],
        };
        return cityMap[countryCode] || [];
    }
    mapGooglePlaceToPoi(result, countryCode) {
        var _a;
        const location = ((_a = result.geometry) === null || _a === void 0 ? void 0 : _a.location) || {};
        const lat = location.lat || 0;
        const lng = location.lng || 0;
        const name = result.name || 'Unnamed place';
        const types = result.types || [];
        const category = this.extractCategory(types);
        const type = this.extractType(types);
        const placeId = result.place_id || '';
        const osmId = this.hashStringToNumber(placeId);
        const rawTags = {};
        rawTags.name = name;
        if (result.vicinity)
            rawTags.address = result.vicinity;
        if (category)
            rawTags.tourism = category;
        if (type)
            rawTags.type = type;
        if (countryCode)
            rawTags['ISO3166-1'] = countryCode;
        if (result.rating)
            rawTags.rating = result.rating.toString();
        if (result.formatted_address)
            rawTags['addr:full'] = result.formatted_address;
        return {
            placeId,
            countryCode: countryCode || '',
            rawResult: result,
            osmId,
            osmType: 'node',
            name,
            nameEn: name,
            lat,
            lng,
            category,
            type,
            rawTags,
        };
    }
    extractCategory(types) {
        var _a;
        const tourismTypes = types.filter(t => t.includes('tourist') ||
            t.includes('attraction') ||
            t.includes('museum') ||
            t.includes('viewpoint'));
        if (tourismTypes.length > 0) {
            return tourismTypes[0].replace(/_/g, ' ');
        }
        if (types.includes('point_of_interest')) {
            return 'point_of_interest';
        }
        return ((_a = types[0]) === null || _a === void 0 ? void 0 : _a.replace(/_/g, ' ')) || 'tourism';
    }
    extractType(types) {
        var _a;
        const excludeTypes = ['point_of_interest', 'establishment', 'geocode'];
        const specificTypes = types.filter(t => !excludeTypes.includes(t));
        if (specificTypes.length > 0) {
            return specificTypes[0].replace(/_/g, ' ');
        }
        return ((_a = types[0]) === null || _a === void 0 ? void 0 : _a.replace(/_/g, ' ')) || 'attraction';
    }
    hashStringToNumber(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    deduplicatePois(pois) {
        const seen = new Set();
        const unique = [];
        for (const poi of pois) {
            const key = poi.placeId ||
                `${poi.lat.toFixed(4)}_${poi.lng.toFixed(4)}_${poi.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(poi);
            }
        }
        return unique;
    }
};
exports.GooglePlacesService = GooglePlacesService;
exports.GooglePlacesService = GooglePlacesService = GooglePlacesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GooglePlacesService);
//# sourceMappingURL=google-places.service.js.map