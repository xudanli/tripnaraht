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
var LangGraphOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LangGraphOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const planner_agent_service_1 = require("./planner-agent.service");
const narrator_agent_service_1 = require("./narrator-agent.service");
const tripnara_core_tool_service_1 = require("../tools/tripnara-core-tool.service");
let LangGraphOrchestratorService = LangGraphOrchestratorService_1 = class LangGraphOrchestratorService {
    constructor(plannerAgent, narratorAgent, coreTool) {
        this.plannerAgent = plannerAgent;
        this.narratorAgent = narratorAgent;
        this.coreTool = coreTool;
        this.logger = new common_1.Logger(LangGraphOrchestratorService_1.name);
    }
    async execute(userQuery, context) {
        this.logger.debug(`执行 LangGraph 编排: ${userQuery.substring(0, 50)}...`);
        const initialState = {
            userQuery,
            metadata: context,
        };
        try {
            const plannerResult = await this.plannerAgent.analyzeQuery(initialState);
            initialState.extractedParams = plannerResult.extractedParams;
            if (plannerResult.nextStep === 'CORE_DECISION') {
                const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
                const coreToolOutput = await this.coreTool.execute(coreToolInput);
                initialState.coreToolInput = coreToolInput;
                initialState.coreToolOutput = coreToolOutput;
                const explanation = await this.narratorAgent.generateExplanation(coreToolOutput, initialState, initialState.complianceResult);
                initialState.finalResponse = explanation;
                return initialState;
            }
            else if (plannerResult.nextStep === 'COMPLIANCE_CHECK') {
                this.logger.warn('合规检查流程尚未实现，直接进入核心决策');
                const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
                const coreToolOutput = await this.coreTool.execute(coreToolInput);
                initialState.coreToolInput = coreToolInput;
                initialState.coreToolOutput = coreToolOutput;
                const explanation = await this.narratorAgent.generateExplanation(coreToolOutput, initialState, initialState.complianceResult);
                initialState.finalResponse = explanation;
                return initialState;
            }
            else {
                this.logger.warn(`未实现的流程: ${plannerResult.nextStep}，直接进入核心决策`);
                const coreToolInput = this.buildCoreToolInput(plannerResult.extractedParams);
                const coreToolOutput = await this.coreTool.execute(coreToolInput);
                initialState.coreToolInput = coreToolInput;
                initialState.coreToolOutput = coreToolOutput;
                const explanation = await this.narratorAgent.generateExplanation(coreToolOutput, initialState, initialState.complianceResult);
                initialState.finalResponse = explanation;
                return initialState;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`LangGraph 编排失败: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            initialState.error = errorMessage;
            initialState.finalResponse = `抱歉，处理您的请求时出现错误：${errorMessage}`;
            return initialState;
        }
    }
    registerAgent(agentType, agent) {
        this.logger.debug(`注册 Agent: ${agentType}`);
    }
    getGraphStructure() {
        return {
            nodes: [
                {
                    id: 'planner',
                    agentType: 'PLANNER',
                    description: '意图识别、任务拆解、参数提取',
                },
                {
                    id: 'core_decision',
                    agentType: 'CORE_DECISION',
                    description: 'TripNARA 核心决策引擎',
                },
                {
                    id: 'narrator',
                    agentType: 'NARRATOR',
                    description: '结果润色、故事层文案生成',
                },
            ],
            edges: [
                { from: 'planner', to: 'core_decision' },
                { from: 'core_decision', to: 'narrator' },
            ],
        };
    }
    buildCoreToolInput(extractedParams) {
        if (!extractedParams) {
            throw new Error('缺少提取的参数');
        }
        if (!extractedParams.countryCode) {
            throw new Error('缺少国家代码');
        }
        if (!extractedParams.month) {
            throw new Error('缺少月份');
        }
        if (!extractedParams.routeDirectionId) {
            throw new Error('缺少路线方向 ID');
        }
        if (!extractedParams.humanCapability) {
            throw new Error('缺少用户能力参数');
        }
        return {
            countryCode: extractedParams.countryCode,
            month: extractedParams.month,
            routeDirectionId: extractedParams.routeDirectionId,
            humanCapability: extractedParams.humanCapability,
            metadata: {
                source: 'langgraph_orchestrator',
                timestamp: new Date().toISOString(),
            },
        };
    }
};
exports.LangGraphOrchestratorService = LangGraphOrchestratorService;
exports.LangGraphOrchestratorService = LangGraphOrchestratorService = LangGraphOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [planner_agent_service_1.PlannerAgentService,
        narrator_agent_service_1.NarratorAgentService,
        tripnara_core_tool_service_1.TripNaraCoreToolService])
], LangGraphOrchestratorService);
//# sourceMappingURL=langgraph-orchestrator.service.js.map