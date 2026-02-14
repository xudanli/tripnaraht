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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceToPoiHelperService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const place_to_poi_service_1 = require("./place-to-poi.service");
let PlaceToPoiHelperService = class PlaceToPoiHelperService {
    constructor(prisma, placeToPoiService) {
        this.prisma = prisma;
        this.placeToPoiService = placeToPoiService;
    }
    async getPoiById(placeId) {
        const place = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p.uuid,
        p."nameEN",
        p.category,
        p.location::text AS location,
        p.address,
        p."cityId",
        p.metadata,
        p."physicalMetadata",
        p."googlePlaceId",
        p.rating,
        p."createdAt",
        p."updatedAt",
        p."nameCN",
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng
      FROM "Place" p
      WHERE p.id = ${placeId}
      LIMIT 1
    `;
        if (!place || place.length === 0) {
            return null;
        }
        return this.placeToPoiService.convert(place[0]);
    }
    async getPoisByIds(placeIds) {
        if (placeIds.length === 0) {
            return [];
        }
        const places = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p.uuid,
        p."nameEN",
        p.category,
        p.location::text AS location,
        p.address,
        p."cityId",
        p.metadata,
        p."physicalMetadata",
        p."googlePlaceId",
        p.rating,
        p."createdAt",
        p."updatedAt",
        p."nameCN",
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng
      FROM "Place" p
      WHERE p.id = ANY(${placeIds}::int[])
    `;
        return this.placeToPoiService.convertBatch(places);
    }
    async getPoisByCondition(where, limit) {
        const places = await this.prisma.place.findMany({
            where,
            select: { id: true },
            take: limit,
        });
        const placeIds = places.map((p) => p.id);
        if (placeIds.length === 0) {
            return [];
        }
        return this.getPoisByIds(placeIds);
    }
    async createPoiLookup(placeIds) {
        const pois = await this.getPoisByIds(placeIds);
        const poiMap = new Map();
        for (const poi of pois) {
            poiMap.set(poi.id, poi);
        }
        return {
            getPoiById: (id) => poiMap.get(id),
        };
    }
};
exports.PlaceToPoiHelperService = PlaceToPoiHelperService;
exports.PlaceToPoiHelperService = PlaceToPoiHelperService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        place_to_poi_service_1.PlaceToPoiService])
], PlaceToPoiHelperService);
//# sourceMappingURL=place-to-poi-helper.service.js.map