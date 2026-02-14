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
var GeoCheckHazardZonesSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoCheckHazardZonesSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let GeoCheckHazardZonesSkill = GeoCheckHazardZonesSkill_1 = class GeoCheckHazardZonesSkill {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoCheckHazardZonesSkill_1.name);
        this.metadata = {
            name: 'geo.checkHazardZones',
            description: '检查危险区域：Abu 统一读取危险区域信息，检查路线是否经过危险区域',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'DOMAIN',
        };
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，geo.checkHazardZones 功能将受限');
        }
    }
    async execute(input) {
        const startTime = Date.now();
        this.logger.debug(`执行 geo.checkHazardZones: countryCode=${input.countryCode}, routePoints=${input.route.length}`);
        try {
            if (!this.prisma) {
                throw new Error('PrismaService 未注入，无法执行查询');
            }
            const MAX_ROUTE_POINTS = 5000;
            const MAX_BUFFER_RADIUS = 10000;
            const validatedBufferRadius = Math.min(input.bufferRadius || 1000, MAX_BUFFER_RADIUS);
            if (input.route.length < 2) {
                throw new Error('路线点数组至少需要 2 个点');
            }
            if (input.route.length > MAX_ROUTE_POINTS) {
                throw new Error(`路线点数量不能超过 ${MAX_ROUTE_POINTS} 个`);
            }
            const dbHazardZones = await this.queryHazardZonesFromDatabase(input.route, input.countryCode, input.month, input.minLevel, input.hazardTypes, validatedBufferRadius);
            const hazardZones = dbHazardZones.map((zone) => {
                var _a;
                let location;
                if (zone.geom) {
                    try {
                        if (typeof zone.geom === 'object' && 'coordinates' in zone.geom) {
                            const coords = zone.geom.coordinates;
                            if (Array.isArray(coords) && coords.length >= 2) {
                                location = { lng: coords[0], lat: coords[1] };
                            }
                        }
                    }
                    catch (error) {
                        this.logger.warn(`无法提取危险区域 ${zone.zoneId} 的位置信息`);
                    }
                }
                return {
                    zoneId: zone.zoneId,
                    type: zone.type,
                    level: zone.level,
                    location,
                    seasonality: zone.seasonality,
                    description: (_a = zone.metadata) === null || _a === void 0 ? void 0 : _a.description,
                    metadata: zone.metadata,
                };
            });
            const highRiskZones = hazardZones.filter((z) => z.level === 'HIGH');
            const mediumRiskZones = hazardZones.filter((z) => z.level === 'MEDIUM');
            const seasonalHighRiskZones = input.month
                ? highRiskZones.filter((z) => { var _a, _b; return (_b = (_a = z.seasonality) === null || _a === void 0 ? void 0 : _a.highRiskMonths) === null || _b === void 0 ? void 0 : _b.includes(input.month); })
                : highRiskZones;
            const riskAssessment = {
                hasHighRisk: seasonalHighRiskZones.length > 0,
                hasMediumRisk: mediumRiskZones.length > 0,
                totalHazards: hazardZones.length,
                highRiskCount: seasonalHighRiskZones.length,
                mediumRiskCount: mediumRiskZones.length,
                affectedSegments: hazardZones.length,
            };
            const queryTime = Date.now() - startTime;
            this.logger.debug(`geo.checkHazardZones 查询完成: 找到 ${hazardZones.length} 个危险区域，耗时 ${queryTime}ms`);
            return {
                hazardZones,
                riskAssessment,
                summary: {
                    routeLength: input.route.length,
                    checkedZones: hazardZones.length,
                    queryTime,
                },
            };
        }
        catch (error) {
            this.logger.error(`geo.checkHazardZones 查询失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async queryHazardZonesFromDatabase(route, countryCode, month, minLevel, hazardTypes, bufferRadius = 1000) {
        var _a, _b, _c;
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，无法查询危险区域');
            return [];
        }
        try {
            const routePoints = route.map((point) => client_1.Prisma.sql `ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)`);
            const routeLine = client_1.Prisma.sql `ST_MakeLine(ARRAY[${client_1.Prisma.join(routePoints, ', ')}]::geometry[])`;
            const levelFilter = minLevel
                ? client_1.Prisma.sql `AND (
          CASE hz.level
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END >= CASE ${minLevel}
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END
        )`
                : client_1.Prisma.sql ``;
            const typeFilter = hazardTypes && hazardTypes.length > 0
                ? client_1.Prisma.sql `AND hz.type = ANY(${hazardTypes}::VARCHAR[])`
                : client_1.Prisma.sql ``;
            const seasonalityFilter = month
                ? client_1.Prisma.sql `AND (
          hz.seasonality->'highRiskMonths' @> ${JSON.stringify([month])}::jsonb
          OR NOT (hz.seasonality->'lowRiskMonths' @> ${JSON.stringify([month])}::jsonb)
          OR hz.seasonality IS NULL
        )`
                : client_1.Prisma.sql ``;
            const results = await this.prisma.$queryRaw `
        SELECT
          hz.id,
          hz.zone_id,
          hz.country_code,
          hz.type,
          hz.level,
          hz.geom,
          hz.seasonality,
          hz.description,
          hz.metadata
        FROM hazard_zones hz
        WHERE
          hz.country_code = ${countryCode}
          AND hz.geom IS NOT NULL
          AND ST_DWithin(
            hz.geom::geography,
            ${routeLine}::geography,
            ${bufferRadius}
          )
          ${levelFilter}
          ${typeFilter}
          ${seasonalityFilter}
        ORDER BY
          CASE hz.level
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END DESC,
          ST_Distance(hz.geom::geography, ${routeLine}::geography) ASC
        LIMIT 100;
      `;
            return results.map((row) => ({
                zoneId: row.zone_id,
                type: row.type,
                level: row.level,
                seasonality: row.seasonality
                    ? {
                        highRiskMonths: row.seasonality.highRiskMonths || [],
                        lowRiskMonths: row.seasonality.lowRiskMonths || [],
                    }
                    : undefined,
                geom: row.geom,
                metadata: row.metadata || {},
            }));
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('relation')) || ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('table'))) {
                this.logger.warn('hazard_zones 表不存在，返回空结果。请运行数据库迁移创建表。');
                return [];
            }
            this.logger.error(`查询危险区域失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.GeoCheckHazardZonesSkill = GeoCheckHazardZonesSkill;
exports.GeoCheckHazardZonesSkill = GeoCheckHazardZonesSkill = GeoCheckHazardZonesSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoCheckHazardZonesSkill);
//# sourceMappingURL=geo-check-hazard-zones.skill.js.map