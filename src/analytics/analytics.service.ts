/**
 * Analytics Service
 * 
 * 数据分析服务，提供复杂的数据分析查询功能
 * 使用 PostgreSQL MCP 执行复杂 SQL 查询（多表 JOIN、聚合函数、窗口函数等）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostgreSQLMcpService } from '../mcp/postgresql-mcp.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly postgresqlMcp?: PostgreSQLMcpService,
  ) {}

  /**
   * 执行复杂的数据分析查询
   * 
   * 使用场景：
   * - 多表 JOIN 查询
   * - 聚合函数（SUM, AVG, COUNT）
   * - 窗口函数
   * - 子查询
   */
  async executeAnalyticsQuery(query: string, params?: any[]): Promise<any> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      // 降级：使用 Prisma $queryRaw（功能有限）
      this.logger.warn('PostgreSQL MCP service not available, falling back to Prisma $queryRaw');
      try {
        return await this.prisma.$queryRawUnsafe(query, ...(params || []));
      } catch (error: any) {
        this.logger.error(`Analytics query failed: ${error.message}`);
        throw error;
      }
    }

    try {
      const result = await this.postgresqlMcp.query(query, params);
      return result;
    } catch (error: any) {
      this.logger.error(`Analytics query failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取行程统计（复杂查询示例）
   */
  async getTripStatistics(startDate: Date, endDate: Date): Promise<any> {
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

  /**
   * 获取用户活跃度统计
   */
  async getUserActivityStats(startDate: Date, endDate: Date): Promise<any> {
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

  /**
   * 获取决策统计（多表 JOIN）
   */
  async getDecisionStatistics(startDate: Date, endDate: Date): Promise<any> {
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

  /**
   * 获取路线方向使用统计
   */
  async getRouteDirectionUsageStats(countryCode?: string): Promise<any> {
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

    const params: any[] = [];
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

  /**
   * 获取 POI 访问统计
   */
  async getPOIAccessStats(startDate: Date, endDate: Date): Promise<any> {
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
}
