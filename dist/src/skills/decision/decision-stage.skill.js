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
var DecisionStageSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionStageSkill = void 0;
const common_1 = require("@nestjs/common");
const decision_log_storage_service_1 = require("../../trips/decision/services/decision-log-storage.service");
let DecisionStageSkill = DecisionStageSkill_1 = class DecisionStageSkill {
    constructor(decisionLogStorage) {
        this.decisionLogStorage = decisionLogStorage;
        this.logger = new common_1.Logger(DecisionStageSkill_1.name);
        this.metadata = {
            name: 'decision.stage',
            description: '决策阶段查询：按决策阶段（decisionStage）分组统计决策日志，用于 E2E 回放、A/B 测试、错误聚类',
            version: '1.0.0',
            category: 'decision',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.stage: tripId=${input.tripId || 'none'}, stage=${input.stage || 'all'}`);
        try {
            if (!this.decisionLogStorage) {
                throw new Error('DecisionLogStorageService 未注入');
            }
            const filters = {
                tripId: input.tripId,
                routeDirectionId: input.routeDirectionId,
                countryCode: input.countryCode,
                decisionStage: input.stage,
                startDate: input.startDate ? new Date(input.startDate) : undefined,
                endDate: input.endDate ? new Date(input.endDate) : undefined,
                limit: input.limit || 1000,
            };
            const logs = await this.decisionLogStorage.queryLogs(filters);
            const stageMap = new Map();
            const personaMap = new Map();
            const sourceMap = new Map();
            const allStages = [
                'ROUTE_PICK',
                'DEM_EVIDENCE',
                'ABU_GATE',
                'PACE_ADJUST',
                'SPATIAL_REPAIR',
                'READINESS',
                'FINALIZE',
            ];
            for (const stage of allStages) {
                stageMap.set(stage, []);
            }
            for (const log of logs) {
                const stage = log.decisionStage || 'FINALIZE';
                const stageLogs = stageMap.get(stage) || [];
                stageLogs.push(log);
                stageMap.set(stage, stageLogs);
                const personaCount = personaMap.get(log.persona) || 0;
                personaMap.set(log.persona, personaCount + 1);
                const sourceCount = sourceMap.get(log.decisionSource) || 0;
                sourceMap.set(log.decisionSource, sourceCount + 1);
            }
            const stageDistribution = {
                ROUTE_PICK: 0,
                DEM_EVIDENCE: 0,
                ABU_GATE: 0,
                PACE_ADJUST: 0,
                SPATIAL_REPAIR: 0,
                READINESS: 0,
                FINALIZE: 0,
            };
            for (const [stage, stageLogs] of stageMap.entries()) {
                stageDistribution[stage] = stageLogs.length;
            }
            const stages = Array.from(stageMap.entries())
                .map(([stage, logs]) => ({
                stage,
                count: logs.length,
                logs,
            }))
                .filter((item) => item.count > 0)
                .sort((a, b) => {
                const stageOrder = {
                    ROUTE_PICK: 1,
                    DEM_EVIDENCE: 2,
                    ABU_GATE: 3,
                    PACE_ADJUST: 4,
                    SPATIAL_REPAIR: 5,
                    READINESS: 6,
                    FINALIZE: 7,
                };
                return stageOrder[a.stage] - stageOrder[b.stage];
            });
            return {
                stages,
                summary: {
                    totalLogs: logs.length,
                    stageDistribution,
                    personaDistribution: {
                        ABU: personaMap.get('ABU') || 0,
                        DR_DRE: personaMap.get('DR_DRE') || 0,
                        NEPTUNE: personaMap.get('NEPTUNE') || 0,
                    },
                    sourceDistribution: {
                        PHYSICAL: sourceMap.get('PHYSICAL') || 0,
                        HUMAN: sourceMap.get('HUMAN') || 0,
                        PHILOSOPHY: sourceMap.get('PHILOSOPHY') || 0,
                        HEURISTIC: sourceMap.get('HEURISTIC') || 0,
                    },
                },
            };
        }
        catch (error) {
            this.logger.error(`决策阶段查询失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.DecisionStageSkill = DecisionStageSkill;
exports.DecisionStageSkill = DecisionStageSkill = DecisionStageSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [decision_log_storage_service_1.DecisionLogStorageService])
], DecisionStageSkill);
//# sourceMappingURL=decision-stage.skill.js.map