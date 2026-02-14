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
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const postgresql_mcp_service_1 = require("../mcp/postgresql-mcp.service");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    constructor(prisma, postgresqlMcp) {
        this.prisma = prisma;
        this.postgresqlMcp = postgresqlMcp;
        this.logger = new common_1.Logger(AnalyticsService_1.name);
    }
    async executeAnalyticsQuery(query, params) {
        if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
            this.logger.warn('PostgreSQL MCP service not available, falling back to Prisma $queryRaw');
            try {
                return await this.prisma.$queryRawUnsafe(query, ...(params || []));
            }
            catch (error) {
                this.logger.error(`Analytics query failed: ${error.message}`);
                throw error;
            }
        }
        try {
            const result = await this.postgresqlMcp.query(query, params);
            return result;
        }
        catch (error) {
            this.logger.error(`Analytics query failed: ${error.message}`);
            throw error;
        }
    }
    async getTripStatistics(startDate, endDate) {
        const query = `
      SELECT 
        COUNT(*) as total_trips,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(EXTRACT(EPOCH FROM (end_date - start_date)) / 86400) as avg_duration_days,
        SUM(total_budget) as total_budget,
        AVG(total_budget) as avg_budget
      FROM "Trip"
      WHERE start_date >= $1 AND start_date <= $2
    `;
        return await this.executeAnalyticsQuery(query, [startDate, endDate]);
    }
    async getUserActivityStats(startDate, endDate) {
        const query = `
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(*) as total_actions
      FROM "Trip"
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;
        return await this.executeAnalyticsQuery(query, [startDate, endDate]);
    }
    async getDecisionStatistics(startDate, endDate) {
        const query = `
      SELECT 
        d.decision_type,
        COUNT(*) as total_decisions,
        COUNT(DISTINCT d.trip_id) as trips_with_decisions,
        AVG(d.confidence) as avg_confidence,
        COUNT(*) FILTER (WHERE d.status = 'ACCEPTED') as accepted_count,
        COUNT(*) FILTER (WHERE d.status = 'REJECTED') as rejected_count
      FROM "Decision" d
      INNER JOIN "Trip" t ON t.id = d.trip_id
      WHERE d.created_at >= $1 AND d.created_at <= $2
      GROUP BY d.decision_type
      ORDER BY total_decisions DESC
    `;
        return await this.executeAnalyticsQuery(query, [startDate, endDate]);
    }
    async getRouteDirectionUsageStats(countryCode) {
        let query = `
      SELECT 
        rd.name as route_name,
        rd.country_code,
        COUNT(DISTINCT trd.trip_id) as trip_count,
        COUNT(DISTINCT trd.user_id) as user_count,
        AVG(EXTRACT(EPOCH FROM (t.end_date - t.start_date)) / 86400) as avg_duration_days
      FROM "RouteDirection" rd
      LEFT JOIN "TripRouteDirection" trd ON trd.route_direction_id = rd.id
      LEFT JOIN "Trip" t ON t.id = trd.trip_id
    `;
        const params = [];
        if (countryCode) {
            query += ` WHERE rd.country_code = $1`;
            params.push(countryCode);
        }
        query += `
      GROUP BY rd.id, rd.name, rd.country_code
      ORDER BY trip_count DESC
      LIMIT 50
    `;
        return await this.executeAnalyticsQuery(query, params.length > 0 ? params : undefined);
    }
    async getPOIAccessStats(startDate, endDate) {
        const query = `
      SELECT 
        p.name as poi_name,
        p.category,
        COUNT(ii.id) as access_count,
        COUNT(DISTINCT ii.trip_day_id) as day_count,
        COUNT(DISTINCT t.id) as trip_count
      FROM "ItineraryItem" ii
      INNER JOIN "Place" p ON p.id = ii.place_id
      INNER JOIN "TripDay" td ON td.id = ii.trip_day_id
      INNER JOIN "Trip" t ON t.id = td.trip_id
      WHERE ii.created_at >= $1 AND ii.created_at <= $2
      GROUP BY p.id, p.name, p.category
      ORDER BY access_count DESC
      LIMIT 100
    `;
        return await this.executeAnalyticsQuery(query, [startDate, endDate]);
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        postgresql_mcp_service_1.PostgreSQLMcpService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map