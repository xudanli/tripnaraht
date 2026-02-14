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
var PlannerAgentMcpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerAgentMcpService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../llm/services/llm.service");
let PlannerAgentMcpService = PlannerAgentMcpService_1 = class PlannerAgentMcpService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PlannerAgentMcpService_1.name);
    }
    async plan(request) {
        this.logger.log(`Planner Agent 收到请求: ${request.userQuery}`);
        return {
            skillsUsed: [
                'tripnara.routeDirection.pickForIntent',
                'tripnara.dem.getProfile',
                'tripnara.decision.abuCheck',
                'tripnara.decision.drdrePace',
                'tripnara.readiness.generateChecklist',
            ],
            decisionLog: [],
            explanation: '这是一个示例实现，实际应该通过 MCP Client 调用 Skills',
        };
    }
};
exports.PlannerAgentMcpService = PlannerAgentMcpService;
exports.PlannerAgentMcpService = PlannerAgentMcpService = PlannerAgentMcpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PlannerAgentMcpService);
//# sourceMappingURL=planner-agent-mcp.service.js.map