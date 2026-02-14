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
var DecisionStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionStatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DecisionStatsService = DecisionStatsService_1 = class DecisionStatsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DecisionStatsService_1.name);
    }
    async getStatsByCountry(countryCode, startDate, endDate) {
        this.logger.debug(`统计决策分布（国家: ${countryCode || '全部'})`);
        const where = {};
        if (countryCode) {
            where.countryCode = countryCode;
        }
        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp.gte = startDate;
            }
            if (endDate) {
                where.timestamp.lte = endDate;
            }
        }
        const logs = await this.prisma.decisionLog.findMany({
            where,
            select: {
                decisionSource: true,
                countryCode: true,
            },
        });
        const totalDecisions = logs.length;
        const bySource = {
            PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
            HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
            PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
            HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
        };
        const bySourcePercentage = {
            PHYSICAL: totalDecisions > 0 ? bySource.PHYSICAL / totalDecisions : 0,
            HUMAN: totalDecisions > 0 ? bySource.HUMAN / totalDecisions : 0,
            PHILOSOPHY: totalDecisions > 0 ? bySource.PHILOSOPHY / totalDecisions : 0,
            HEURISTIC: totalDecisions > 0 ? bySource.HEURISTIC / totalDecisions : 0,
        };
        const realityDrivenRatio = totalDecisions > 0
            ? (bySource.PHYSICAL + bySource.HUMAN) / totalDecisions
            : 0;
        const detailsMap = new Map();
        for (const log of logs) {
            const key = `${log.countryCode || 'UNKNOWN'}_${log.decisionSource}`;
            const existing = detailsMap.get(key);
            if (existing) {
                existing.count++;
            }
            else {
                detailsMap.set(key, {
                    countryCode: log.countryCode || undefined,
                    decisionSource: log.decisionSource,
                    count: 1,
                });
            }
        }
        const details = Array.from(detailsMap.values()).map(item => ({
            countryCode: item.countryCode,
            decisionSource: item.decisionSource,
            decisionCount: item.count,
            percentage: totalDecisions > 0 ? item.count / totalDecisions : 0,
        }));
        return {
            totalDecisions,
            bySource,
            bySourcePercentage,
            realityDrivenRatio,
            details,
        };
    }
    async getStatsByRouteDirection(routeDirectionId, startDate, endDate) {
        this.logger.debug(`统计决策分布（路线: ${routeDirectionId || '全部'})`);
        const where = {};
        if (routeDirectionId) {
            where.routeDirectionId = routeDirectionId;
        }
        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp.gte = startDate;
            }
            if (endDate) {
                where.timestamp.lte = endDate;
            }
        }
        const logs = await this.prisma.decisionLog.findMany({
            where,
            select: {
                decisionSource: true,
                routeDirectionId: true,
            },
        });
        const totalDecisions = logs.length;
        const bySource = {
            PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
            HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
            PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
            HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
        };
        const bySourcePercentage = {
            PHYSICAL: totalDecisions > 0 ? bySource.PHYSICAL / totalDecisions : 0,
            HUMAN: totalDecisions > 0 ? bySource.HUMAN / totalDecisions : 0,
            PHILOSOPHY: totalDecisions > 0 ? bySource.PHILOSOPHY / totalDecisions : 0,
            HEURISTIC: totalDecisions > 0 ? bySource.HEURISTIC / totalDecisions : 0,
        };
        const realityDrivenRatio = totalDecisions > 0
            ? (bySource.PHYSICAL + bySource.HUMAN) / totalDecisions
            : 0;
        const details = [];
        if (routeDirectionId) {
            for (const source of ['PHYSICAL', 'HUMAN', 'PHILOSOPHY', 'HEURISTIC']) {
                const count = bySource[source];
                if (count > 0) {
                    details.push({
                        routeDirectionId,
                        decisionSource: source,
                        decisionCount: count,
                        percentage: totalDecisions > 0 ? count / totalDecisions : 0,
                    });
                }
            }
        }
        return {
            totalDecisions,
            bySource,
            bySourcePercentage,
            realityDrivenRatio,
            details,
        };
    }
    async getPersonaTriggerStats(startDate, endDate) {
        this.logger.debug('统计 Persona 触发频次');
        const where = {};
        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp.gte = startDate;
            }
            if (endDate) {
                where.timestamp.lte = endDate;
            }
        }
        const logs = await this.prisma.decisionLog.findMany({
            where,
            select: {
                persona: true,
                decisionSource: true,
            },
        });
        const personaMap = new Map();
        for (const log of logs) {
            const persona = log.persona;
            const source = log.decisionSource;
            let stats = personaMap.get(persona);
            if (!stats) {
                stats = {
                    persona,
                    bySource: {
                        PHYSICAL: 0,
                        HUMAN: 0,
                        PHILOSOPHY: 0,
                        HEURISTIC: 0,
                    },
                };
                personaMap.set(persona, stats);
            }
            stats.bySource[source]++;
        }
        const result = Array.from(personaMap.values()).map(stats => {
            const triggerCount = stats.bySource.PHYSICAL + stats.bySource.HUMAN + stats.bySource.PHILOSOPHY + stats.bySource.HEURISTIC;
            let primarySource = 'HEURISTIC';
            let maxCount = 0;
            for (const [source, count] of Object.entries(stats.bySource)) {
                if (count > maxCount) {
                    maxCount = count;
                    primarySource = source;
                }
            }
            return {
                persona: stats.persona,
                triggerCount,
                bySource: stats.bySource,
                primarySource,
            };
        });
        return result;
    }
    async getRealityDrivenRatio(countryCode, routeDirectionId, startDate, endDate) {
        const stats = countryCode
            ? await this.getStatsByCountry(countryCode, startDate, endDate)
            : await this.getStatsByRouteDirection(routeDirectionId, startDate, endDate);
        return stats.realityDrivenRatio;
    }
    async getHeuristicHotspots(limit = 10) {
        this.logger.debug(`识别 HEURISTIC 决策热点（Top ${limit}）`);
        const heuristicLogs = await this.prisma.decisionLog.findMany({
            where: {
                decisionSource: 'HEURISTIC',
            },
            select: {
                countryCode: true,
                routeDirectionId: true,
                persona: true,
            },
        });
        const hotspotMap = new Map();
        for (const log of heuristicLogs) {
            const key = `${log.countryCode || 'UNKNOWN'}_${log.routeDirectionId || 'UNKNOWN'}`;
            const existing = hotspotMap.get(key);
            if (existing) {
                existing.heuristicCount++;
            }
            else {
                hotspotMap.set(key, {
                    countryCode: log.countryCode || undefined,
                    routeDirectionId: log.routeDirectionId || undefined,
                    heuristicCount: 1,
                    totalDecisions: 0,
                });
            }
        }
        for (const [key, hotspot] of hotspotMap.entries()) {
            const where = {};
            if (hotspot.countryCode) {
                where.countryCode = hotspot.countryCode;
            }
            if (hotspot.routeDirectionId) {
                where.routeDirectionId = hotspot.routeDirectionId;
            }
            const total = await this.prisma.decisionLog.count({ where });
            hotspot.totalDecisions = total;
        }
        const hotspots = Array.from(hotspotMap.values())
            .map(hotspot => {
            var _a, _b;
            const heuristicRatio = hotspot.totalDecisions > 0
                ? hotspot.heuristicCount / hotspot.totalDecisions
                : 0;
            const suggestions = [];
            if (((_a = hotspot.routeDirectionId) === null || _a === void 0 ? void 0 : _a.includes('neptune')) || heuristicLogs.some(l => l.persona === 'NEPTUNE' && l.routeDirectionId === hotspot.routeDirectionId)) {
                suggestions.push('Neptune 经常用 HEURISTIC 决策 → 说明这条线的 corridor / hazard / POI 数据不完整');
                suggestions.push('建议补充 F-road 状态数据和 POI 可用性数据');
            }
            else if (((_b = hotspot.routeDirectionId) === null || _b === void 0 ? void 0 : _b.includes('drdre')) || heuristicLogs.some(l => l.persona === 'DR_DRE' && l.routeDirectionId === hotspot.routeDirectionId)) {
                suggestions.push('Dr.Dre 有 HEURISTIC 条目 → 说明用户画像里的某部分还没正式抽进 HumanCapabilityModel');
                suggestions.push('建议从用户反馈学习 HumanCapabilityModel');
            }
            return {
                ...hotspot,
                heuristicRatio,
                suggestions,
            };
        })
            .sort((a, b) => b.heuristicRatio - a.heuristicRatio)
            .slice(0, limit);
        return hotspots;
    }
};
exports.DecisionStatsService = DecisionStatsService;
exports.DecisionStatsService = DecisionStatsService = DecisionStatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DecisionStatsService);
//# sourceMappingURL=decision-stats.service.js.map