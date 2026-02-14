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
var GapPreferencesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GapPreferencesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../../prisma/prisma.service");
let GapPreferencesService = GapPreferencesService_1 = class GapPreferencesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GapPreferencesService_1.name);
    }
    async getPreferences(userId, tripId, sessionId) {
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                return {
                    collapsed: false,
                    showOnlyCritical: false,
                    filterTypes: [],
                    ignoredPatterns: [],
                };
            }
            let preferences = null;
            if (sessionId) {
                preferences = await this.prisma.$queryRaw `
          SELECT * FROM trip_planner_gap_preferences
          WHERE user_id = ${userId}::UUID
            AND session_id = ${sessionId}::VARCHAR
          LIMIT 1
        `;
            }
            if (!preferences && tripId) {
                preferences = await this.prisma.$queryRaw `
          SELECT * FROM trip_planner_gap_preferences
          WHERE user_id = ${userId}::UUID
            AND trip_id = ${tripId}::VARCHAR
            AND session_id IS NULL
          LIMIT 1
        `;
            }
            if (!preferences) {
                preferences = await this.prisma.$queryRaw `
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
            return {
                collapsed: false,
                showOnlyCritical: false,
                filterTypes: [],
                ignoredPatterns: [],
            };
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 获取偏好失败: ${error.message}`, error.stack);
            return {
                collapsed: false,
                showOnlyCritical: false,
                filterTypes: [],
                ignoredPatterns: [],
            };
        }
    }
    async updatePreferences(userId, preferences, tripId, sessionId) {
        var _a, _b, _c, _d;
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                this.logger.warn(`[缺口偏好] anonymous 用户无法保存偏好`);
                return {
                    collapsed: (_a = preferences.collapsed) !== null && _a !== void 0 ? _a : false,
                    showOnlyCritical: (_b = preferences.showOnlyCritical) !== null && _b !== void 0 ? _b : false,
                    filterTypes: preferences.filterTypes || [],
                    ignoredPatterns: preferences.ignoredPatterns || [],
                };
            }
            const now = new Date().toISOString();
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
      `, userId, tripId || null, sessionId || null, (_c = preferences.collapsed) !== null && _c !== void 0 ? _c : false, (_d = preferences.showOnlyCritical) !== null && _d !== void 0 ? _d : false, JSON.stringify(preferences.filterTypes || []), JSON.stringify(preferences.ignoredPatterns || []), now);
            this.logger.debug(`[缺口偏好] 偏好已更新: userId=${userId}, tripId=${tripId || 'null'}`);
            return await this.getPreferences(userId, tripId, sessionId);
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 更新偏好失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async ignoreGap(userId, gapId, gapType, pattern, tripId) {
        try {
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
      `, userId, tripId || null, gapId, gapType, JSON.stringify(gapPattern), now);
            this.logger.debug(`[缺口偏好] 缺口已忽略: userId=${userId}, gapId=${gapId}, gapType=${gapType}`);
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 忽略缺口失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async ignoreGapsBatch(userId, gapIds, gapType, pattern, tripId) {
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                this.logger.warn(`[缺口偏好] anonymous 用户无法批量忽略缺口`);
                return 0;
            }
            if (gapIds.length === 0) {
                return 0;
            }
            const now = new Date().toISOString();
            const finalGapType = gapType || 'MEAL';
            const gapPattern = pattern || { type: finalGapType };
            const patternJson = JSON.stringify(gapPattern);
            return await this.prisma.$transaction(async (tx) => {
                let ignoredCount = 0;
                const batchSize = 100;
                for (let i = 0; i < gapIds.length; i += batchSize) {
                    const batch = gapIds.slice(i, i + batchSize);
                    try {
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
                `, userId, tripId || null, gapId, finalGapType, patternJson, now);
                                ignoredCount++;
                            }
                            catch (err) {
                                this.logger.warn(`[缺口偏好] 忽略缺口失败: gapId=${gapId}, error=${err.message}`);
                            }
                        }
                    }
                    catch (error) {
                        this.logger.warn(`[缺口偏好] 批量插入失败: ${error.message}`);
                    }
                }
                this.logger.debug(`[缺口偏好] 批量忽略完成: userId=${userId}, count=${ignoredCount}/${gapIds.length}`);
                return ignoredCount;
            });
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 批量忽略失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async isGapIgnored(userId, gap, tripId) {
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                return false;
            }
            const byId = await this.prisma.$queryRaw `
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
            const patterns = await this.prisma.$queryRaw `
        SELECT gap_pattern FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_type = ${gap.type}::VARCHAR
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
            for (const row of patterns) {
                const pattern = row.gap_pattern;
                if (this.matchesPattern(gap, pattern)) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 检查忽略状态失败: ${error.message}`, error.stack);
            return false;
        }
    }
    async filterIgnoredGaps(userId, gaps, tripId) {
        if (!gaps || gaps.length === 0) {
            return [];
        }
        try {
            const gapIds = gaps.map(g => g.id);
            const ignoredByIds = await this.prisma.$queryRaw `
        SELECT DISTINCT gap_id
        FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_id = ANY(${gapIds}::VARCHAR[])
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
            const ignoredIdSet = new Set(ignoredByIds.map(row => row.gap_id));
            const ignoredPatterns = await this.prisma.$queryRaw `
        SELECT gap_type, gap_pattern
        FROM trip_planner_ignored_gaps
        WHERE user_id = ${userId}::UUID
          AND gap_type = ANY(${Array.from(new Set(gaps.map(g => g.type)))}::VARCHAR[])
          AND (trip_id = ${tripId || null}::VARCHAR OR trip_id IS NULL)
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
            const filtered = [];
            for (const gap of gaps) {
                if (ignoredIdSet.has(gap.id)) {
                    continue;
                }
                let matchesPattern = false;
                for (const row of ignoredPatterns) {
                    if (row.gap_type === gap.type) {
                        const pattern = row.gap_pattern;
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
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 批量过滤失败，回退到逐条检查: ${error.message}`);
            const filtered = [];
            for (const gap of gaps) {
                const isIgnored = await this.isGapIgnored(userId, gap, tripId);
                if (!isIgnored) {
                    filtered.push(gap);
                }
            }
            return filtered;
        }
    }
    async unignoreGap(userId, gapId, tripId) {
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                this.logger.warn(`[缺口偏好] anonymous 用户无法取消忽略`);
                return;
            }
            await this.prisma.$executeRawUnsafe(`
        DELETE FROM trip_planner_ignored_gaps
        WHERE user_id = $1::UUID
          AND gap_id = $2::VARCHAR
          AND (trip_id = ${tripId ? `$3::VARCHAR` : 'NULL'} OR trip_id IS NULL)
      `, userId, gapId, tripId || null);
            this.logger.debug(`[缺口偏好] 取消忽略: userId=${userId}, gapId=${gapId}`);
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 取消忽略失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async unignoreGapsBatch(userId, gapIds, tripId) {
        try {
            if (userId === 'anonymous' || !this.isValidUUID(userId)) {
                this.logger.warn(`[缺口偏好] anonymous 用户无法批量取消忽略`);
                return 0;
            }
            if (gapIds.length === 0) {
                return 0;
            }
            return await this.prisma.$transaction(async (tx) => {
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
            `, userId, batch, tripId || null);
                        unignoredCount += Number(result) || batch.length;
                    }
                    catch (error) {
                        this.logger.warn(`[缺口偏好] 批量删除失败，回退到逐条删除: ${error.message}`);
                        for (const gapId of batch) {
                            try {
                                await tx.$executeRawUnsafe(`
                  DELETE FROM trip_planner_ignored_gaps
                  WHERE user_id = $1::UUID
                    AND gap_id = $2::VARCHAR
                    AND (trip_id = ${tripId ? `$3::VARCHAR` : 'NULL'} OR trip_id IS NULL)
                `, userId, gapId, tripId || null);
                                unignoredCount++;
                            }
                            catch (err) {
                                this.logger.warn(`[缺口偏好] 取消忽略失败: gapId=${gapId}, error=${err.message}`);
                            }
                        }
                    }
                }
                this.logger.debug(`[缺口偏好] 批量取消忽略完成: userId=${userId}, count=${unignoredCount}/${gapIds.length}`);
                return unignoredCount;
            });
        }
        catch (error) {
            this.logger.error(`[缺口偏好] 批量取消忽略失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }
    matchesPattern(gap, pattern) {
        if (pattern.type !== gap.type) {
            return false;
        }
        if (pattern.timeSlot) {
            const gapStart = gap.timeSlot.start;
            const gapEnd = gap.timeSlot.end;
            const patternStart = pattern.timeSlot.start;
            const patternEnd = pattern.timeSlot.end;
            if (gapStart !== patternStart || gapEnd !== patternEnd) {
                return false;
            }
        }
        if (pattern.severity && pattern.severity !== gap.severity) {
            return false;
        }
        return true;
    }
};
exports.GapPreferencesService = GapPreferencesService;
exports.GapPreferencesService = GapPreferencesService = GapPreferencesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GapPreferencesService);
//# sourceMappingURL=gap-preferences.service.js.map