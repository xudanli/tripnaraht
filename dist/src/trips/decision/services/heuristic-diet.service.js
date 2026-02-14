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
var HeuristicDietService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeuristicDietService = void 0;
const common_1 = require("@nestjs/common");
const decision_stats_service_1 = require("./decision-stats.service");
let HeuristicDietService = HeuristicDietService_1 = class HeuristicDietService {
    constructor(decisionStats) {
        this.decisionStats = decisionStats;
        this.logger = new common_1.Logger(HeuristicDietService_1.name);
    }
    async generateDietPlan() {
        var _a, _b;
        this.logger.debug('生成 HEURISTIC 减肥计划');
        const hotspots = await this.decisionStats.getHeuristicHotspots(20);
        const conversionTargets = [];
        for (const hotspot of hotspots) {
            if ((_a = hotspot.routeDirectionId) === null || _a === void 0 ? void 0 : _a.includes('neptune')) {
                conversionTargets.push({
                    scenario: `Neptune 在 ${hotspot.countryCode} ${hotspot.routeDirectionId} 使用 HEURISTIC 决策`,
                    targetSource: 'PHYSICAL',
                    priority: hotspot.heuristicRatio > 0.2 ? 10 : 7,
                    conversionPlan: {
                        requiredData: [
                            'corridorGeom 数据',
                            'hazard zone 数据',
                            'POI 可用性数据',
                            'road status 数据',
                        ],
                        requiredModels: [
                            'SpatialIssueDetectorService（完善）',
                            'SpatialReplacementService（完善）',
                        ],
                        estimatedEffort: 5,
                    },
                    currentHeuristicCount: hotspot.heuristicCount,
                });
            }
            else if ((_b = hotspot.routeDirectionId) === null || _b === void 0 ? void 0 : _b.includes('drdre')) {
                conversionTargets.push({
                    scenario: `Dr.Dre 在 ${hotspot.countryCode} ${hotspot.routeDirectionId} 使用 HEURISTIC 决策`,
                    targetSource: 'HUMAN',
                    priority: hotspot.heuristicRatio > 0.15 ? 9 : 6,
                    conversionPlan: {
                        requiredData: [
                            '用户历史旅程反馈',
                            '用户体能画像数据',
                        ],
                        requiredModels: [
                            'HumanCapabilityModel（从用户反馈学习）',
                            'FatigueCalculatorService（基于真实数据校准）',
                        ],
                        estimatedEffort: 3,
                    },
                    currentHeuristicCount: hotspot.heuristicCount,
                });
            }
        }
        conversionTargets.sort((a, b) => b.priority - a.priority);
        const totalHeuristic = conversionTargets.reduce((sum, target) => sum + target.currentHeuristicCount, 0);
        const stats = await this.decisionStats.getStatsByCountry();
        const estimatedReduction = totalHeuristic * 0.7;
        const estimatedHeuristicRatioAfterConversion = (stats.totalDecisions * stats.bySourcePercentage.HEURISTIC - estimatedReduction) /
            stats.totalDecisions;
        return {
            totalHeuristicDecisions: totalHeuristic,
            totalDecisions: stats.totalDecisions,
            heuristicRatio: stats.bySourcePercentage.HEURISTIC,
            conversionTargets,
            estimatedHeuristicRatioAfterConversion: Math.max(0, estimatedHeuristicRatioAfterConversion),
        };
    }
    getConversionGuidelines() {
        return `
# HEURISTIC 转换指南

## 原则

将 HEURISTIC 决策逐步转换为 PHYSICAL / HUMAN / PHILOSOPHY 决策。

## 转换场景

### 1. Neptune HEURISTIC → PHYSICAL

**场景**：Neptune 经常用 HEURISTIC 决策

**原因**：corridor / hazard / POI 数据不完整

**转换方案**：
- 补充 corridorGeom 数据（PostGIS）
- 补充 hazard zone 数据
- 补充 POI 可用性数据
- 完善 SpatialIssueDetectorService

### 2. Dr.Dre HEURISTIC → HUMAN

**场景**：Dr.Dre 有 HEURISTIC 条目

**原因**：用户画像里的某部分还没正式抽进 HumanCapabilityModel

**转换方案**：
- 从用户反馈学习 HumanCapabilityModel
- 基于真实数据校准 FatigueCalculatorService
- 建立用户画像 → HumanCapabilityModel 映射表

### 3. Abu HEURISTIC → PHYSICAL

**场景**：Abu 使用 HEURISTIC（理论上不应该）

**原因**：PhysicalRealityModel 数据缺失

**转换方案**：
- 补充 DEM 数据
- 补充 road status 数据
- 补充 hazard zone 数据
- 补充 climate seasonality 数据

## 优先级

1. 高优先级（priority >= 9）：HEURISTIC 占比 > 20%
2. 中优先级（priority 6-8）：HEURISTIC 占比 10-20%
3. 低优先级（priority < 6）：HEURISTIC 占比 < 10%

## 验收标准

转换完成后，该场景的 HEURISTIC 决策应 < 5%。
`;
    }
};
exports.HeuristicDietService = HeuristicDietService;
exports.HeuristicDietService = HeuristicDietService = HeuristicDietService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [decision_stats_service_1.DecisionStatsService])
], HeuristicDietService);
//# sourceMappingURL=heuristic-diet.service.js.map