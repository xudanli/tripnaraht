"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KPUModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const rag_module_1 = require("../rag/rag.module");
const llm_module_1 = require("../llm/llm.module");
const redis_module_1 = require("../redis/redis.module");
const integrated_rag_kpu_service_1 = require("./services/integrated-rag-kpu.service");
const knowledge_validation_service_1 = require("./services/knowledge-validation.service");
const validation_scoring_service_1 = require("./services/validation-scoring.service");
const validation_cache_service_1 = require("./services/validation-cache.service");
const kpu_monitoring_service_1 = require("./services/kpu-monitoring.service");
const kpu_config_service_1 = require("./services/kpu-config.service");
const kpu_health_service_1 = require("./services/kpu-health.service");
const kpu_config_1 = __importDefault(require("./config/kpu.config"));
let KPUModule = class KPUModule {
};
exports.KPUModule = KPUModule;
exports.KPUModule = KPUModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forFeature(kpu_config_1.default),
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
            llm_module_1.LlmModule,
            redis_module_1.RedisModule,
        ],
        providers: [
            integrated_rag_kpu_service_1.IntegratedRAGKPUService,
            knowledge_validation_service_1.KnowledgeValidationService,
            validation_scoring_service_1.ValidationScoringService,
            validation_cache_service_1.ValidationCacheService,
            kpu_monitoring_service_1.KPUMonitoringService,
            kpu_config_service_1.KPUConfigService,
            kpu_health_service_1.KPUHealthService,
        ],
        exports: [
            integrated_rag_kpu_service_1.IntegratedRAGKPUService,
            knowledge_validation_service_1.KnowledgeValidationService,
            validation_scoring_service_1.ValidationScoringService,
            validation_cache_service_1.ValidationCacheService,
            kpu_monitoring_service_1.KPUMonitoringService,
            kpu_config_service_1.KPUConfigService,
            kpu_health_service_1.KPUHealthService,
        ],
    })
], KPUModule);
//# sourceMappingURL=kpu.module.js.map