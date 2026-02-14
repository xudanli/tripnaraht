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
var POILayerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.POILayerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const poi_layer_interface_1 = require("../interfaces/poi-layer.interface");
let POILayerService = POILayerService_1 = class POILayerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(POILayerService_1.name);
    }
    async getPOIsForRouteGeneration(poiIds) {
        this.logger.log(`获取 ${poiIds.length} 个POI用于路线生成（静态+半动态层）`);
        const pois = [];
        for (const poiId of poiIds) {
            try {
                const poi = await this.getPOIForRouteGeneration(poiId);
                if (poi) {
                    pois.push(poi);
                }
            }
            catch (error) {
                this.logger.warn(`获取POI ${poiId} 失败: ${error}`);
            }
        }
        return pois;
    }
    async getPOIForRouteGeneration(poiId) {
        const staticData = await this.getStaticLayerData(poiId);
        if (!staticData) {
            return null;
        }
        const semiDynamicData = await this.getSemiDynamicLayerData(poiId);
        return {
            static: staticData,
            semiDynamic: semiDynamicData || undefined,
        };
    }
    async getCompletePOI(poiId) {
        const staticData = await this.getStaticLayerData(poiId);
        if (!staticData) {
            return null;
        }
        const semiDynamicData = await this.getSemiDynamicLayerData(poiId);
        const highlyDynamicData = await this.getHighlyDynamicLayerData(poiId);
        return {
            static: staticData,
            semiDynamic: semiDynamicData || undefined,
            highlyDynamic: highlyDynamicData || undefined,
        };
    }
    async getStaticLayerData(poiId) {
        try {
            const poi = await this.prisma.poi_canonical.findUnique({
                where: { poi_id: poiId },
            });
            if (!poi) {
                return null;
            }
            return {
                id: poi.poi_id,
                name: poi.name_default || '未命名',
                nameI18n: poi.name_i18n,
                location: {
                    lat: poi.lat,
                    lng: poi.lng,
                    geom: poi.geom,
                    address: poi.address || undefined,
                    regionKey: poi.region_key || undefined,
                    regionName: poi.region_name || undefined,
                },
                category: poi.category,
                tags: this.extractTags(poi.tags_slim),
                source: poi.source,
                externalId: poi.source_key,
                createdAt: poi.created_at || new Date(),
                updatedAt: poi.updated_at || new Date(),
            };
        }
        catch (error) {
            this.logger.error(`获取静态层数据失败 (${poiId}): ${error}`);
            return null;
        }
    }
    async getSemiDynamicLayerData(poiId) {
        try {
            const poi = await this.prisma.poi_canonical.findUnique({
                where: { poi_id: poiId },
                select: {
                    poi_id: true,
                    opening_hours: true,
                    phone: true,
                    website: true,
                    updated_at: true,
                },
            });
            if (!poi) {
                return null;
            }
            const semiDynamic = {
                poiId: poi.poi_id,
                updatedAt: poi.updated_at || new Date(),
            };
            if (poi.opening_hours) {
                semiDynamic.openingHours = {
                    raw: poi.opening_hours,
                };
            }
            if (poi.phone || poi.website) {
                semiDynamic.contact = {
                    phone: poi.phone || undefined,
                    website: poi.website || undefined,
                };
            }
            return semiDynamic;
        }
        catch (error) {
            this.logger.error(`获取半动态层数据失败 (${poiId}): ${error}`);
            return null;
        }
    }
    async getHighlyDynamicLayerData(poiId) {
        this.logger.debug(`高度动态层数据获取未实现 (${poiId})`);
        return null;
    }
    extractTags(tagsSlim) {
        if (!tagsSlim || typeof tagsSlim !== 'object') {
            return [];
        }
        const tags = [];
        const tagKeys = [
            'amenity',
            'tourism',
            'leisure',
            'shop',
            'historic',
            'natural',
            'waterway',
            'highway',
        ];
        for (const key of tagKeys) {
            if (tagsSlim[key]) {
                tags.push(`${key}:${tagsSlim[key]}`);
            }
        }
        for (const [key, value] of Object.entries(tagsSlim)) {
            if (!tagKeys.includes(key) && typeof value === 'string') {
                tags.push(`${key}:${value}`);
            }
        }
        return tags;
    }
    async getPOILayerMetadata(poiId) {
        const metadata = [];
        const staticData = await this.getStaticLayerData(poiId);
        if (staticData) {
            metadata.push({
                layerType: poi_layer_interface_1.POILayerType.STATIC,
                source: staticData.source,
                updateFrequency: 'static',
                lastUpdated: staticData.updatedAt,
                qualityScore: this.calculateQualityScore(staticData),
                usableForRouteGeneration: true,
            });
        }
        const semiDynamicData = await this.getSemiDynamicLayerData(poiId);
        if (semiDynamicData) {
            metadata.push({
                layerType: poi_layer_interface_1.POILayerType.SEMI_DYNAMIC,
                source: 'poi_canonical',
                updateFrequency: 'daily',
                lastUpdated: semiDynamicData.updatedAt,
                qualityScore: this.calculateSemiDynamicQualityScore(semiDynamicData),
                usableForRouteGeneration: true,
            });
        }
        const highlyDynamicData = await this.getHighlyDynamicLayerData(poiId);
        if (highlyDynamicData) {
            metadata.push({
                layerType: poi_layer_interface_1.POILayerType.HIGHLY_DYNAMIC,
                source: 'external_api',
                updateFrequency: 'realtime',
                lastUpdated: highlyDynamicData.updatedAt,
                usableForRouteGeneration: false,
            });
        }
        return metadata;
    }
    calculateQualityScore(staticData) {
        let score = 0;
        if (staticData.name && staticData.name !== '未命名') {
            score += 20;
        }
        if (staticData.location.lat && staticData.location.lng) {
            score += 30;
        }
        if (staticData.category) {
            score += 20;
        }
        if (staticData.tags.length > 0) {
            score += Math.min(20, staticData.tags.length * 5);
        }
        if (staticData.location.address) {
            score += 10;
        }
        return Math.min(100, score);
    }
    calculateSemiDynamicQualityScore(semiDynamicData) {
        let score = 0;
        if (semiDynamicData.openingHours) {
            score += 40;
        }
        if (semiDynamicData.contact) {
            if (semiDynamicData.contact.phone)
                score += 15;
            if (semiDynamicData.contact.website)
                score += 15;
        }
        if (semiDynamicData.pricing) {
            score += 20;
        }
        if (semiDynamicData.rating) {
            score += 10;
        }
        return Math.min(100, score);
    }
    isUsableForRouteGeneration(poiId) {
        return this.getPOIForRouteGeneration(poiId).then(poi => poi !== null);
    }
    async filterUsablePOIs(poiIds) {
        const usableIds = [];
        for (const poiId of poiIds) {
            const usable = await this.isUsableForRouteGeneration(poiId);
            if (usable) {
                usableIds.push(poiId);
            }
        }
        return usableIds;
    }
};
exports.POILayerService = POILayerService;
exports.POILayerService = POILayerService = POILayerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], POILayerService);
//# sourceMappingURL=poi-layer.service.js.map