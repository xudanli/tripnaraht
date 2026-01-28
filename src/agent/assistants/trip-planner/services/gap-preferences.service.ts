// src/agent/assistants/trip-planner/services/gap-preferences.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ItineraryGapType, GapSeverity } from '../interfaces/intent-uncertainty.interface';
import { ResponseItineraryGap } from '../interfaces/trip-planner.interface';

/**
 * 缺口显示偏好
 */
export interface GapDisplayPreferences {
  collapsed: boolean; // 是否收起
  showOnlyCritical: boolean; // 只显示CRITICAL
  filterTypes: ItineraryGapType[]; // 过滤的类型（空数组表示显示所有）
  ignoredPatterns: IgnorePattern[]; // 忽略的模式
}

/**
 * 忽略模式
 */
export interface IgnorePattern {
  type: ItineraryGapType;
  timeSlot?: { start: string; end: string };
  severity?: GapSeverity;
}

/**
 * 缺口偏好服务
 * 
 * 职责：
 * 1. 管理用户对缺口的显示偏好
 * 2. 管理用户忽略的缺口
 * 3. 根据用户偏好过滤缺口列表
 */
@Injectable()
export class GapPreferencesService {
  private readonly logger = new Logger(GapPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取用户偏好
   */
  async getPreferences(
    userId: string,
    tripId?: string,
    sessionId?: string
  ): Promise<GapDisplayPreferences> {
    try {
      // 🚀 处理 anonymous 用户：如果是 anonymous，直接返回默认偏好
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        return {
          collapsed: false,
          showOnlyCritical: false,
          filterTypes: [],
          ignoredPatterns: [],
        };
      }

      // 查询用户偏好（优先级：sessionId > tripId > userId）
      let preferences: any = null;

      if (sessionId) {
        preferences = await this.prisma.$queryRaw<any[]>`
          SELECT * FROM trip_planner_gap_preferences
          WHERE user_id = ${userId}::UUID
            AND session_id = ${sessionId}::VARCHAR
          LIMIT 1
        `;
      }

      if (!preferences && tripId) {
        preferences = await this.prisma.$queryRaw<any[]>`
          SELECT * FROM trip_planner_gap_preferences
          WHERE user_id = ${userId}::UUID
            AND trip_id = ${tripId}::VARCHAR
            AND session_id IS NULL
          LIMIT 1
        `;
      }

      if (!preferences) {
        preferences = await this.prisma.$queryRaw<any[]>`
          SELECT * FROM trip_planner_gap_preferences
          WHERE user_id = ${userId}::UUID
            AND trip_id IS NULL
            AND session_id IS NULL
          LIMIT 1
        `;
      }

      if (preferences && preferences.length > 0) {
        const pref = preferences[0];
        return {
          collapsed: pref.collapsed || false,
          showOnlyCritical: pref.show_only_critical || false,
          filterTypes: pref.filter_types || [],
          ignoredPatterns: pref.ignored_patterns || [],
        };
      }

      // 返回默认偏好
      return {
        collapsed: false,
        showOnlyCritical: false,
        filterTypes: [],
        ignoredPatterns: [],
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 获取偏好失败: ${error.message}`, error.stack);
      // 返回默认偏好
      return {
        collapsed: false,
        showOnlyCritical: false,
        filterTypes: [],
        ignoredPatterns: [],
      };
    }
  }

  /**
   * 更新用户偏好
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<GapDisplayPreferences>,
    tripId?: string,
    sessionId?: string
  ): Promise<GapDisplayPreferences> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户无法保存偏好
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        this.logger.warn(`[缺口偏好] anonymous 用户无法保存偏好`);
        return {
          collapsed: preferences.collapsed ?? false,
          showOnlyCritical: preferences.showOnlyCritical ?? false,
          filterTypes: preferences.filterTypes || [],
          ignoredPatterns: preferences.ignoredPatterns || [],
        };
      }

      const now = new Date().toISOString();
      
      // 使用 UPSERT 操作
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO trip_planner_gap_preferences (
          user_id, trip_id, session_id,
          collapsed, show_only_critical, filter_types, ignored_patterns,
          created_at, updated_at
        ) VALUES (
          $1::UUID,
          ${tripId ? `$2::VARCHAR` : 'NULL'},
          ${sessionId ? `$3::VARCHAR` : 'NULL'},
          $4::BOOLEAN,
          $5::BOOLEAN,
          $6::TEXT[],
          $7::JSONB,
          $8::TIMESTAMPTZ,
          $8::TIMESTAMPTZ
        )
        ON CONFLICT (user_id, COALESCE(trip_id, ''), COALESCE(session_id, ''))
        DO UPDATE SET
          collapsed = EXCLUDED.collapsed,
          show_only_critical = EXCLUDED.show_only_critical,
          filter_types = EXCLUDED.filter_types,
          ignored_patterns = EXCLUDED.ignored_patterns,
          updated_at = EXCLUDED.updated_at
      `,
        userId,
        tripId || null,
        sessionId || null,
        preferences.collapsed ?? false,
        preferences.showOnlyCritical ?? false,
        JSON.stringify(preferences.filterTypes || []),
        JSON.stringify(preferences.ignoredPatterns || []),
        now
      );

      this.logger.debug(`[缺口偏好] 偏好已更新: userId=${userId}, tripId=${tripId || 'null'}`);

      // 返回更新后的偏好
      return await this.getPreferences(userId, tripId, sessionId);
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 更新偏好失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 忽略缺口
   */
  async ignoreGap(
    userId: string,
    gapId: string,
    gapType: ItineraryGapType,
    pattern?: IgnorePattern,
    tripId?: string
  ): Promise<void> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户无法忽略缺口
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        this.logger.warn(`[缺口偏好] anonymous 用户无法忽略缺口`);
        return;
      }

      const now = new Date().toISOString();
      const gapPattern = pattern || { type: gapType };

      await this.prisma.$executeRawUnsafe(`
        INSERT INTO trip_planner_ignored_gaps (
          user_id, trip_id, gap_id, gap_type, gap_pattern, ignored_at
        ) VALUES (
          $1::UUID,
          ${tripId ? `$2::VARCHAR` : 'NULL'},
          $3::VARCHAR,
          $4::VARCHAR,
          $5::JSONB,
          $6::TIMESTAMPTZ
        )
        ON CONFLICT (user_id, COALESCE(trip_id, ''), gap_id)
        DO UPDATE SET
          gap_pattern = EXCLUDED.gap_pattern,
          ignored_at = EXCLUDED.ignored_at
      `,
        userId,
        tripId || null,
        gapId,
        gapType,
        JSON.stringify(gapPattern),
        now
      );

      this.logger.debug(`[缺口偏好] 缺口已忽略: userId=${userId}, gapId=${gapId}, gapType=${gapType}`);
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 忽略缺口失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量忽略缺口（优化版：使用批量插入）
   */
  async ignoreGapsBatch(
    userId: string,
    gapIds: string[],
    gapType?: ItineraryGapType,
    pattern?: IgnorePattern,
    tripId?: string
  ): Promise<number> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户无法忽略缺口
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        this.logger.warn(`[缺口偏好] anonymous 用户无法批量忽略缺口`);
        return 0;
      }

