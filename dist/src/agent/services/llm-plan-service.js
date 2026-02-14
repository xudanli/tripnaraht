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
var LlmPlanService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmPlanService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const action_registry_service_1 = require("./action-registry.service");
const tripnara_system_prompt_service_1 = require("./tripnara-system-prompt.service");
let LlmPlanService = LlmPlanService_1 = class LlmPlanService {
    constructor(llmService, actionRegistry, systemPromptService) {
        this.llmService = llmService;
        this.actionRegistry = actionRegistry;
        this.systemPromptService = systemPromptService;
        this.logger = new common_1.Logger(LlmPlanService_1.name);
        this.enabled = process.env.ENABLE_LLM_PLAN !== 'false';
        if (!this.enabled) {
            this.logger.log('LLM Plan is disabled');
        }
    }
    async selectAction(state) {
        if (!this.enabled) {
            return null;
        }
        try {
            const prompt = this.buildPrompt(state);
            const schema = {
                type: 'object',
                properties: {
                    action_name: {
                        type: 'string',
                        description: '要执行的 Action 名称（如 "places.resolve_entities"）',
                    },
                    input: {
                        type: 'object',
                        description: 'Action 的输入参数',
                    },
                    reasoning: {
                        type: 'string',
                        description: '选择此 Action 的原因',
                    },
                    confidence: {
                        type: 'number',
                        description: '置信度 (0-1)',
                        minimum: 0,
                        maximum: 1,
                    },
                    should_continue: {
                        type: 'boolean',
                        description: '是否应该继续执行（如果所有步骤已完成，则为 false）',
                    },
                },
                required: ['action_name', 'input', 'reasoning', 'confidence', 'should_continue'],
            };
            const provider = this.getProviderFromState(state);
            const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
            const cleanedResponse = this.cleanJsonResponse(response);
            const result = JSON.parse(cleanedResponse);
            if (!result.should_continue) {
                this.logger.debug('LLM determined that no more actions are needed');
                return null;
            }
            const actionDef = this.actionRegistry.get(result.action_name);
            if (!actionDef) {
                this.logger.warn(`LLM selected unknown action: ${result.action_name}, falling back to rule-based planning`);
                return null;
            }
            this.logger.debug(`LLM selected action: ${result.action_name} (confidence: ${result.confidence}, reasoning: ${result.reasoning})`);
            return {
                name: result.action_name,
                input: result.input,
            };
        }
        catch (error) {
            this.logger.error(`LLM Plan error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
            const isNetworkError = errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('no response received') ||
                errorMessage.includes('network');
            if (isNetworkError) {
                this.logger.warn('LLM Plan failed due to network error, falling back to rule-based planning');
            }
            return null;
        }
    }
    buildPrompt(state) {
        var _a;
        const availableActions = this.actionRegistry.list();
        const actionDescriptions = availableActions
            .map(action => {
            var _a;
            const preconditions = ((_a = action.metadata.preconditions) === null || _a === void 0 ? void 0 : _a.join(', ')) || 'none';
            let paramDetails = '';
            if (action.name === 'trip.apply_user_edit') {
                paramDetails = `
  参数格式：
  {
    "trip_id": "行程ID（字符串）",
    "edits": [
      {
        "type": "add" | "update" | "delete" | "move",
        "itemId": "行程项ID（update/delete/move时需要）",
        "placeId": "地点ID（add时需要）",
        "tripDayId": "日期ID（add时需要）",
        "startTime": "开始时间（ISO字符串，add/update/move时需要）",
        "endTime": "结束时间（ISO字符串，add/update/move时需要）",
        "updates": { ... }（update时需要）,
        "newTripDayId": "新日期ID（move时需要）",
        "newStartTime": "新开始时间（move时需要）",
        "newEndTime": "新结束时间（move时需要）"
      }
    ]
  }
  重要：
  - edits 必须是数组，即使只有一个编辑操作也要放在数组中
  - edits 数组不能为空
  - 只有当用户提供了完整的编辑信息（包括 placeId、tripDayId、startTime、endTime 等）时，才应该使用此 action
  - 如果用户只是说"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities 来解析地点，而不是使用此 action`;
            }
            return `- ${action.name}: ${action.description} (preconditions: ${preconditions}, cost: ${action.metadata.cost})${paramDetails}`;
        })
            .join('\n');
        const stateSummary = {
            nodes: state.draft.nodes.length,
            hasFacts: state.memory.semantic_facts.pois.length > 0,
            hasTimeMatrix: state.compute.time_matrix_robust !== null || state.compute.time_matrix_api !== null,
            hasOptimizationResults: state.compute.optimization_results.length > 0,
            hasTimeline: state.result.timeline.length > 0,
            status: state.result.status,
            userInput: state.user_input,
            step: state.react.step,
        };
        const systemPrompt = ((_a = this.systemPromptService) === null || _a === void 0 ? void 0 : _a.getSystemPrompt()) || '';
        const systemPromptSection = systemPrompt
            ? `\n\n---\n\n${systemPrompt}\n\n---\n\n`
            : '';
        return `${systemPromptSection}你是一个智能旅行规划助手（TripNARA），负责选择下一个要执行的 Action 来推进行程规划流程。

## 当前状态

${JSON.stringify(stateSummary, null, 2)}

## 可用的 Actions

${actionDescriptions}

## 任务

根据当前状态，选择下一个最合适的 Action 来推进行程规划。请考虑：

1. **前置条件**：确保所选 Action 的前置条件已满足
2. **优先级**：按照以下顺序考虑：
   - 如果缺少 POI 节点，应该先解析实体（places.resolve_entities）
   - 如果节点已解析但缺少事实，应该获取 POI 事实（places.get_poi_facts）
   - 如果节点和事实都有但缺少时间矩阵，应该构建时间矩阵（transport.build_time_matrix）
   - 如果所有前置条件满足，应该执行优化（itinerary.optimize_day_vrptw）
   - 如果优化已完成，应该验证可行性（policy.validate_feasibility）
3. **成本**：优先选择成本较低的 Actions
4. **效率**：选择能够最大程度推进流程的 Action
5. **参数完整性**：
   - 如果选择 trip.apply_user_edit，必须确保能够提供完整的 edits 数组（包括 type、placeId、tripDayId、startTime、endTime 等）
   - 如果用户输入只是"添加地点X"但没有提供完整信息，应该先使用 places.resolve_entities 来解析地点，而不是使用 trip.apply_user_edit
   - 只有当用户输入或状态中已经包含完整的编辑信息时，才应该使用 trip.apply_user_edit
   - **重要**：如果当前状态显示 nodes: 0（没有节点），通常应该先使用 places.resolve_entities 来解析地点，而不是直接使用 trip.apply_user_edit
   - **重要**：如果无法构造完整的 edits 数组（缺少 placeId、tripDayId、startTime、endTime 等），应该选择其他 action，而不是使用 trip.apply_user_edit

## 输出格式

请返回一个 JSON 对象，包含：
- action_name: Action 名称
- input: Action 的输入参数（根据 Action 的 input_schema）
- reasoning: 选择此 Action 的原因（1-2句话）
- confidence: 置信度（0-1）
- should_continue: 如果所有步骤已完成，返回 false

请确保返回的 JSON 格式正确，并且 action_name 必须是上述可用 Actions 之一。

## 重要提醒

**关于 trip.apply_user_edit**：
- 此 action 需要完整的 edits 数组，包含所有必需的字段（type、placeId、tripDayId、startTime、endTime 等）
- 如果用户输入只是"添加地点X"但没有提供完整信息（如 placeId、tripDayId、startTime、endTime），不应该选择此 action
- 在这种情况下，应该先选择 places.resolve_entities 来解析地点，或者选择其他合适的 action
- 只有在能够构造完整的 edits 数组时，才应该选择 trip.apply_user_edit

**关于 trip.load_draft**：
- 此 action 需要 trip_id 参数
- 如果 trip_id 不可用（不在 input 中，也不在 agent state 中），不应该选择此 action
- 应该先确保 trip_id 可用，或者选择其他不需要 trip_id 的 action`;
    }
    cleanJsonResponse(response) {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/i, '');
        cleaned = cleaned.trim();
        return cleaned;
    }
    getProviderFromState(state) {
        const llmProvider = state.llm_provider;
        if (llmProvider && llmProvider !== 'auto') {
            switch (llmProvider) {
                case 'openai':
                    return llm_request_dto_1.LlmProvider.OPENAI;
                case 'deepseek':
                    return llm_request_dto_1.LlmProvider.DEEPSEEK;
                case 'gemini':
                    return llm_request_dto_1.LlmProvider.GEMINI;
                case 'anthropic':
                    return llm_request_dto_1.LlmProvider.ANTHROPIC;
                default:
                    this.logger.warn(`Unknown llm_provider: ${llmProvider}, using default`);
                    return this.llmService.getDefaultProvider();
            }
        }
        return this.llmService.getDefaultProvider();
    }
};
exports.LlmPlanService = LlmPlanService;
exports.LlmPlanService = LlmPlanService = LlmPlanService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        action_registry_service_1.ActionRegistryService,
        tripnara_system_prompt_service_1.TripNaraSystemPromptService])
], LlmPlanService);
//# sourceMappingURL=llm-plan-service.js.map