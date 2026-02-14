"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("../prisma/prisma.module");
const places_module_1 = require("../places/places.module");
const config_1 = require("@nestjs/config");
const knowledge_base_module_1 = require("../knowledge-base/knowledge-base.module");
const redis_module_1 = require("../redis/redis.module");
const rag_service_1 = require("./services/rag.service");
const chunk_retrieval_service_1 = require("./services/chunk-retrieval.service");
const compliance_facts_agent_service_1 = require("./services/compliance-facts-agent.service");
const llm_extraction_service_1 = require("./services/llm-extraction.service");
const route_knowledge_curator_service_1 = require("./services/route-knowledge-curator.service");
const local_insight_service_1 = require("./services/local-insight.service");
const enhanced_chat_service_1 = require("./services/enhanced-chat.service");
const rag_evaluation_service_1 = require("./services/rag-evaluation.service");
const rag_query_collector_service_1 = require("./services/rag-query-collector.service");
const embedding_cache_service_1 = require("./services/embedding-cache.service");
const reranking_service_1 = require("./services/reranking.service");
const rag_monitoring_service_1 = require("./services/rag-monitoring.service");
const query_expansion_service_1 = require("./services/query-expansion.service");
const rag_testset_service_1 = require("./services/rag-testset.service");
const rag_fallback_service_1 = require("./services/rag-fallback.service");
const gate_decision_logger_service_1 = require("./services/gate-decision-logger.service");
const rag_freshness_service_1 = require("./services/rag-freshness.service");
const mcp_tools_service_1 = require("./services/mcp-tools.service");
const redis_cache_service_1 = require("./services/redis-cache.service");
const hybrid_cache_service_1 = require("./services/hybrid-cache.service");
const retry_helper_service_1 = require("./services/retry-helper.service");
const parallel_executor_service_1 = require("./services/parallel-executor.service");
const query_intent_service_1 = require("./services/query-intent.service");
const llm_module_1 = require("../llm/llm.module");
const rag_controller_1 = require("./rag.controller");
const rag_metrics_service_1 = require("./services/rag-metrics.service");
const skills_module_1 = require("../skills/skills.module");
const kpu_module_1 = require("../kpu/kpu.module");
let RagModule = class RagModule {
};
exports.RagModule = RagModule;
exports.RagModule = RagModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => places_module_1.PlacesModule),
            config_1.ConfigModule,
            schedule_1.ScheduleModule,
            knowledge_base_module_1.KnowledgeBaseModule,
            redis_module_1.RedisModule,
            llm_module_1.LlmModule,
            (0, common_1.forwardRef)(() => skills_module_1.SkillsModule),
            (0, common_1.forwardRef)(() => kpu_module_1.KPUModule),
        ],
        controllers: [rag_controller_1.RagController],
        providers: [
            rag_service_1.RagService,
            chunk_retrieval_service_1.ChunkRetrievalService,
            llm_extraction_service_1.LlmExtractionService,
            compliance_facts_agent_service_1.ComplianceFactsAgent,
            route_knowledge_curator_service_1.RouteKnowledgeCurator,
            local_insight_service_1.LocalInsightService,
            enhanced_chat_service_1.EnhancedChatService,
            rag_evaluation_service_1.RAGEvaluationService,
            rag_query_collector_service_1.RAGQueryCollectorService,
            embedding_cache_service_1.EmbeddingCacheService,
            reranking_service_1.RerankingService,
            rag_monitoring_service_1.RAGMonitoringService,
            query_expansion_service_1.QueryExpansionService,
            query_intent_service_1.QueryIntentService,
            rag_testset_service_1.RagTestsetService,
            rag_fallback_service_1.RagFallbackService,
            gate_decision_logger_service_1.GateDecisionLoggerService,
            rag_freshness_service_1.RagFreshnessService,
            mcp_tools_service_1.McpToolsService,
            redis_cache_service_1.RedisCacheService,
            hybrid_cache_service_1.HybridCacheService,
            retry_helper_service_1.RetryHelperService,
            parallel_executor_service_1.ParallelExecutorService,
            rag_metrics_service_1.RagMetricsService,
        ],
        exports: [
            rag_service_1.RagService,
            chunk_retrieval_service_1.ChunkRetrievalService,
            compliance_facts_agent_service_1.ComplianceFactsAgent,
            route_knowledge_curator_service_1.RouteKnowledgeCurator,
            local_insight_service_1.LocalInsightService,
            enhanced_chat_service_1.EnhancedChatService,
            rag_evaluation_service_1.RAGEvaluationService,
            rag_query_collector_service_1.RAGQueryCollectorService,
            embedding_cache_service_1.EmbeddingCacheService,
            reranking_service_1.RerankingService,
            rag_monitoring_service_1.RAGMonitoringService,
            query_expansion_service_1.QueryExpansionService,
            query_intent_service_1.QueryIntentService,
            rag_testset_service_1.RagTestsetService,
            rag_fallback_service_1.RagFallbackService,
            gate_decision_logger_service_1.GateDecisionLoggerService,
            rag_freshness_service_1.RagFreshnessService,
            mcp_tools_service_1.McpToolsService,
            redis_cache_service_1.RedisCacheService,
            hybrid_cache_service_1.HybridCacheService,
            retry_helper_service_1.RetryHelperService,
            parallel_executor_service_1.ParallelExecutorService,
            rag_metrics_service_1.RagMetricsService,
        ],
    })
], RagModule);
//# sourceMappingURL=rag.module.js.map