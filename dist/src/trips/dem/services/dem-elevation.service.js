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
    isInIcelandBounds(lat, lng) {
        return lat >= 63.3 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;
    }
    async getElevation(lat, lng, fallbackTable = 'geo_dem_xizang') {
        if (this.isInIcelandBounds(lat, lng)) {
            try {
                const icelandTableExists = await this.checkDEMTableExists('geo_dem_iceland_20m');
                if (icelandTableExists) {
                    const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_iceland_20m', 5327);
                    if (elevation !== null) {
                        this.logger.debug(`从冰岛20m DEM表获取海拔: ${elevation}m`);
                        return elevation;
                    }
                }
            }
            catch (error) {
                this.logger.debug(`冰岛DEM表查询失败，尝试其他表`);
            }
        }
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
    async queryElevationFromTable(lat, lng, demTable, rasterSrid = 4326) {
        try {
            let query;
            if (rasterSrid === 5327) {
                query = `
          SELECT ST_Value(
            rast, 
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
          )::INTEGER as elevation
          FROM ${demTable}
          WHERE ST_Intersects(
            rast, 
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
          )
          LIMIT 1;
        `;
            }
            else {
                query = `
          SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
          FROM ${demTable}
          WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
          LIMIT 1;
        `;
            }
            const result = await this.prisma.$queryRawUnsafe(query);
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
        const batchSize = 100;
        if (points.length <= batchSize) {
            return this.batchQueryElevations(points, fallbackTable);
        }
        const results = [];
        for (let i = 0; i < points.length; i += batchSize) {
            const batch = points.slice(i, i + batchSize);
            const batchResults = await this.batchQueryElevations(batch, fallbackTable);
            results.push(...batchResults);
        }
        return results;
    }
    async batchQueryElevations(points, fallbackTable = 'geo_dem_xizang') {
        if (points.length === 0) {
            return [];
        }
        const hasIcelandPoints = points.some(p => this.isInIcelandBounds(p.lat, p.lng));
        if (hasIcelandPoints) {
            try {
                const icelandTableExists = await this.checkDEMTableExists('geo_dem_iceland_20m');
                if (icelandTableExists) {
                    const results = await this.batchQueryFromTable(points, 'geo_dem_iceland_20m', 5327);
                    if (results.every(r => r !== null)) {
                        return results;
                    }
                }
            }
            catch (error) {
                this.logger.debug(`冰岛DEM表批量查询失败，尝试其他表`);
            }
        }
        try {
            const mergedTableExists = await this.checkDEMTableExists('geo_dem_cities_merged');
            if (mergedTableExists) {
                const results = await this.batchQueryFromTable(points, 'geo_dem_cities_merged');
                if (results.every(r => r !== null)) {
                    return results;
                }
            }
        }
        catch (error) {
            this.logger.debug(`合并城市DEM表批量查询失败，尝试后备表`);
        }
        try {
            const results = await this.batchQueryFromTable(points, fallbackTable);
            if (results.every(r => r !== null)) {
                return results;
            }
        }
        catch (error) {
            this.logger.debug(`区域DEM表批量查询失败，尝试全球表`);
        }
        try {
            const globalTableExists = await this.checkDEMTableExists('geo_dem_global');
            if (globalTableExists) {
                return await this.batchQueryFromTable(points, 'geo_dem_global');
            }
        }
        catch (error) {
            this.logger.debug(`全球DEM表批量查询失败`);
        }
        return new Array(points.length).fill(null);
    }
    async batchQueryFromTable(points, demTable, srid = 4326) {
        try {
            const lngs = points.map(p => p.lng);
            const lats = points.map(p => p.lat);
            const query = `
        WITH points AS (
          SELECT 
            row_number() OVER () as idx,
            ST_SetSRID(ST_MakePoint(lng, lat), ${srid}) as geom
          FROM unnest($1::float[], $2::float[]) AS t(lng, lat)
        )
        SELECT 
          p.idx,
          ST_Value(r.rast, p.geom)::INTEGER as elevation
        FROM points p
        CROSS JOIN LATERAL (
          SELECT rast
          FROM ${demTable}
          WHERE ST_Intersects(rast, p.geom)
          LIMIT 1
        ) r
        ORDER BY p.idx;
      `;
            const result = await this.prisma.$queryRawUnsafe(query, lngs, lats);
            const elevationMap = new Map();
            for (const row of result) {
                elevationMap.set(row.idx, row.elevation !== null ? Math.round(row.elevation) : null);
            }
            return points.map((_, idx) => { var _a; return (_a = elevationMap.get(idx + 1)) !== null && _a !== void 0 ? _a : null; });
        }
        catch (error) {
            this.logger.warn(`批量查询DEM失败 (表: ${demTable}): ${error.message}`);
            return new Array(points.length).fill(null);
        }
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