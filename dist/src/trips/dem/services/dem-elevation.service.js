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
var DEMElevationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMElevationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DEMElevationService = DEMElevationService_1 = class DEMElevationService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DEMElevationService_1.name);
    }
    async findCityDEMTables(lat, lng) {
        try {
            const tables = await this.prisma.$queryRawUnsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name LIKE 'geo_dem_city_%'
        ORDER BY table_name;
      `);
            const matchingTables = [];
            for (const table of tables) {
                try {
                    const bounds = await this.getDEMBounds(table.table_name);
                    if (bounds &&
                        lat >= bounds.minLat && lat <= bounds.maxLat &&
                        lng >= bounds.minLng && lng <= bounds.maxLng) {
                        matchingTables.push(table.table_name);
                    }
                }
                catch (error) {
                }
            }
            return matchingTables;
        }
        catch (error) {
            this.logger.debug(`查找城市 DEM 表失败:`, error instanceof Error ? error.message : error);
            return [];
        }
    }
    async getElevation(lat, lng, fallbackTable = 'geo_dem_xizang') {
        try {
            const mergedTableExists = await this.checkDEMTableExists('geo_dem_cities_merged');
            if (mergedTableExists) {
                const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_cities_merged');
                if (elevation !== null) {
                    this.logger.debug(`从合并城市DEM表获取海拔: ${elevation}m`);
                    return elevation;
                }
            }
        }
        catch (error) {
            this.logger.debug(`合并城市DEM表查询失败，尝试后备表`);
        }
        if (fallbackTable) {
            try {
                const elevation = await this.queryElevationFromTable(lat, lng, fallbackTable);
                if (elevation !== null) {
                    this.logger.debug(`从区域后备表 ${fallbackTable} 获取海拔: ${elevation}m`);
                    return elevation;
                }
            }
            catch (error) {
                this.logger.debug(`区域后备表 ${fallbackTable} 查询失败`);
            }
        }
        try {
            const globalTableExists = await this.checkDEMTableExists('geo_dem_global');
            if (globalTableExists) {
                const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_global');
                if (elevation !== null) {
                    this.logger.debug(`从全球DEM表获取海拔: ${elevation}m`);
                    return elevation;
                }
            }
        }
        catch (error) {
            this.logger.debug(`全球DEM表查询失败`);
        }
        return null;
    }
    async queryElevationFromTable(lat, lng, demTable) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
        FROM ${demTable}
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
            if (result.length === 0 || result[0].elevation === null) {
                return null;
            }
            return Math.round(result[0].elevation);
        }
        catch (error) {
            if (error instanceof Error && (error.message.includes('does not exist') ||
                error.message.includes('relation') ||
                error.message.includes('table'))) {
                return null;
            }
            throw error;
        }
    }
    async getElevations(points, fallbackTable = 'geo_dem_xizang') {
        if (points.length === 0) {
            return [];
        }
        const results = await Promise.all(points.map(point => this.getElevation(point.lat, point.lng, fallbackTable)));
        return results;
    }
    async checkDEMTableExists(demTable = 'geo_dem_xizang') {
        var _a;
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${demTable}'
        );
      `);
            return ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.exists) || false;
        }
        catch (error) {
            return false;
        }
    }
    async getDEMBounds(demTable = 'geo_dem_xizang') {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT 
          ST_YMin(ST_Envelope(ST_Union(rast))) as min_lat,
          ST_YMax(ST_Envelope(ST_Union(rast))) as max_lat,
          ST_XMin(ST_Envelope(ST_Union(rast))) as min_lng,
          ST_XMax(ST_Envelope(ST_Union(rast))) as max_lng
        FROM ${demTable};
      `);
            if (result.length === 0 || !result[0].min_lat) {
                return null;
            }
            return {
                minLat: result[0].min_lat,
                maxLat: result[0].max_lat,
                minLng: result[0].min_lng,
                maxLng: result[0].max_lng,
            };
        }
        catch (error) {
            this.logger.warn(`获取 DEM 边界失败:`, error instanceof Error ? error.message : error);
            return null;
        }
    }
};
exports.DEMElevationService = DEMElevationService;
exports.DEMElevationService = DEMElevationService = DEMElevationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DEMElevationService);
//# sourceMappingURL=dem-elevation.service.js.map