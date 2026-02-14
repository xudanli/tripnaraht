"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentInfraModule = void 0;
const common_1 = require("@nestjs/common");
const llm_executor_service_1 = require("./llm-executor.service");
const core_gateway_service_1 = require("./core-gateway.service");
const state_store_service_1 = require("./state-store.service");
const telemetry_service_1 = require("./telemetry.service");
const audit_log_service_1 = require("./audit-log.service");
const task_service_1 = require("./task.service");
const token_stats_service_1 = require("../services/token-stats.service");
const llm_module_1 = require("../../llm/llm.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const cache_module_1 = require("../../common/cache/cache.module");
let AgentInfraModule = class AgentInfraModule {
};
exports.AgentInfraModule = AgentInfraModule;
exports.AgentInfraModule = AgentInfraModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => llm_module_1.LlmModule),
            prisma_module_1.PrismaModule,
            cache_module_1.CacheModule,
        ],
        providers: [
            llm_executor_service_1.LLMExecutorService,
            core_gateway_service_1.CoreGatewayService,
            state_store_service_1.StateStoreService,
            telemetry_service_1.TelemetryService,
            audit_log_service_1.AuditLogService,
            task_service_1.TaskService,
            token_stats_service_1.TokenStatsService,
        ],
        exports: [
            llm_executor_service_1.LLMExecutorService,
            core_gateway_service_1.CoreGatewayService,
            state_store_service_1.StateStoreService,
            telemetry_service_1.TelemetryService,
            audit_log_service_1.AuditLogService,
            task_service_1.TaskService,
            token_stats_service_1.TokenStatsService,
        ],
    })
], AgentInfraModule);
//# sourceMappingURL=infra.module.js.map