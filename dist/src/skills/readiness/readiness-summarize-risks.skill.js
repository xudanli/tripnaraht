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
var ReadinessSummarizeRisksSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessSummarizeRisksSkill = void 0;
const common_1 = require("@nestjs/common");
const world_build_context_skill_1 = require("../world/world-build-context.skill");
const decision_run_three_guardians_skill_1 = require("../decision/decision-run-three-guardians.skill");
const prisma_service_1 = require("../../prisma/prisma.service");
let ReadinessSummarizeRisksSkill = ReadinessSummarizeRisksSkill_1 = class ReadinessSummarizeRisksSkill {
    constructor(worldBuildContext, decisionRunThreeGuardians, prisma) {
        this.worldBuildContext = worldBuildContext;
        this.decisionRunThreeGuardians = decisionRunThreeGuardians;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ReadinessSummarizeRisksSkill_1.name);
        this.metadata = {
            name: 'readiness.summarizeRisks',
            description: '从世界模型和决策结果中提炼旅程的关键风险点，并提供缓解建议',
            version: '1.0.0',
            category: 'readiness',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 readiness.summarizeRisks: tripId=${input.tripId || 'none'}`);
        try {
            let world;
            let decisionResult = null;
            if (input.tripId) {
                const contextResult = await this.worldBuildContext.execute({
                    tripId: input.tripId,
                });
                world = contextResult.world;
            }
            else if (input.world) {
                world = input.world;
            }
            else {
                throw new Error('必须提供 tripId 或 world');
            }
            const risks = this.analyzeRisks(world, input.finalPlan);
            const riskMitigationTips = this.generateMitigationTips(risks);
            const readinessScore = this.calculateReadinessScore(risks);
            return {
                topRisks: risks.slice(0, 5),
                riskMitigationTips,
                readinessScore,
            };
        }
        catch (error) {
            this.logger.error(`总结风险失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    analyzeRisks(world, plan) {
        var _a, _b, _c, _d;
        const risks = [];
        const demEvidence = ((_a = world.physical) === null || _a === void 0 ? void 0 : _a.demEvidence) || [];
        const highAltitudeSegments = demEvidence.filter(seg => { var _a, _b; return ((_b = (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.elevationRange) === null || _b === void 0 ? void 0 : _b.max) > 3000; });
        if (highAltitudeSegments.length > 0) {
            risks.push({
                risk: '高海拔',
                category: 'altitude',
                severity: 'high',
                description: `行程中有 ${highAltitudeSegments.length} 个路段海拔超过 3000 米，可能出现高反症状`,
            });
        }
        const hazardZones = ((_b = world.physical) === null || _b === void 0 ? void 0 : _b.hazardZones) || [];
        const fRoadHazards = hazardZones.filter(hz => {
            const metadata = hz.metadata || {};
            const zoneId = hz.zoneId || '';
            return (hz.type === 'OTHER' && (metadata.type === 'F_ROAD' || zoneId.toLowerCase().includes('f-road'))) ||
                metadata.fRoad === true ||
                zoneId.toLowerCase().includes('f-road');
        });
        if (fRoadHazards.length > 0) {
            risks.push({
                risk: 'F-road 路段',
                category: 'road',
                severity: 'high',
                description: `行程包含 ${fRoadHazards.length} 个 F-road 路段，需要四驱车和丰富驾驶经验`,
            });
        }
        const countryCode = ((_c = world.physical) === null || _c === void 0 ? void 0 : _c.countryCode) || '';
        const month = ((_d = world.physical) === null || _d === void 0 ? void 0 : _d.month) || 1;
        if (countryCode === 'IS' && (month >= 10 || month <= 3)) {
            risks.push({
                risk: '冬季海况不稳',
                category: 'weather',
                severity: 'medium',
                description: '冬季冰岛海况多变，可能影响出海活动',
            });
        }
        const human = world.human;
        if (human && (human.maxDailyAscentM || 0) < 1000) {
            risks.push({
                risk: '体力限制',
                category: 'health',
                severity: 'medium',
                description: '基于您的体能评估，行程中某些爬升路段可能需要额外准备',
            });
        }
        if (plan) {
        }
        return risks.sort((a, b) => {
            const severityOrder = { high: 3, medium: 2, low: 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }
    generateMitigationTips(risks) {
        const tipsMap = {
            '高海拔': [
                '提前一周开始服用红景天或乙酰唑胺（需医生指导）',
                '行程中前 2-3 天避免剧烈运动，给身体适应时间',
                '准备便携式氧气瓶作为紧急备用',
            ],
            'F-road 路段': [
                '必须租用四驱车（推荐 4x4 SUV），并购买全险',
                '提前学习 F-road 驾驶技巧，查看最新路况信息',
                '准备应急工具：拖车绳、急救包、卫星通讯设备',
            ],
            '冬季海况不稳': [
                '关注天气预报，灵活调整出海行程',
                '准备防晕船药物',
                '选择经验丰富的船长和船只',
            ],
            '体力限制': [
                '适当减少每日活动量，增加休息时间',
                '准备登山杖和护膝等辅助装备',
                '考虑雇佣向导或选择更轻松的替代路线',
            ],
            '夜间驾驶': [
                '避免夜间长途驾驶，优先选择白天行程',
                '如果必须夜间行驶，确保车辆灯光正常，准备反光衣',
            ],
        };
        return risks.map(risk => ({
            risk: risk.risk,
            tips: tipsMap[risk.risk] || [`请注意 ${risk.description}`],
        }));
    }
    calculateReadinessScore(risks) {
        let score = 100;
        const highRiskCount = risks.filter(r => r.severity === 'high').length;
        score -= highRiskCount * 20;
        const mediumRiskCount = risks.filter(r => r.severity === 'medium').length;
        score -= mediumRiskCount * 10;
        const lowRiskCount = risks.filter(r => r.severity === 'low').length;
        score -= lowRiskCount * 5;
        return Math.max(0, Math.min(100, score));
    }
};
exports.ReadinessSummarizeRisksSkill = ReadinessSummarizeRisksSkill;
exports.ReadinessSummarizeRisksSkill = ReadinessSummarizeRisksSkill = ReadinessSummarizeRisksSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_build_context_skill_1.WorldBuildContextSkill,
        decision_run_three_guardians_skill_1.DecisionRunThreeGuardiansSkill,
        prisma_service_1.PrismaService])
], ReadinessSummarizeRisksSkill);
//# sourceMappingURL=readiness-summarize-risks.skill.js.map