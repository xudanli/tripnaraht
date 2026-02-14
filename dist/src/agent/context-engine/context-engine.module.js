"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngineModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../prisma/prisma.module");
const context_engineer_service_1 = require("./services/context-engineer.service");
const context_metrics_service_1 = require("./services/context-metrics.service");
const context_learning_service_1 = require("./services/context-learning.service");
const context_prometheus_metrics_service_1 = require("./services/context-prometheus-metrics.service");
const user_profile_service_1 = require("./services/user-profile.service");
const compression_learning_service_1 = require("./services/compression-learning.service");
const context_performance_analysis_service_1 = require("./services/context-performance-analysis.service");
const context_controller_1 = require("./context.controller");
const skills_module_1 = require("../../skills/skills.module");
const redis_module_1 = require("../../redis/redis.module");
const rag_module_1 = require("../../rag/rag.module");
let ContextEngineModule = class ContextEngineModule {
};
exports.ContextEngineModule = ContextEngineModule;
exports.ContextEngineModule = ContextEngineModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => skills_module_1.SkillsModule),
            redis_module_1.RedisModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
        ],
        controllers: [context_controller_1.ContextController],
        providers: [
            context_engineer_service_1.ContextEngineerService,
            context_metrics_service_1.ContextMetricsService,
            context_learning_service_1.ContextLearningService,
            context_prometheus_metrics_service_1.ContextPrometheusMetricsService,
            user_profile_service_1.UserProfileService,
            compression_learning_service_1.CompressionLearningService,
            context_performance_analysis_service_1.ContextPerformanceAnalysisService,
            { provide: 'ContextEngineerService', useExisting: context_engineer_service_1.ContextEngineerService },
        ],
        exports: [
            context_engineer_service_1.ContextEngineerService,
            context_metrics_service_1.ContextMetricsService,
            context_learning_service_1.ContextLearningService,
            context_prometheus_metrics_service_1.ContextPrometheusMetricsService,
            user_profile_service_1.UserProfileService,
            compression_learning_service_1.CompressionLearningService,
            context_performance_analysis_service_1.ContextPerformanceAnalysisService,
            'ContextEngineerService',
        ],
    })
], ContextEngineModule);
//# sourceMappingURL=context-engine.module.js.map