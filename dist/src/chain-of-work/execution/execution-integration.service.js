"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExecutionIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionIntegrationService = void 0;
const common_1 = require("@nestjs/common");
let ExecutionIntegrationService = ExecutionIntegrationService_1 = class ExecutionIntegrationService {
    constructor() {
        this.logger = new common_1.Logger(ExecutionIntegrationService_1.name);
    }
    async executePlan(plan, request) {
        this.logger.log(`[ExecutionIntegration] 开始执行规划: execution_id=${plan.draft_id}`);
        const startTime = Date.now();
        const executionId = this.generateUuid();
        const result = {
            execution_id: executionId,
            draft_id: plan.draft_id,
            success: true,
            steps: plan.steps.map(step => ({
                step_id: step.id,
                status: 'completed',
                duration_ms: 1000,
            })),
            trace_info: {
                draft_id: plan.draft_id,
                workflow_id: plan.workflow_id,
                version: plan.version,
                steps: plan.steps.map(step => ({
                    step_id: step.id,
                    step_type: step.step_type,
                    status: 'completed',
                    start_time: new Date().toISOString(),
                    end_time: new Date().toISOString(),
                    duration_ms: 1000,
                })),
                total_duration_ms: Date.now() - startTime,
                total_cost_est_usd: 0.01,
                success: true,
            },
            total_duration_ms: Date.now() - startTime,
            total_cost_est_usd: 0.01,
        };
        this.logger.log(`[ExecutionIntegration] 执行完成: duration=${result.total_duration_ms}ms`);
        return result;
    }
    generateUuid() {
        return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
};
exports.ExecutionIntegrationService = ExecutionIntegrationService;
exports.ExecutionIntegrationService = ExecutionIntegrationService = ExecutionIntegrationService_1 = __decorate([
    (0, common_1.Injectable)()
], ExecutionIntegrationService);
//# sourceMappingURL=execution-integration.service.js.map