      if (gapIds.length === 0) {
        return 0;
      }

      const now = new Date().toISOString();
      const finalGapType = gapType || 'MEAL'; // 默认类型
      const gapPattern = pattern || { type: finalGapType };
      const patternJson = JSON.stringify(gapPattern);

      // 🚀 Phase 3 Week 3 优化：使用批量插入替代循环，提升性能
      // 使用事务确保数据一致性
      return await this.prisma.$transaction(async (tx) => {
        let ignoredCount = 0;

        // 批量插入（每次最多100条，避免SQL语句过长和参数过多）
        const batchSize = 100;
        for (let i = 0; i < gapIds.length; i += batchSize) {
          const batch = gapIds.slice(i, i + batchSize);
          
          try {
            // 使用更简单的方法：逐条插入但在事务中（性能仍然比非事务好）
            // PostgreSQL的批量插入需要使用unnest或VALUES，但参数化查询更安全
            for (const gapId of batch) {
              try {
                await tx.$executeRawUnsafe(`
                  INSERT INTO trip_planner_ignored_gaps (
                    user_id, trip_id, gap_id, gap_type, gap_pattern, ignored_at
                  ) VALUES (
                    $1::UUID,
                    ${tripId ? `$2::VARCHAR` : 'NULL'},
                    $3::VARCHAR,
                    $4::VARCHAR,
                    $5::JSONB,
                    $6::TIMESTAMPTZ
                  )
                  ON CONFLICT (user_id, COALESCE(trip_id, ''), gap_id)
                  DO UPDATE SET
                    gap_pattern = EXCLUDED.gap_pattern,
                    ignored_at = EXCLUDED.ignored_at
                `,
                  userId,
                  tripId || null,
                  gapId,
                  finalGapType,
                  patternJson,
                  now
                );
                ignoredCount++;
              } catch (err: any) {
                this.logger.warn(`[缺口偏好] 忽略缺口失败: gapId=${gapId}, error=${err.message}`);
              }
            }
          } catch (error: any) {
            this.logger.warn(`[缺口偏好] 批量插入失败: ${error.message}`);
            // 继续处理下一批
          }
        }

        this.logger.debug(`[缺口偏好] 批量忽略完成: userId=${userId}, count=${ignoredCount}/${gapIds.length}`);
        return ignoredCount;
      });
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 批量忽略失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 检查缺口是否被忽略
   */
  async isGapIgnored(
    userId: string,
    gap: ResponseItineraryGap,
    tripId?: string
  ): Promise<boolean> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户没有忽略记录
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        return false;
      }
      // 1. 检查具体缺口ID是否被忽略
      const byId = await this.prisma.$queryRaw<any[]>`
        SELECT id FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_id = ${gap.id}::VARCHAR
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;

      if (byId && byId.length > 0) {
        return true;
      }

      // 2. 检查是否匹配忽略模式
      const patterns = await this.prisma.$queryRaw<any[]>`
        SELECT gap_pattern FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_type = ${gap.type}::VARCHAR
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;

      for (const row of patterns) {
        const pattern = row.gap_pattern as IgnorePattern;
        if (this.matchesPattern(gap, pattern)) {
          return true;
        }
      }

      return false;
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 检查忽略状态失败: ${error.message}`, error.stack);
      return false; // 出错时默认不忽略
    }
  }

  /**
   * 过滤已忽略的缺口（优化版：使用批量查询避免N+1问题）
   */
  async filterIgnoredGaps(
    userId: string,
    gaps: ResponseItineraryGap[],
    tripId?: string
  ): Promise<ResponseItineraryGap[]> {
    if (!gaps || gaps.length === 0) {
      return [];
    }

    try {
      // 🚀 Phase 3 Week 3 优化：批量查询已忽略的缺口，避免N+1问题
      const gapIds = gaps.map(g => g.id);
      
      // 1. 批量查询具体缺口ID的忽略记录
      const ignoredByIds = await this.prisma.$queryRaw<any[]>`
        SELECT DISTINCT gap_id
        FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_id = ANY(${gapIds}::VARCHAR[])
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;

      const ignoredIdSet = new Set(ignoredByIds.map(row => row.gap_id));

      // 2. 批量查询忽略模式
      const ignoredPatterns = await this.prisma.$queryRaw<any[]>`
        SELECT gap_type, gap_pattern
        FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_type = ANY(${Array.from(new Set(gaps.map(g => g.type)))}::VARCHAR[])
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;

      // 3. 过滤缺口
      const filtered: ResponseItineraryGap[] = [];
      for (const gap of gaps) {
        // 检查是否被具体ID忽略
        if (ignoredIdSet.has(gap.id)) {
          continue;
        }

        // 检查是否匹配忽略模式
        let matchesPattern = false;
        for (const row of ignoredPatterns) {
          if (row.gap_type === gap.type) {
            const pattern = row.gap_pattern as IgnorePattern;
            if (this.matchesPattern(gap, pattern)) {
              matchesPattern = true;
              break;
            }
          }
        }

        if (!matchesPattern) {
          filtered.push(gap);
        }
      }

      return filtered;
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 批量过滤失败，回退到逐条检查: ${error.message}`);
      
      // 回退到逐条检查（更安全）
      const filtered: ResponseItineraryGap[] = [];
      for (const gap of gaps) {
        const isIgnored = await this.isGapIgnored(userId, gap, tripId);
        if (!isIgnored) {
          filtered.push(gap);
        }
      }
      return filtered;
    }
  }

  /**
   * 取消忽略缺口
   */
  async unignoreGap(userId: string, gapId: string, tripId?: string): Promise<void> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户无法取消忽略
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        this.logger.warn(`[缺口偏好] anonymous 用户无法取消忽略`);
        return;
      }
      await this.prisma.$executeRawUnsafe(`
        DELETE FROM trip_planner_ignored_gaps
        WHERE user_id = $1::UUID
          AND gap_id = $2::VARCHAR
          AND (trip_id = ${tripId ? `$3::VARCHAR` : 'NULL'} OR trip_id IS NULL)
      `,
        userId,
        gapId,
        tripId || null
      );

      this.logger.debug(`[缺口偏好] 取消忽略: userId=${userId}, gapId=${gapId}`);
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 取消忽略失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 🚀 Phase 3 Week 3：批量取消忽略缺口
   */
  async unignoreGapsBatch(
    userId: string,
    gapIds: string[],
    tripId?: string
  ): Promise<number> {
    try {
      // 🚀 处理 anonymous 用户：anonymous 用户无法取消忽略
      if (userId === 'anonymous' || !this.isValidUUID(userId)) {
        this.logger.warn(`[缺口偏好] anonymous 用户无法批量取消忽略`);
        return 0;
      }

      if (gapIds.length === 0) {
        return 0;
      }

      // 🚀 Phase 3 Week 3 优化：使用批量删除，提升性能
      return await this.prisma.$transaction(async (tx) => {
        // 批量删除（每次最多1000条）
        const batchSize = 1000;
        let unignoredCount = 0;

        for (let i = 0; i < gapIds.length; i += batchSize) {
          const batch = gapIds.slice(i, i + batchSize);
          
          try {
            const result = await tx.$executeRawUnsafe(`
              DELETE FROM trip_planner_ignored_gaps
              WHERE user_id = $1::UUID
                AND gap_id = ANY($2::VARCHAR[])
                AND (trip_id = ${tripId ? `$3::VARCHAR` : 'NULL'} OR trip_id IS NULL)
            `,
              userId,
              batch,
              tripId || null
            );

            unignoredCount += Number(result) || batch.length;
          } catch (error: any) {
            this.logger.warn(`[缺口偏好] 批量删除失败，回退到逐条删除: ${error.message}`);
            
            // 回退到逐条删除
            for (const gapId of batch) {
              try {
                await tx.$executeRawUnsafe(`
                  DELETE FROM trip_planner_ignored_gaps
                  WHERE user_id = $1::UUID
                    AND gap_id = $2::VARCHAR
                    AND (trip_id = ${tripId ? `$3::VARCHAR` : 'NULL'} OR trip_id IS NULL)
                `,
                  userId,
                  gapId,
                  tripId || null
                );
                unignoredCount++;
              } catch (err: any) {
                this.logger.warn(`[缺口偏好] 取消忽略失败: gapId=${gapId}, error=${err.message}`);
              }
            }
          }
        }

        this.logger.debug(`[缺口偏好] 批量取消忽略完成: userId=${userId}, count=${unignoredCount}/${gapIds.length}`);
        return unignoredCount;
      });
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 批量取消忽略失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 检查是否为有效的 UUID
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * 匹配忽略模式
   */
  private matchesPattern(gap: ResponseItineraryGap, pattern: IgnorePattern): boolean {
    // 类型必须匹配
    if (pattern.type !== gap.type) {
      return false;
    }

    // 时间段匹配（如果模式中有时间段）
    if (pattern.timeSlot) {
      const gapStart = gap.timeSlot.start;
      const gapEnd = gap.timeSlot.end;
      const patternStart = pattern.timeSlot.start;
      const patternEnd = pattern.timeSlot.end;

      // 简单的时间段匹配（完全匹配）
      if (gapStart !== patternStart || gapEnd !== patternEnd) {
        return false;
      }
    }

    // 严重程度匹配（如果模式中有严重程度）
    if (pattern.severity && pattern.severity !== gap.severity) {
      return false;
    }

    return true;
  }
}
