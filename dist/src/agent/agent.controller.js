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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const agent_service_1 = require("./services/agent.service");
const route_and_run_dto_1 = require("./dto/route-and-run.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let AgentController = class AgentController {
    constructor(agentService) {
        this.agentService = agentService;
    }
    async routeAndRun(request) {
        return this.agentService.routeAndRun(request);
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('route_and_run'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '智能体统一入口 - 路由并执行',
        description: `
智能体统一入口，根据用户输入自动路由到 System 1（快速路径）或 System 2（ReAct 循环）。

**路由策略**：
- 硬规则短路：支付/退款/浏览器 → System2 + consent_required
- 明确 CRUD → System1_API
- 单纯事实查询 → System1_RAG
- 规划/多约束/无 API → System2_REASONING

**System 2 ReAct 循环**：
- Plan → Act → Observe → Critic → Repair
- 受预算控制（max_seconds, max_steps）
- 自动可行性检查（时间窗、日界、午餐、鲁棒时间）

**返回结果**：
- route: 路由决策（route, confidence, reasons, budget）
- result: 执行结果（status, answer_text, payload）
- explain: 决策日志（decision_log）
- observability: 可观测性指标（latency, cost, tool_calls）
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({
        type: route_and_run_dto_1.RouteAndRunRequestDto,
        description: '智能体请求参数',
        examples: {
            '简单查询': {
                value: {
                    request_id: 'req-001',
                    user_id: 'user-123',
                    message: '推荐新宿拉面',
                },
            },
            '规划请求': {
                value: {
                    request_id: 'req-002',
                    user_id: 'user-123',
                    message: '规划5天东京游，包含浅草寺、东京塔、新宿',
                    options: {
                        max_seconds: 60,
                        max_steps: 8,
                    },
                },
            },
            '条件分支': {
                value: {
                    request_id: 'req-003',
                    user_id: 'user-123',
                    message: '如果赶不上日落就改去横滨',
                    options: {
                        max_seconds: 30,
                        max_steps: 5,
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回路由和执行结果',
        type: route_and_run_dto_1.RouteAndRunResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数无效',
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: '服务器内部错误',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [route_and_run_dto_1.RouteAndRunRequestDto]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "routeAndRun", null);
exports.AgentController = AgentController = __decorate([
    (0, swagger_1.ApiTags)('agent'),
    (0, common_1.Controller)('agent'),
    __metadata("design:paramtypes", [agent_service_1.AgentService])
], AgentController);
//# sourceMappingURL=agent.controller.js.map