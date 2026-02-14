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
exports.RagController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const rag_service_1 = require("./services/rag.service");
const chunk_retrieval_service_1 = require("./services/chunk-retrieval.service");
const compliance_facts_agent_service_1 = require("./services/compliance-facts-agent.service");
const route_knowledge_curator_service_1 = require("./services/route-knowledge-curator.service");
const local_insight_service_1 = require("./services/local-insight.service");
const enhanced_chat_service_1 = require("./services/enhanced-chat.service");
const rag_evaluation_service_1 = require("./services/rag-evaluation.service");
const rag_query_collector_service_1 = require("./services/rag-query-collector.service");
const embedding_cache_service_1 = require("./services/embedding-cache.service");
const rag_monitoring_service_1 = require("./services/rag-monitoring.service");
const rag_testset_service_1 = require("./services/rag-testset.service");
const indexing_service_1 = require("../knowledge-base/services/indexing.service");
const rag_metrics_service_1 = require("./services/rag-metrics.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let RagController = class RagController {
    constructor(ragService, chunkRetrieval, complianceFactsAgent, routeKnowledgeCurator, localInsightService, enhancedChat, ragEvaluation, ragQueryCollector, embeddingCacheService, ragMonitoringService, ragTestsetService, indexingService, ragMetricsService) {
        this.ragService = ragService;
        this.chunkRetrieval = chunkRetrieval;
        this.complianceFactsAgent = complianceFactsAgent;
        this.routeKnowledgeCurator = routeKnowledgeCurator;
        this.localInsightService = localInsightService;
        this.enhancedChat = enhancedChat;
        this.ragEvaluation = ragEvaluation;
        this.ragQueryCollector = ragQueryCollector;
        this.embeddingCacheService = embeddingCacheService;
        this.ragMonitoringService = ragMonitoringService;
        this.ragTestsetService = ragTestsetService;
        this.indexingService = indexingService;
        this.ragMetricsService = ragMetricsService;
    }
    async retrieve(query, collection, countryCode, limit) {
        return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '此端点已废弃。document_index表已删除，请使用 POST /api/rag/chunks/retrieve 接口', {
            deprecated: true,
            newEndpoint: 'POST /api/rag/chunks/retrieve',
            migrationGuide: '/api/rag/RAG_API_MIGRATION_GUIDE.md',
        });
    }
    async search(body) {
        return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, '此端点已废弃。document_index表已删除，请使用 POST /api/rag/chunks/retrieve 接口', {
            deprecated: true,
            newEndpoint: 'POST /api/rag/chunks/retrieve',
            migrationGuide: '/api/rag/RAG_API_MIGRATION_GUIDE.md',
        });
    }
    async getStats(collection) {
        try {
            const stats = await this.ragService.getStats(collection);
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async indexDocument(item) {
        throw new Error('document_index表已删除，此端点不再可用。请使用新系统（KnowledgeFile + Chunks）');
    }
    async indexDocuments(body) {
        throw new Error('document_index表已删除，此端点不再可用。请使用新系统（KnowledgeFile + Chunks）');
    }
    convertRouteToDocuments(routeData) {
        const documents = [];
        const { route, metadata, data_provenance } = routeData;
        if (!route) {
            return documents;
        }
        const routeId = route.route_id || 'unknown';
        const routeName = route.route_name || route.route_name_en || 'Unknown Route';
        const countryCode = this.extractCountryCode(route);
        documents.push({
            collection: 'travel_guides',
            title: `${routeName} - 路线概述`,
            content: this.formatRouteOverview(route),
            countryCode,
            tags: ['route', 'overview', route.route_type || 'self-drive'],
            source: `route:${routeId}`,
            metadata: {
                routeId,
                routeType: route.route_type,
                durationDays: route.duration_days,
                difficultyLevel: route.difficulty_level,
                ...metadata,
            },
        });
        if (route.key_stops && Array.isArray(route.key_stops)) {
            route.key_stops.forEach((stop, index) => {
                documents.push({
                    collection: 'travel_guides',
                    title: `${routeName} - ${stop.name || stop.name_en || `站点${index + 1}`}`,
                    content: this.formatStopContent(stop, route),
                    countryCode,
                    tags: ['route', 'stop', 'poi', stop.type || 'attraction'],
                    source: `route:${routeId}:stop:${stop.stop_id || index}`,
                    metadata: {
                        routeId,
                        stopId: stop.stop_id,
                        stopIndex: index,
                        coordinates: stop.coordinates,
                        ...stop,
                    },
                });
            });
        }
        if (route.risk_assessment) {
            documents.push({
                collection: 'travel_guides',
                title: `${routeName} - 风险评估与安全提示`,
                content: this.formatRiskAssessment(route.risk_assessment, route),
                countryCode,
                tags: ['route', 'safety', 'risk-assessment'],
                source: `route:${routeId}:risk`,
                metadata: {
                    routeId,
                    riskLevel: route.risk_assessment.overall_risk_level,
                    riskScore: route.risk_assessment.risk_score,
                },
            });
        }
        if (route.seasonal_variations) {
            Object.entries(route.seasonal_variations).forEach(([season, data]) => {
                documents.push({
                    collection: 'travel_guides',
                    title: `${routeName} - ${season === 'summer' ? '夏季' : season === 'winter' ? '冬季' : season === 'spring' ? '春季' : season === 'autumn' ? '秋季' : season}旅行指南`,
                    content: this.formatSeasonalInfo(season, data, route),
                    countryCode,
                    tags: ['route', 'seasonal', season],
                    source: `route:${routeId}:season:${season}`,
                    metadata: {
                        routeId,
                        season,
                        months: data.months,
                    },
                });
            });
        }
        if (route.decision_support_summary) {
            documents.push({
                collection: 'travel_guides',
                title: `${routeName} - 决策支持信息`,
                content: this.formatDecisionSupport(route.decision_support_summary, route),
                countryCode,
                tags: ['route', 'decision-support', 'planning'],
                source: `route:${routeId}:decision`,
                metadata: {
                    routeId,
                },
            });
        }
        return documents;
    }
    extractCountryCode(route) {
        var _a;
        if ((_a = route.start_point) === null || _a === void 0 ? void 0 : _a.coordinates) {
        }
        if (route.route_id) {
            const routeIdLower = route.route_id.toLowerCase();
            if (routeIdLower.includes('iceland'))
                return 'IS';
            if (routeIdLower.includes('japan'))
                return 'JP';
            if (routeIdLower.includes('switzerland'))
                return 'CH';
        }
        return undefined;
    }
    formatRouteOverview(route) {
        const parts = [];
        parts.push(`路线名称：${route.route_name || route.route_name_en || '未知路线'}`);
        if (route.route_name_en && route.route_name !== route.route_name_en) {
            parts.push(`英文名称：${route.route_name_en}`);
        }
        if (route.duration_days) {
            parts.push(`行程天数：${route.duration_days}天`);
        }
        if (route.total_distance_km) {
            parts.push(`总距离：${route.total_distance_km}公里`);
        }
        if (route.difficulty_level) {
            parts.push(`难度等级：${route.difficulty_level}`);
        }
        if (route.best_seasons && Array.isArray(route.best_seasons)) {
            parts.push(`最佳季节：${route.best_seasons.join('、')}`);
        }
        if (route.avoid_seasons && Array.isArray(route.avoid_seasons)) {
            parts.push(`避免季节：${route.avoid_seasons.join('、')}`);
        }
        if (route.rhythm_pattern) {
            parts.push(`节奏模式：${route.rhythm_pattern}`);
        }
        if (route.start_point) {
            parts.push(`起点：${route.start_point.name || route.start_point.name_en || '未知'}`);
        }
        if (route.end_point) {
            parts.push(`终点：${route.end_point.name || route.end_point.name_en || '未知'}`);
        }
        if (route.route_characteristics) {
            const rc = route.route_characteristics;
            if (rc.road_quality) {
                parts.push(`路况：${rc.road_quality.surface_type || '未知'}，${rc.road_quality.condition || '未知'}`);
                if (rc.road_quality.paved_percentage) {
                    parts.push(`铺装路面比例：${rc.road_quality.paved_percentage}%`);
                }
            }
        }
        if (route.user_feedback_summary) {
            const ufs = route.user_feedback_summary;
            if (ufs.average_rating) {
                parts.push(`用户评分：${ufs.average_rating}/5.0（基于${ufs.total_reviews || 0}条评价）`);
            }
            if (ufs.common_praises && Array.isArray(ufs.common_praises)) {
                parts.push(`用户好评：${ufs.common_praises.join('、')}`);
            }
            if (ufs.tips_from_users && Array.isArray(ufs.tips_from_users)) {
                parts.push(`用户建议：${ufs.tips_from_users.join('；')}`);
            }
        }
        return parts.join('\n\n');
    }
    formatStopContent(stop, route) {
        const parts = [];
        parts.push(`站点名称：${stop.name || stop.name_en || '未知站点'}`);
        if (stop.name_en && stop.name !== stop.name_en) {
            parts.push(`英文名称：${stop.name_en}`);
        }
        if (stop.type) {
            parts.push(`类型：${stop.type}`);
        }
        if (stop.recommended_time_minutes) {
            parts.push(`建议游览时间：${stop.recommended_time_minutes}分钟`);
        }
        if (stop.highlights && Array.isArray(stop.highlights)) {
            parts.push(`亮点：\n${stop.highlights.map((h) => `- ${h}`).join('\n')}`);
        }
        if (stop.safety_warnings && Array.isArray(stop.safety_warnings)) {
            parts.push(`安全提示：\n${stop.safety_warnings.map((w) => `⚠️ ${w}`).join('\n')}`);
        }
        if (stop.accessibility) {
            const acc = stop.accessibility;
            if (acc.wheelchair_friendly) {
                parts.push(`无障碍设施：${acc.wheelchair_friendly}`);
            }
            if (acc.parking) {
                parts.push(`停车：${acc.parking}`);
            }
            if (acc.facilities && Array.isArray(acc.facilities)) {
                parts.push(`设施：${acc.facilities.join('、')}`);
            }
        }
        if (stop.fees) {
            const fees = stop.fees;
            const feeParts = [];
            if (fees.admission) {
                feeParts.push(`门票：${fees.admission}`);
            }
            if (fees.parking) {
                feeParts.push(`停车费：${fees.parking}`);
            }
            if (fees.parking_isk) {
                feeParts.push(`停车费：${fees.parking_isk} ISK${fees.parking_usd ? ` (约${fees.parking_usd} USD)` : ''}`);
            }
            if (fees.admission_isk) {
                feeParts.push(`门票：${fees.admission_isk} ISK${fees.admission_usd ? ` (约${fees.admission_usd} USD)` : ''}`);
            }
            if (feeParts.length > 0) {
                parts.push(`费用：${feeParts.join('；')}`);
            }
        }
        return parts.join('\n\n');
    }
    formatRiskAssessment(risk, route) {
        const parts = [];
        parts.push(`总体风险等级：${risk.overall_risk_level || '未知'}`);
        if (risk.risk_score !== undefined) {
            parts.push(`风险评分：${risk.risk_score}`);
        }
        if (risk.risk_breakdown) {
            parts.push('\n风险分解：');
            Object.entries(risk.risk_breakdown).forEach(([key, value]) => {
                const riskName = {
                    weather_risk: '天气风险',
                    terrain_risk: '地形风险',
                    accessibility_risk: '可达性风险',
                    health_risk: '健康风险',
                    navigation_risk: '导航风险',
                    service_risk: '服务风险',
                }[key] || key;
                parts.push(`\n${riskName}：`);
                parts.push(`- 严重程度：${value.severity || '未知'}`);
                parts.push(`- 评分：${value.score || '未知'}`);
                if (value.description) {
                    parts.push(`- 描述：${value.description}`);
                }
                if (value.mitigation && Array.isArray(value.mitigation)) {
                    parts.push(`- 缓解措施：\n${value.mitigation.map((m) => `  • ${m}`).join('\n')}`);
                }
            });
        }
        if (risk.critical_safety_notes && Array.isArray(risk.critical_safety_notes)) {
            parts.push('\n关键安全提示：');
            risk.critical_safety_notes.forEach((note) => {
                parts.push(`⚠️ ${note}`);
            });
        }
        if (risk.emergency_contacts && Array.isArray(risk.emergency_contacts)) {
            parts.push('\n紧急联系方式：');
            risk.emergency_contacts.forEach((contact) => {
                parts.push(`- ${contact.service}：${contact.number}`);
            });
        }
        return parts.join('\n');
    }
    formatSeasonalInfo(season, data, route) {
        const seasonName = {
            summer: '夏季',
            winter: '冬季',
            spring: '春季',
            autumn: '秋季',
        }[season] || season;
        const parts = [];
        parts.push(`${seasonName}旅行指南（${route.route_name || route.route_name_en || '未知路线'}）`);
        if (data.months && Array.isArray(data.months)) {
            parts.push(`月份：${data.months.join('、')}`);
        }
        if (data.characteristics) {
            const chars = data.characteristics;
            if (chars.daylight_hours) {
                parts.push(`日照时长：${chars.daylight_hours}`);
            }
            if (chars.temperature_celsius) {
                parts.push(`温度：${chars.temperature_celsius}°C`);
            }
            if (chars.weather) {
                parts.push(`天气：${chars.weather}`);
            }
            if (chars.road_conditions) {
                parts.push(`路况：${chars.road_conditions}`);
            }
            if (chars.tourist_volume) {
                parts.push(`游客量：${chars.tourist_volume}`);
            }
        }
        if (data.pros && Array.isArray(data.pros)) {
            parts.push(`\n优点：\n${data.pros.map((p) => `✓ ${p}`).join('\n')}`);
        }
        if (data.cons && Array.isArray(data.cons)) {
            parts.push(`\n缺点：\n${data.cons.map((c) => `✗ ${c}`).join('\n')}`);
        }
        if (data.recommendation) {
            parts.push(`\n推荐：${data.recommendation}`);
        }
        if (data.special_requirements && Array.isArray(data.special_requirements)) {
            parts.push(`\n特殊要求：\n${data.special_requirements.map((r) => `• ${r}`).join('\n')}`);
        }
        return parts.join('\n');
    }
    formatDecisionSupport(decision, route) {
        const parts = [];
        if (decision.should_you_go) {
            parts.push(`是否适合：${decision.should_you_go}`);
        }
        if (decision.ideal_for && Array.isArray(decision.ideal_for)) {
            parts.push(`\n适合人群：\n${decision.ideal_for.map((item) => `✓ ${item}`).join('\n')}`);
        }
        if (decision.not_ideal_for && Array.isArray(decision.not_ideal_for)) {
            parts.push(`\n不适合人群：\n${decision.not_ideal_for.map((item) => `✗ ${item}`).join('\n')}`);
        }
        if (decision.key_decision_questions && Array.isArray(decision.key_decision_questions)) {
            parts.push(`\n关键决策问题：`);
            decision.key_decision_questions.forEach((q) => {
                parts.push(`\n问题：${q.question}`);
                if (q.if_yes) {
                    parts.push(`如果"是"：${q.if_yes}`);
                }
                if (q.if_no) {
                    parts.push(`如果"否"：${q.if_no}`);
                }
            });
        }
        return parts.join('\n');
    }
    async extractRailPassRules(body) {
        return this.complianceFactsAgent.extractRailPassRules(body.passType, body.countryCode);
    }
    async extractTrailAccessRules(body) {
        return this.complianceFactsAgent.extractTrailAccessRules(body.trailId, body.countryCode);
    }
    async refreshComplianceRules() {
        await this.complianceFactsAgent.refreshComplianceRules();
        return { success: true, message: 'Compliance rules refresh started' };
    }
    async getRouteNarrative(routeDirectionId, countryCode, includeLocalInsights) {
        const narrative = await this.routeKnowledgeCurator.enrichRouteNarrative(routeDirectionId, countryCode);
        if (includeLocalInsights === 'true' && countryCode) {
            const insights = await this.localInsightService.getLocalInsight(countryCode, ['travel-guide']);
            return {
                narrative,
                localInsights: insights,
            };
        }
        return narrative;
    }
    async getSegmentNarrative(body) {
        return this.routeKnowledgeCurator.enrichSegmentNarrative(body.segmentId, body.dayIndex, {
            name: body.name,
            description: body.description,
            countryCode: body.countryCode,
        });
    }
    async getLocalInsight(countryCode, tags, region) {
        const tagArray = Array.isArray(tags) ? tags : tags.split(',');
        return this.localInsightService.getLocalInsight(countryCode, tagArray, region);
    }
    async refreshLocalInsight(body) {
        return this.localInsightService.refreshLocalInsight(body.countryCode, body.tags, body.region);
    }
    async answerRouteQuestion(body) {
        const context = {
            routeDirectionId: body.routeDirectionId,
            countryCode: body.countryCode,
            segmentId: body.segmentId,
            dayIndex: body.dayIndex,
            tripId: body.tripId,
        };
        return this.enhancedChat.answerRouteQuestion(body.question, context);
    }
    async explainWhyNotOtherRoute(body) {
        return this.enhancedChat.explainWhyNotOtherRoute(body.selectedRouteId, body.alternativeRouteId, body.countryCode);
    }
    async getDestinationInsights(placeId, tripId, countryCode) {
        try {
            const ragResults = await this.chunkRetrieval.retrieve({
                query: `目的地实用信息、特色贴士、隐藏攻略、文化礼仪`,
                category: 'travel_guides',
                limit: 10,
                useHybridSearch: true,
            });
            let localInsights = [];
            if (countryCode) {
                try {
                    localInsights = await this.localInsightService.getLocalInsight(countryCode, ['culture', 'tips', 'etiquette', 'hidden_gems']);
                }
                catch (error) {
                }
            }
            let routeInsights = null;
            if (tripId) {
                try {
                    const context = {
                        tripId,
                        countryCode,
                    };
                    routeInsights = await this.enhancedChat.answerRouteQuestion(`获取 ${placeId} 的深度实用信息和小众攻略`, context);
                }
                catch (error) {
                }
            }
            return (0, standard_response_dto_1.successResponse)({
                placeId,
                insights: {
                    tips: ragResults.map(r => {
                        var _a;
                        return ({
                            content: r.content,
                            source: r.sourceFile || ((_a = r.metadata) === null || _a === void 0 ? void 0 : _a.sourceUrl),
                            score: r.similarity || r.hybridScore || 0,
                        });
                    }),
                    localInsights: localInsights.map(li => ({
                        content: li.content,
                        tags: li.tags,
                    })),
                    routeInsights: routeInsights ? {
                        answer: routeInsights.answer,
                        source: routeInsights.source,
                    } : null,
                },
                credibility: {
                    ragSources: ragResults.length,
                    localInsightsCount: localInsights.length,
                    hasRouteContext: !!tripId,
                },
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async extractComplianceRules(body) {
        try {
            const rules = [];
            const checklist = [];
            for (const countryCode of body.countryCodes) {
                if (!body.ruleTypes || body.ruleTypes.includes('TRANSPORT')) {
                    try {
                        const railPassRules = await this.complianceFactsAgent.extractRailPassRules('Eurail Global Pass', countryCode);
                        if (railPassRules && railPassRules.length > 0) {
                            rules.push(...railPassRules);
                            checklist.push({
                                category: '交通规则',
                                items: railPassRules.map(rule => ({
                                    description: `Pass类型: ${rule.passType}, 需要预订: ${rule.requiresReservation ? '是' : '否'}`,
                                    required: rule.requiresReservation || false,
                                    deadline: undefined,
                                    source: 'RAG提取',
                                })),
                            });
                        }
                    }
                    catch (error) {
                    }
                }
                if (!body.ruleTypes || body.ruleTypes.includes('ENTRY')) {
                    try {
                        const trailRules = await this.chunkRetrieval.retrieve({
                            query: `${countryCode} trail access rules permits`,
                            category: 'compliance_rules',
                            chunkCategory: 'RULES',
                            limit: 5,
                            useHybridSearch: true,
                        });
                        if (trailRules.length > 0) {
                            checklist.push({
                                category: '路线准入规则',
                                items: trailRules.map(rule => {
                                    var _a;
                                    return ({
                                        description: rule.content.substring(0, 200),
                                        required: true,
                                        source: rule.sourceFile || ((_a = rule.metadata) === null || _a === void 0 ? void 0 : _a.sourceUrl) || 'RAG检索',
                                    });
                                }),
                            });
                        }
                    }
                    catch (error) {
                    }
                }
                if (!body.ruleTypes || body.ruleTypes.includes('VISA')) {
                    try {
                        const visaRules = await this.chunkRetrieval.retrieve({
                            query: `${countryCode} visa requirements for Chinese citizens`,
                            category: 'compliance_rules',
                            chunkCategory: 'RULES',
                            limit: 5,
                            useHybridSearch: true,
                        });
                        if (visaRules.length > 0) {
                            checklist.push({
                                category: '签证规则',
                                items: visaRules.map(rule => {
                                    var _a;
                                    return ({
                                        description: rule.content.substring(0, 200),
                                        required: true,
                                        deadline: '出发前至少30天',
                                        source: rule.sourceFile || ((_a = rule.metadata) === null || _a === void 0 ? void 0 : _a.sourceUrl) || 'RAG检索',
                                    });
                                }),
                            });
                        }
                    }
                    catch (error) {
                    }
                }
            }
            return (0, standard_response_dto_1.successResponse)({
                tripId: body.tripId,
                countryCodes: body.countryCodes,
                rules,
                checklist,
                summary: {
                    totalRules: rules.length,
                    totalChecklistItems: checklist.reduce((sum, cat) => sum + cat.items.length, 0),
                    categories: checklist.map(cat => cat.category),
                },
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getDocuments(collection, countryCode, tags, page, pageSize, search) {
        try {
            const pageNum = page ? parseInt(page.toString()) : 1;
            const size = pageSize ? parseInt(pageSize.toString()) : 20;
            const tagArray = tags ? tags.split(',').map(t => t.trim()) : undefined;
            const result = await this.ragService.getDocuments({
                collection,
                countryCode,
                tags: tagArray,
                search,
                page: pageNum,
                pageSize: size,
            });
            const documentsWithPreview = result.documents.map(doc => ({
                ...doc,
                contentPreview: doc.content.length > 200
                    ? doc.content.substring(0, 200) + '...'
                    : doc.content,
            }));
            return (0, standard_response_dto_1.successResponse)({
                documents: documentsWithPreview,
                pagination: result.pagination,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getDocument(id) {
        try {
            const document = await this.ragService.getDocument(id);
            if (!document) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, '文档不存在');
            }
            return (0, standard_response_dto_1.successResponse)(document);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateDocument(id, item) {
        throw new Error('document_index表已删除，此端点不再可用');
    }
    async deleteDocument(id) {
        throw new Error('document_index表已删除，此端点不再可用');
    }
    async evaluateRetrieval(body) {
        try {
            const result = await this.ragEvaluation.evaluateRetrieval(body.query, body.params, body.groundTruthDocumentIds);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async evaluateBatch(body) {
        try {
            const result = await this.ragEvaluation.evaluateBatch(body.testCases);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async evaluateChunkRetrieval(body) {
        try {
            const result = await this.ragEvaluation.evaluateChunkRetrieval(body.query, body.params, body.groundTruthChunkIds);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async evaluateChunkBatch(body) {
        try {
            const result = await this.ragEvaluation.evaluateChunkBatch(body.testCases);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getEvalTestset() {
        try {
            const testset = await this.ragTestsetService.load();
            return (0, standard_response_dto_1.successResponse)(testset);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async saveEvalTestset(body) {
        try {
            await this.ragTestsetService.save(body);
            return (0, standard_response_dto_1.successResponse)({ message: 'testset saved' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async runEvalTestset(body) {
        try {
            const testset = await this.ragTestsetService.load();
            const defaultParams = body.params || {};
            const limit = body.limit || 10;
            const cases = testset.testCases.map((tc) => ({
                query: tc.query,
                params: { query: tc.query, limit, ...defaultParams },
                groundTruthChunkIds: tc.groundTruthChunkIds,
            }));
            const result = await this.ragEvaluation.evaluateChunkBatch(cases);
            return (0, standard_response_dto_1.successResponse)({
                testset: { name: testset.name, version: testset.version, updatedAt: testset.updatedAt },
                result,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findRelevantChunks(query, limit) {
        try {
            const chunks = await this.ragTestsetService.findRelevantChunks(query, limit || 10);
            return (0, standard_response_dto_1.successResponse)({
                query,
                chunks,
                count: chunks.length,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async listAllChunks(limit) {
        try {
            const chunks = await this.ragTestsetService.listAllChunks(limit || 100);
            return (0, standard_response_dto_1.successResponse)({
                chunks,
                count: chunks.length,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async collectQueryDocumentPair(body) {
        try {
            const pairId = await this.ragQueryCollector.collectQueryDocumentPair(body.query, body.correctDocumentIds, body.metadata);
            return (0, standard_response_dto_1.successResponse)({
                pairId,
                message: 'query-document 对已收集',
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async collectFromUserQuery(body) {
        try {
            const pairId = await this.ragQueryCollector.collectFromUserQuery(body.query, body.retrievedResults, body.userFeedback);
            if (!pairId) {
                return (0, standard_response_dto_1.successResponse)({
                    message: '没有收集到 query-document 对（可能没有正确答案）',
                });
            }
            return (0, standard_response_dto_1.successResponse)({
                pairId,
                message: 'query-document 对已收集',
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async collectBatch(body) {
        try {
            const pairIds = await this.ragQueryCollector.collectBatch(body.pairs);
            return (0, standard_response_dto_1.successResponse)({
                pairIds,
                successCount: pairIds.length,
                totalCount: body.pairs.length,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getQueryPairs(source, collection, countryCode, limit) {
        try {
            const pairs = await this.ragQueryCollector.getCollectedPairs({
                source,
                collection,
                countryCode,
                limit: limit ? parseInt(limit.toString()) : undefined,
            });
            return (0, standard_response_dto_1.successResponse)({
                pairs,
                total: pairs.length,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async exportForEvaluation(body) {
        try {
            const evaluationDataset = await this.ragQueryCollector.exportForEvaluation(body.pairs);
            return (0, standard_response_dto_1.successResponse)({
                evaluationDataset,
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async retrieveChunks(body) {
        try {
            const results = await this.chunkRetrieval.retrieve({
                query: body.query,
                limit: body.limit || 10,
                credibilityMin: body.credibilityMin || 0.5,
                type: body.type,
                category: body.category,
                chunkCategory: body.chunkCategory,
                fileId: body.fileId,
                useHybridSearch: body.useHybridSearch !== false,
                denseWeight: body.denseWeight || 0.6,
                sparseWeight: body.sparseWeight || 0.4,
                useReranking: body.useReranking === true,
                rerankTopK: body.rerankTopK || 20,
                useQueryExpansion: body.useQueryExpansion === true,
                maxQueryVariants: body.maxQueryVariants || 3,
                useIntentClassification: body.useIntentClassification === true,
            });
            return (0, standard_response_dto_1.successResponse)(results);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async rebuildKnowledgeBaseIndex() {
        try {
            await this.indexingService.rebuildIndex();
            return (0, standard_response_dto_1.successResponse)({ message: '知识库索引重建完成' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async clearKnowledgeBaseIndex() {
        try {
            await this.indexingService.clearIndex();
            return (0, standard_response_dto_1.successResponse)({ message: '知识库索引已清空' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getCacheStats() {
        try {
            const stats = this.embeddingCacheService.getStats();
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async resetCacheStats() {
        try {
            this.embeddingCacheService.resetStats();
            return (0, standard_response_dto_1.successResponse)({ message: '缓存统计已重置' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async clearCache() {
        try {
            await this.embeddingCacheService.clear();
            return (0, standard_response_dto_1.successResponse)({ message: 'Embedding缓存已清空（内存缓存），Redis缓存需要手动清空' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getMonitoringMetrics() {
        try {
            const metrics = this.ragMonitoringService.getAllMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPerformanceMetrics() {
        try {
            const metrics = this.ragMonitoringService.getPerformanceMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getQualityMetrics() {
        try {
            const metrics = this.ragMonitoringService.getQualityMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getCostMetrics() {
        try {
            const metrics = this.ragMonitoringService.getCostMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async resetMonitoringMetrics() {
        try {
            this.ragMonitoringService.resetMetrics();
            return (0, standard_response_dto_1.successResponse)({ message: '监控指标已重置' });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPrometheusMetrics() {
        return this.ragMetricsService.getMetrics();
    }
    async getMetricsStats() {
        try {
            const cacheStats = await this.ragMetricsService.getCacheStats();
            return (0, standard_response_dto_1.successResponse)({
                cache: {
                    hits: cacheStats.hits,
                    misses: cacheStats.misses,
                    hitRate: `${(cacheStats.hitRate * 100).toFixed(2)}%`,
                },
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.RagController = RagController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('retrieve'),
    (0, swagger_1.ApiOperation)({
        summary: '检索文档（已废弃）',
        description: '⚠️ document_index表已删除，此端点不再可用。请使用 POST /api/rag/chunks/retrieve',
        deprecated: true
    }),
    (0, swagger_1.ApiQuery)({ name: 'query', description: '查询文本', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'collection', description: '集合名称', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Query)('query')),
    __param(1, (0, common_1.Query)('collection')),
    __param(2, (0, common_1.Query)('countryCode')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "retrieve", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('search'),
    (0, swagger_1.ApiOperation)({
        summary: 'RAG 搜索（已废弃）',
        description: '⚠️ document_index表已删除，此端点不再可用。请使用 POST /api/rag/chunks/retrieve',
        deprecated: true
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '查询文本' },
                collection: { type: 'string', description: '集合名称' },
                countryCode: { type: 'string', description: '国家代码' },
                tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
                limit: { type: 'number', description: '返回数量限制', default: 10 },
                minScore: { type: 'number', description: '最小相似度分数', default: 0.5 },
            },
            required: ['query', 'collection'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "search", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({
        summary: 'RAG 统计',
        description: '获取 RAG 知识库的统计信息，包括文档数量、集合统计等',
    }),
    (0, swagger_1.ApiQuery)({ name: 'collection', description: '集合名称（可选，不提供则返回所有集合的统计）', required: false }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '统计成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('collection')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('index'),
    (0, swagger_1.ApiOperation)({
        summary: '索引文档（已废弃）',
        description: '⚠️ document_index表已删除，此端点不再可用。请使用新系统（KnowledgeFile + Chunks）',
    }),
    (0, swagger_1.ApiBody)({ type: Object, description: '文档索引项' }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "indexDocument", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('index/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量索引文档（已废弃）',
        description: '⚠️ document_index表已删除，此端点不再可用。请使用新系统（KnowledgeFile + Chunks）',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            oneOf: [
                {
                    type: 'array',
                    items: { type: 'object' },
                    description: '文档索引项数组'
                },
                {
                    type: 'object',
                    description: '路线JSON对象（包含route字段）'
                }
            ]
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "indexDocuments", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('compliance/rail-pass'),
    (0, swagger_1.ApiOperation)({
        summary: '提取 Rail Pass 规则',
        description: '从文档中提取铁路通票相关的合规规则',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                passType: { type: 'string', description: '通票类型' },
                countryCode: { type: 'string', description: '国家代码' },
            },
            required: ['passType', 'countryCode'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '提取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "extractRailPassRules", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('compliance/trail-access'),
    (0, swagger_1.ApiOperation)({
        summary: '提取 Trail Access 规则',
        description: '从文档中提取步道访问相关的合规规则',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                trailId: { type: 'string', description: '步道 ID' },
                countryCode: { type: 'string', description: '国家代码' },
            },
            required: ['trailId', 'countryCode'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '提取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "extractTrailAccessRules", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('compliance/refresh'),
    (0, swagger_1.ApiOperation)({
        summary: '刷新合规规则缓存',
        description: '手动触发合规规则缓存刷新，用于后台管理系统。会重新从知识库加载最新的合规规则。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '刷新启动成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Compliance rules refresh started' },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "refreshComplianceRules", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('route-narrative/:routeDirectionId'),
    (0, swagger_1.ApiOperation)({
        summary: '生成路线叙事',
        description: '为指定路线生成丰富的叙事内容。可通过 includeLocalInsights 参数选择是否包含当地洞察信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'routeDirectionId', description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeLocalInsights', description: '是否包含当地洞察信息', required: false, type: Boolean }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '生成成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Param)('routeDirectionId')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('includeLocalInsights')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getRouteNarrative", null);
__decorate([
    (0, common_1.Post)('segment-narrative'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getSegmentNarrative", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('local-insight'),
    (0, swagger_1.ApiOperation)({
        summary: '获取当地洞察',
        description: '获取指定地区的当地洞察信息',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'tags', description: '标签（逗号分隔或数组）', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'region', description: '地区', required: false }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('tags')),
    __param(2, (0, common_1.Query)('region')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getLocalInsight", null);
__decorate([
    (0, common_1.Post)('local-insight/refresh'),
    (0, swagger_1.ApiOperation)({
        summary: '刷新当地洞察缓存',
        description: '手动触发指定地区的当地洞察信息缓存刷新，用于后台管理系统。',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                countryCode: { type: 'string', description: '国家代码', example: 'IS' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '标签列表',
                    example: ['culture', 'tips', 'etiquette'],
                },
                region: { type: 'string', description: '地区（可选）', example: 'Reykjavik' },
            },
            required: ['countryCode', 'tags'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '刷新成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                refreshedAt: { type: 'string', format: 'date-time' },
                countryCode: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "refreshLocalInsight", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chat/answer-route-question'),
    (0, swagger_1.ApiOperation)({
        summary: '回答路线问题',
        description: '使用增强对话功能回答关于路线的问题',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                question: { type: 'string', description: '问题文本' },
                routeDirectionId: { type: 'string', description: '路线方向 ID' },
                countryCode: { type: 'string', description: '国家代码' },
                segmentId: { type: 'string', description: '路线段 ID' },
                dayIndex: { type: 'number', description: '天数索引' },
                tripId: { type: 'string', description: '行程 ID' },
            },
            required: ['question'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '回答成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "answerRouteQuestion", null);
__decorate([
    (0, common_1.Post)('chat/explain-why-not-other-route'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "explainWhyNotOtherRoute", null);
__decorate([
    (0, common_1.Get)('destination-insights'),
    (0, swagger_1.ApiOperation)({
        summary: '获取目的地深度实用信息',
        description: '获取行程中目的地的特色贴士和隐藏攻略，包含文化礼仪、小众路线、实用信息等',
    }),
    (0, swagger_1.ApiQuery)({ name: 'placeId', description: '地点 ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID（可选）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码（可选）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回目的地深度信息',
    }),
    __param(0, (0, common_1.Query)('placeId')),
    __param(1, (0, common_1.Query)('tripId')),
    __param(2, (0, common_1.Query)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getDestinationInsights", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('extract-compliance-rules'),
    (0, swagger_1.ApiOperation)({
        summary: '提取行程相关合规规则',
        description: '自动获取行程涉及的签证和交通合规信息，生成合规清单',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['tripId', 'countryCodes'],
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                countryCodes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '国家代码列表',
                },
                ruleTypes: {
                    type: 'array',
                    items: { type: 'string', enum: ['VISA', 'TRANSPORT', 'ENTRY', 'EXIT'] },
                    description: '规则类型（可选）',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功提取合规规则',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "extractComplianceRules", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('documents'),
    (0, swagger_1.ApiOperation)({
        summary: '获取文档列表（后台管理）',
        description: '获取 RAG 知识库中的文档列表，支持分页、筛选等功能',
    }),
    (0, swagger_1.ApiQuery)({ name: 'collection', required: false, description: '集合名称' }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'tags', required: false, description: '标签（逗号分隔）' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码，从1开始', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, description: '每页数量', example: 20 }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, description: '搜索关键词（标题或内容）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('collection')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('tags')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('pageSize')),
    __param(5, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number, String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getDocuments", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('documents/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取文档详情（后台管理）',
        description: '根据文档 ID 获取文档的详细信息',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '文档 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getDocument", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('documents/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新文档（后台管理）',
        description: '更新 RAG 知识库中的文档，如果内容更新会自动重新生成 embedding',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '文档 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: '文档标题' },
                content: { type: 'string', description: '文档内容' },
                collection: { type: 'string', description: '集合名称' },
                countryCode: { type: 'string', description: '国家代码' },
                tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
                source: { type: 'string', description: '文档来源' },
                metadata: { type: 'object', description: '元数据' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "updateDocument", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('documents/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '删除文档（已废弃）',
        description: '⚠️ document_index表已删除，此端点不再可用',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '文档 ID' }),
    (0, swagger_1.ApiResponse)({ status: 410, description: '端点已废弃' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "deleteDocument", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('evaluation/evaluate'),
    (0, swagger_1.ApiOperation)({
        summary: '评估单次检索质量',
        description: '评估 RAG 检索的质量，返回 Recall@K、MRR、NDCG 等指标',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '查询文本' },
                params: {
                    type: 'object',
                    description: '检索参数',
                    properties: {
                        query: { type: 'string' },
                        collection: { type: 'string' },
                        countryCode: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                        limit: { type: 'number' },
                        minScore: { type: 'number' },
                    },
                },
                groundTruthDocumentIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '正确答案文档 ID 列表',
                },
            },
            required: ['query', 'params', 'groundTruthDocumentIds'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '评估成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "evaluateRetrieval", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('evaluation/evaluate-batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量评估检索质量',
        description: '批量评估多个查询的检索质量',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                testCases: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            params: { type: 'object' },
                            groundTruthDocumentIds: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
            },
            required: ['testCases'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量评估成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "evaluateBatch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('evaluation/chunks/evaluate'),
    (0, swagger_1.ApiOperation)({
        summary: '评估 Chunk 检索质量',
        description: '评估新知识库系统（Chunk 表）的检索质量，返回 Recall@K、MRR、NDCG 等指标',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '评估成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "evaluateChunkRetrieval", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('evaluation/chunks/evaluate-batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量评估 Chunk 检索质量',
        description: '批量评估多个查询在 Chunk 检索链路下的质量指标',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量评估成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "evaluateChunkBatch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('evaluation/testset'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 RAG 评估测试集（文件）',
        description: '读取 e2e-cases/rag-eval-testset.json（可由环境变量 RAG_EVAL_TESTSET_PATH 覆盖）',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getEvalTestset", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('evaluation/testset'),
    (0, swagger_1.ApiOperation)({
        summary: '保存 RAG 评估测试集（文件）',
        description: '写入 e2e-cases/rag-eval-testset.json',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "saveEvalTestset", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('evaluation/testset/run'),
    (0, swagger_1.ApiOperation)({
        summary: '运行测试集评估（Chunk 链路）',
        description: '读取测试集并对每个 case 运行 ChunkRetrieval 评估，支持配置 Hybrid/Rerank/Expansion 参数',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "runEvalTestset", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('evaluation/testset/find-chunks'),
    (0, swagger_1.ApiOperation)({
        summary: '查找相关 chunks',
        description: '根据查询文本查找相关的 chunks，用于帮助填充测试集的 groundTruthChunkIds',
    }),
    (0, swagger_1.ApiQuery)({ name: 'query', description: '查询文本', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制', required: false, type: Number }),
    __param(0, (0, common_1.Query)('query')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "findRelevantChunks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('evaluation/testset/list-chunks'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有 chunks',
        description: '列出数据库中的所有 chunks，用于浏览和选择 groundTruthChunkIds',
    }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制', required: false, type: Number }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "listAllChunks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('query-pairs/collect'),
    (0, swagger_1.ApiOperation)({
        summary: '收集 query-document 对',
        description: '收集用户查询和正确答案文档的配对，用于 RAG 评估和微调',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '查询文本' },
                correctDocumentIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '正确答案文档 ID 列表',
                },
                metadata: {
                    type: 'object',
                    description: '元数据',
                    properties: {
                        source: { type: 'string' },
                        userId: { type: 'string' },
                        sessionId: { type: 'string' },
                        collection: { type: 'string' },
                        countryCode: { type: 'string' },
                        tags: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
            required: ['query', 'correctDocumentIds'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '收集成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "collectQueryDocumentPair", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('query-pairs/collect-from-query'),
    (0, swagger_1.ApiOperation)({
        summary: '从用户查询自动收集 query-document 对',
        description: '基于检索结果和用户反馈自动收集 query-document 对',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '查询文本' },
                retrievedResults: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            score: { type: 'number' },
                        },
                    },
                    description: '检索结果',
                },
                userFeedback: {
                    type: 'object',
                    properties: {
                        clickedDocumentIds: { type: 'array', items: { type: 'string' } },
                        relevantDocumentIds: { type: 'array', items: { type: 'string' } },
                        irrelevantDocumentIds: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
            required: ['query', 'retrievedResults'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '收集成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "collectFromUserQuery", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('query-pairs/collect-batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量收集 query-document 对',
        description: '批量收集多个 query-document 对',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                pairs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            correctDocumentIds: { type: 'array', items: { type: 'string' } },
                            metadata: { type: 'object' },
                        },
                    },
                },
            },
            required: ['pairs'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量收集成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "collectBatch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('query-pairs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取收集的 query-document 对',
        description: '获取已收集的 query-document 对列表',
    }),
    (0, swagger_1.ApiQuery)({ name: 'source', required: false, description: '来源过滤' }),
    (0, swagger_1.ApiQuery)({ name: 'collection', required: false, description: '集合过滤' }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码过滤' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '返回数量限制' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('source')),
    __param(1, (0, common_1.Query)('collection')),
    __param(2, (0, common_1.Query)('countryCode')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getQueryPairs", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('query-pairs/export-for-evaluation'),
    (0, swagger_1.ApiOperation)({
        summary: '导出为评估数据集格式',
        description: '将 query-document 对导出为评估数据集格式',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                pairs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' },
                            correctDocumentIds: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
            },
            required: ['pairs'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '导出成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "exportForEvaluation", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chunks/retrieve'),
    (0, swagger_1.ApiOperation)({
        summary: '从 Chunk 表检索文档（支持 Hybrid Search）',
        description: '使用新的知识库系统（KnowledgeFile + Chunk）检索文档，默认启用混合检索（Dense + Sparse）',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '查询文本' },
                limit: { type: 'number', description: '返回数量限制', default: 10 },
                credibilityMin: { type: 'number', description: '最小可信度', default: 0.5 },
                type: { type: 'string', description: '文档类型' },
                category: { type: 'string', description: '文件分类' },
                fileId: { type: 'string', description: '文件ID' },
                useHybridSearch: { type: 'boolean', description: '是否使用混合检索（默认true，推荐启用，对中文查询更有效）', default: true },
                denseWeight: { type: 'number', description: 'Dense检索权重（默认0.6，优化后）', default: 0.6 },
                sparseWeight: { type: 'number', description: 'Sparse检索权重（默认0.4，优化后增强关键词匹配）', default: 0.4 },
                useReranking: { type: 'boolean', description: '是否使用重排序（默认false，启用后准确率可达100%，但延迟+2-3秒）', default: false },
                rerankTopK: { type: 'number', description: '重排序的Top-K数量（默认20）', default: 20 },
                useQueryExpansion: { type: 'boolean', description: '是否使用查询扩展（默认false，会增加延迟和成本但提升召回率）', default: false },
                maxQueryVariants: { type: 'number', description: '最大查询变体数量（默认3）', default: 3 },
                chunkCategory: { type: 'string', description: 'Chunk分类过滤 (RULES, POI_INFO, GATE, WEATHER, GENERAL)' },
                useIntentClassification: { type: 'boolean', description: '是否使用意图分类自动过滤（默认false）', default: false },
            },
            required: ['query'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '检索成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "retrieveChunks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('knowledge-base/rebuild-index'),
    (0, swagger_1.ApiOperation)({
        summary: '重建知识库索引',
        description: '清空并重新索引所有知识库文件',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '索引重建成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "rebuildKnowledgeBaseIndex", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('knowledge-base/clear-index'),
    (0, swagger_1.ApiOperation)({
        summary: '清空知识库索引',
        description: '清空所有知识库文件和分块',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '索引清空成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "clearKnowledgeBaseIndex", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('cache/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Embedding 缓存统计',
        description: '返回缓存命中率、延迟等统计信息',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getCacheStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('cache/reset-stats'),
    (0, swagger_1.ApiOperation)({
        summary: '重置缓存统计',
        description: '重置缓存命中率等统计信息',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '重置成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "resetCacheStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('cache/clear'),
    (0, swagger_1.ApiOperation)({
        summary: '清空 Embedding 缓存',
        description: '清空所有缓存的 embedding（注意：Redis缓存需要手动清空）',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '清空成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "clearCache", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('monitoring/metrics'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 RAG 监控指标',
        description: '返回性能、质量、成本、缓存等监控指标',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getMonitoringMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('monitoring/performance'),
    (0, swagger_1.ApiOperation)({
        summary: '获取性能指标',
        description: '返回检索延迟、吞吐量、错误率等性能指标',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getPerformanceMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('monitoring/quality'),
    (0, swagger_1.ApiOperation)({
        summary: '获取质量指标',
        description: '返回 Recall@K、MRR、NDCG 等质量指标（需要有 Ground Truth 数据）',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getQualityMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('monitoring/cost'),
    (0, swagger_1.ApiOperation)({
        summary: '获取成本指标',
        description: '返回 Embedding 和 LLM API 调用成本',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getCostMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('monitoring/reset'),
    (0, swagger_1.ApiOperation)({
        summary: '重置监控指标',
        description: '清空所有监控指标数据',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '重置成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "resetMonitoringMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('prometheus-metrics'),
    (0, swagger_1.ApiOperation)({
        summary: 'Prometheus 指标',
        description: '返回 Prometheus 格式的指标数据',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '指标数据', schema: { type: 'string' } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getPrometheusMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('metrics/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '统计信息',
        description: '返回人类可读的缓存统计信息',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '统计信息', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RagController.prototype, "getMetricsStats", null);
exports.RagController = RagController = __decorate([
    (0, swagger_1.ApiTags)('rag'),
    (0, common_1.Controller)('rag'),
    __metadata("design:paramtypes", [rag_service_1.RagService,
        chunk_retrieval_service_1.ChunkRetrievalService,
        compliance_facts_agent_service_1.ComplianceFactsAgent,
        route_knowledge_curator_service_1.RouteKnowledgeCurator,
        local_insight_service_1.LocalInsightService,
        enhanced_chat_service_1.EnhancedChatService,
        rag_evaluation_service_1.RAGEvaluationService,
        rag_query_collector_service_1.RAGQueryCollectorService,
        embedding_cache_service_1.EmbeddingCacheService,
        rag_monitoring_service_1.RAGMonitoringService,
        rag_testset_service_1.RagTestsetService,
        indexing_service_1.IndexingService,
        rag_metrics_service_1.RagMetricsService])
], RagController);
//# sourceMappingURL=rag.controller.js.map