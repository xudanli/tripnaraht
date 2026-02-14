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
var ClaudePlannerAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudePlannerAgentService = void 0;
const common_1 = require("@nestjs/common");
const planner_agent_service_1 = require("../../../trips/decision/orchestration/planner-agent.service");
const llm_service_1 = require("../../../llm/services/llm.service");
let ClaudePlannerAgentService = ClaudePlannerAgentService_1 = class ClaudePlannerAgentService {
    constructor(langGraphPlanner, llmService) {
        this.langGraphPlanner = langGraphPlanner;
        this.llmService = llmService;
        this.logger = new common_1.Logger(ClaudePlannerAgentService_1.name);
        this.logger.log(`[ClaudePlannerAgent] 已初始化`);
        this.logger.log(`[ClaudePlannerAgent] LangGraphPlanner: ${!!this.langGraphPlanner}, LlmService: ${!!this.llmService}`);
    }
    async analyzeRequest(request, context) {
        this.logger.debug(`[PlannerAgent] 分析请求: request_id=${request.request_id}`);
        try {
            const gaps = this.identifyGaps(request);
            let intent = 'PLAN_TRIP';
            let candidate_structure;
            if (this.langGraphPlanner) {
                const langGraphState = this.convertToLangGraphState(request, context);
                const analysisResult = await this.langGraphPlanner.analyzeQuery(langGraphState);
                intent = analysisResult.intent;
            }
            if (gaps.filter(g => g.severity === 'HARD').length === 0) {
                candidate_structure = this.generateCandidateStructure(request);
            }
            return {
                intent,
                gaps,
                candidate_structure,
            };
        }
        catch (error) {
            this.logger.error(`[PlannerAgent] 分析请求失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    identifyGaps(request) {
        const gaps = [];
        if (!request.destination) {
            gaps.push({
                type: 'MISSING_DESTINATION',
                severity: 'HARD',
                detail: '缺少目的地信息（destination）',
            });
        }
        if (!request.date_range && !request.start_date && !request.days) {
            gaps.push({
                type: 'MISSING_DATES',
                severity: 'HARD',
                detail: '缺少日期信息（date_range 或 start_date + days）',
            });
        }
        else if (request.start_date && !request.days) {
            gaps.push({
                type: 'MISSING_DATES',
                severity: 'SOFT',
                detail: '缺少行程天数（days）',
            });
        }
        if (!request.constraints) {
            gaps.push({
                type: 'MISSING_CONSTRAINTS',
                severity: 'SOFT',
                detail: '缺少约束条件（预算、时间窗、体力要求等）',
            });
        }
        else {
            if (request.party && !request.constraints.max_ascent_m && !request.constraints.max_walk_km) {
                gaps.push({
                    type: 'MISSING_CONSTRAINTS',
                    severity: 'SOFT',
                    detail: '缺少体力约束（max_ascent_m、max_walk_km）',
                });
            }
        }
        if (!request.preferences) {
            gaps.push({
                type: 'MISSING_PREFERENCES',
                severity: 'SOFT',
                detail: '缺少偏好设置（风景优先/效率优先等）',
            });
        }
        return gaps;
    }
    generateCandidateStructure(request) {
        const days = request.days ||
            (request.date_range
                ? Math.ceil((new Date(request.date_range.end_date).getTime() -
                    new Date(request.date_range.start_date).getTime()) /
                    (1000 * 60 * 60 * 24)) + 1
                : 5);
        return {
            suggested_days: days,
        };
    }
    convertToLangGraphState(request, context) {
        var _a, _b, _c;
        const queryParts = [];
        if (typeof request.destination === 'string') {
            queryParts.push(`目的地：${request.destination}`);
        }
        else if (request.destination) {
            queryParts.push(`目的地坐标：${request.destination.lat}, ${request.destination.lng}`);
        }
        if (request.date_range) {
            queryParts.push(`日期：${request.date_range.start_date} 至 ${request.date_range.end_date}`);
        }
        else if (request.start_date && request.days) {
            queryParts.push(`日期：${request.start_date}，${request.days}天`);
        }
        if (request.party) {
            queryParts.push(`人数：${request.party.count}人`);
            if (request.party.fitness_level) {
                queryParts.push(`体力：${request.party.fitness_level}`);
            }
        }
        if ((_a = request.constraints) === null || _a === void 0 ? void 0 : _a.budget) {
            queryParts.push(`预算：${request.constraints.budget.total} ${request.constraints.budget.currency || 'CNY'}`);
        }
        const userQuery = queryParts.join('，');
        return {
            userQuery,
            extractedParams: {
                countryCode: typeof request.destination === 'string' ? this.extractCountryCode(request.destination) : undefined,
                month: request.start_date ? new Date(request.start_date).getMonth() + 1 : undefined,
                humanCapability: {
                    preferredPace: ((_b = request.party) === null || _b === void 0 ? void 0 : _b.fitness_level) === 'low' ? 'SLOW' :
                        ((_c = request.party) === null || _c === void 0 ? void 0 : _c.fitness_level) === 'high' ? 'FAST' : 'MEDIUM',
                    riskTolerance: 'MEDIUM',
                    specialConstraints: [],
                },
            },
            planningPhase: 'DRAFTING',
            metadata: {
                tripRunId: context.request_id,
                attemptNumber: 1,
            },
        };
    }
    extractCountryCode(destination) {
        const countryMap = {
            '冰岛': 'IS',
            'Iceland': 'IS',
            'IS': 'IS',
            '尼泊尔': 'NP',
            'Nepal': 'NP',
            'NP': 'NP',
            '瑞士': 'CH',
            'Switzerland': 'CH',
            'CH': 'CH',
            '日本': 'JP',
            'Japan': 'JP',
            'JP': 'JP',
        };
        for (const [key, code] of Object.entries(countryMap)) {
            if (destination.includes(key)) {
                return code;
            }
        }
        return undefined;
    }
};
exports.ClaudePlannerAgentService = ClaudePlannerAgentService;
exports.ClaudePlannerAgentService = ClaudePlannerAgentService = ClaudePlannerAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planner_agent_service_1.PlannerAgentService,
        llm_service_1.LlmService])
], ClaudePlannerAgentService);
//# sourceMappingURL=planner-agent.service.js.map