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
var MapboxService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapboxService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let MapboxService = MapboxService_1 = class MapboxService {
    constructor(configService) {
        var _a, _b;
        this.configService = configService;
        this.logger = new common_1.Logger(MapboxService_1.name);
        this.baseUrl = 'https://api.mapbox.com';
        this.accessToken =
            ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('MAPBOX_ACCESS_TOKEN')) ||
                ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('VITE_MAPBOX_ACCESS_TOKEN')) ||
                '';
        if (!this.accessToken) {
            this.logger.warn('MAPBOX_ACCESS_TOKEN 或 VITE_MAPBOX_ACCESS_TOKEN 未配置，Mapbox 功能将不可用');
        }
        this.axiosInstance = axios_1.default.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
    }
    async fetchAttractionsByCountry(countryCode, tourismTypes) {
        if (!this.accessToken) {
            throw new Error('MAPBOX_ACCESS_TOKEN 未配置');
        }
        try {
            this.logger.log(`正在从 Mapbox 获取 ${countryCode} 的景点数据...`);
            const countryBounds = await this.getCountryBounds(countryCode);
            const query = this.buildSearchQuery(tourismTypes);
            const pois = [];
            const majorCities = this.getMajorCitiesByCountry(countryCode);
            if (majorCities.length > 0) {
                for (const city of majorCities) {
                    try {
                        const cityBounds = await this.getCityBounds(city.name, countryCode);
                        if (tourismTypes && tourismTypes.length > 0) {
                            for (const type of tourismTypes) {
                                const results = await this.searchInBbox(`${type} ${city.name}`, cityBounds.bbox);
                                pois.push(...results);
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                        else {
                            const results = await this.searchInBbox(`${query} ${city.name}`, cityBounds.bbox);
                            pois.push(...results);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                    catch (error) {
                        this.logger.warn(`搜索城市 ${city.name} 失败: ${error.message}`);
                    }
                }
            }
            else {
                const bbox = countryBounds.bbox;
                const latStep = (bbox[3] - bbox[1]) / 3;
                const lngStep = (bbox[2] - bbox[0]) / 3;
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        const minLng = bbox[0] + j * lngStep;
                        const maxLng = bbox[0] + (j + 1) * lngStep;
                        const minLat = bbox[1] + i * latStep;
                        const maxLat = bbox[1] + (i + 1) * latStep;
                        if (tourismTypes && tourismTypes.length > 0) {
                            for (const type of tourismTypes) {
                                const results = await this.searchInBbox(type, [minLng, minLat, maxLng, maxLat]);
                                pois.push(...results);
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                        else {
                            const results = await this.searchInBbox(query, [minLng, minLat, maxLng, maxLat]);
                            pois.push(...results);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                }
            }
            const uniquePois = this.deduplicatePois(pois);
            this.logger.log(`成功获取 ${uniquePois.length} 个景点`);
            return uniquePois;
        }
        catch (error) {
            this.logger.error(`获取 ${countryCode} 景点数据失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    getMajorCitiesByCountry(countryCode) {
        const cityMap = {
            US: [
                { name: 'New York', countryCode: 'US' },
                { name: 'Los Angeles', countryCode: 'US' },
                { name: 'Chicago', countryCode: 'US' },
                { name: 'San Francisco', countryCode: 'US' },
                { name: 'Washington', countryCode: 'US' },
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
    async getCityBounds(cityName, countryCode) {
        var _a, _b, _c;
        try {
            const query = `${cityName}, ${countryCode}`;
            const response = await this.axiosInstance.get(`${this.baseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`, {
                params: {
                    access_token: this.accessToken,
                    types: 'place',
                    limit: 1,
                },
            });
            const feature = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.features) === null || _b === void 0 ? void 0 : _b[0];
            if (!feature || !feature.bbox) {
                const [lng, lat] = ((_c = feature === null || feature === void 0 ? void 0 : feature.geometry) === null || _c === void 0 ? void 0 : _c.coordinates) || [0, 0];
                return {
                    bbox: [lng - 0.1, lat - 0.1, lng + 0.1, lat + 0.1],
                    name: (feature === null || feature === void 0 ? void 0 : feature.place_name) || cityName,
                };
            }
            return {
                bbox: feature.bbox,
                name: feature.place_name || cityName,
            };
        }
        catch (error) {
            this.logger.warn(`获取城市 ${cityName} 边界框失败: ${error.message}`);
            return {
                bbox: [-74.0, 40.7, -73.9, 40.8],
                name: cityName,
            };
        }
    }
    async getCountryBounds(countryCode) {
        var _a, _b;
        try {
            const response = await this.axiosInstance.get(`${this.baseUrl}/geocoding/v5/mapbox.places/${countryCode}.json`, {
                params: {
                    access_token: this.accessToken,
                    types: 'country',
                },
            });
            const feature = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.features) === null || _b === void 0 ? void 0 : _b[0];
            if (!feature || !feature.bbox) {
                throw new Error(`无法获取 ${countryCode} 的边界框`);
            }
            return {
                bbox: feature.bbox,
                name: feature.place_name || countryCode,
            };
        }
        catch (error) {
            this.logger.error(`获取国家边界框失败: ${error.message}`);
            return {
                bbox: [-25.0, 63.0, -13.0, 67.0],
                name: countryCode,
            };
        }
    }
    buildSearchQuery(tourismTypes) {
        if (tourismTypes && tourismTypes.length > 0) {
            const typeMap = {
                attraction: 'attraction',
                museum: 'museum',
                viewpoint: 'viewpoint',
                monument: 'monument',
                gallery: 'gallery',
                theater: 'theater',
            };
            const mappedTypes = tourismTypes
                .map(t => typeMap[t.toLowerCase()] || t)
                .filter(Boolean);
            return mappedTypes[0] || 'attraction';
        }
        return 'attraction';
    }
    async searchInBbox(query, bbox) {
        var _a;
        try {
            const response = await this.axiosInstance.get(`${this.baseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`, {
                params: {
                    access_token: this.accessToken,
                    bbox: bbox.join(','),
                    limit: 50,
                    types: 'poi',
                    language: 'en',
                },
            });
            const features = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.features) || [];
            this.logger.debug(`Mapbox API 返回 ${features.length} 个结果`);
            return features
                .filter((feature) => {
                var _a;
                const properties = feature.properties || {};
                const placeType = properties.place_type || [];
                return placeType.includes('poi') ||
                    properties.category ||
                    properties.type ||
                    ((_a = feature.id) === null || _a === void 0 ? void 0 : _a.startsWith('poi'));
            })
                .map((feature) => this.mapMapboxFeatureToPoi(feature))
                .filter((poi) => {
                return poi.category && poi.type;
            });
        }
        catch (error) {
            this.logger.warn(`搜索边界框失败: ${error.message}`);
            return [];
        }
    }
    mapMapboxFeatureToPoi(feature) {
        var _a, _b, _c, _d;
        const [lng, lat] = ((_a = feature.geometry) === null || _a === void 0 ? void 0 : _a.coordinates) || [0, 0];
        const properties = feature.properties || {};
        const context = feature.context || [];
        const name = properties.text || properties.name || feature.text || 'Unnamed place';
        const nameEn = properties.name_en || properties.name || name;
        let category = 'tourism';
        let type = 'attraction';
        if (properties.category) {
            if (Array.isArray(properties.category)) {
                category = properties.category[0] || 'tourism';
                type = properties.category[0] || 'attraction';
            }
            else {
                category = properties.category;
                type = properties.category;
            }
        }
        if (properties.type) {
            type = properties.type;
        }
        const placeType = feature.place_type || [];
        if (placeType.length > 0 && !category) {
            category = placeType[0];
            type = placeType[0];
        }
        const countryContext = context.find((ctx) => { var _a; return ((_a = ctx.id) === null || _a === void 0 ? void 0 : _a.startsWith('country')) || ctx.short_code; });
        const countryCode = ((_b = countryContext === null || countryContext === void 0 ? void 0 : countryContext.short_code) === null || _b === void 0 ? void 0 : _b.toUpperCase()) ||
            ((_c = countryContext === null || countryContext === void 0 ? void 0 : countryContext.iso_3166_1) === null || _c === void 0 ? void 0 : _c.toUpperCase());
        const mapboxId = feature.id || ((_d = feature.properties) === null || _d === void 0 ? void 0 : _d.id) || '';
        const osmId = this.hashStringToNumber(mapboxId);
        const rawTags = {};
        if (name)
            rawTags.name = name;
        if (nameEn && nameEn !== name)
            rawTags['name:en'] = nameEn;
        if (category)
            rawTags.tourism = category;
        if (type)
            rawTags.type = type;
        if (countryCode)
            rawTags['ISO3166-1'] = countryCode;
        if (properties.address)
            rawTags.address = properties.address;
        if (properties.phone)
            rawTags.phone = properties.phone;
        if (properties.website)
            rawTags.website = properties.website;
        return {
            mapboxId,
            countryCode,
            rawProperties: properties,
            rawContext: context,
            osmId,
            osmType: 'node',
            name,
            nameEn,
            lat,
            lng,
            category: typeof category === 'string' ? category : (category[0] || 'tourism'),
            type: typeof type === 'string' ? type : (type[0] || 'attraction'),
            rawTags,
        };
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
            const key = `${poi.lat.toFixed(4)}_${poi.lng.toFixed(4)}_${poi.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(poi);
            }
        }
        return unique;
    }
};
exports.MapboxService = MapboxService;
exports.MapboxService = MapboxService = MapboxService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MapboxService);
//# sourceMappingURL=mapbox.service.js.map