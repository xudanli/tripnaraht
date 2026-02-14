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
var ClaudeLocalInsightAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeLocalInsightAgentService = void 0;
const common_1 = require("@nestjs/common");
const local_insight_service_1 = require("../../../rag/services/local-insight.service");
const spatial_replacement_service_1 = require("../../../trips/decision/services/spatial-replacement.service");
const poi_route_affinity_service_1 = require("../../../poi/services/poi-route-affinity.service");
let ClaudeLocalInsightAgentService = ClaudeLocalInsightAgentService_1 = class ClaudeLocalInsightAgentService {
    constructor(localInsightService, spatialReplacement, poiAffinity) {
        this.localInsightService = localInsightService;
        this.spatialReplacement = spatialReplacement;
        this.poiAffinity = poiAffinity;
        this.logger = new common_1.Logger(ClaudeLocalInsightAgentService_1.name);
        this.logger.log(`[ClaudeLocalInsightAgent] 已初始化`);
        this.logger.log(`[ClaudeLocalInsightAgent] LocalInsightService: ${!!this.localInsightService}, SpatialReplacement: ${!!this.spatialReplacement}, POIAffinity: ${!!this.poiAffinity}`);
    }
    async suggestAlternatives(request, gateResult, context) {
        var _a, _b;
        this.logger.debug(`[ClaudeLocalInsightAgent] 生成替代方案: request_id=${request.request_id}`);
        try {
            const alternative_pois = [];
            const alternative_routes = [];
            if (gateResult.required_adjustments) {
                for (const adjustment of gateResult.required_adjustments) {
                    if (adjustment.action === 'REPLACE_POI' && adjustment.target) {
                        alternative_pois.push({
                            poi_id: adjustment.target,
                            name: `替代 POI（${adjustment.target}）`,
                            reason: adjustment.why,
                            evidence_status: 'UNVERIFIED',
                        });
                    }
                    else if (adjustment.action === 'REPLACE_SEGMENT' && adjustment.target) {
                        alternative_routes.push({
                            route_id: adjustment.target,
                            description: `替代路线（${adjustment.target}）`,
                            reason: adjustment.why,
                            evidence_status: 'UNVERIFIED',
                        });
                    }
                }
            }
            if (this.localInsightService && typeof request.destination === 'string') {
                const countryCode = this.extractCountryCode(request.destination);
                if (countryCode) {
                    try {
                        const insights = await this.localInsightService.getLocalInsight(countryCode, ['restaurant', 'accommodation', 'attraction']);
                        for (const insight of insights.slice(0, 3)) {
                            alternative_pois.push({
                                poi_id: `insight_${insight.id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                name: insight.title || insight.name || '当地推荐',
                                reason: ((_a = insight.content) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) || ((_b = insight.description) === null || _b === void 0 ? void 0 : _b.substring(0, 100)) || '当地推荐',
                                evidence_status: 'ASSUMPTION',
                                evidence_refs: [],
                            });
                        }
                    }
                    catch (error) {
                        this.logger.warn(`[ClaudeLocalInsightAgent] 获取当地洞察失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    }
                }
            }
            if (this.spatialReplacement && gateResult.required_adjustments) {
                const replacePoiAdjustment = gateResult.required_adjustments.find(a => a.action === 'REPLACE_POI');
                if (replacePoiAdjustment && replacePoiAdjustment.target) {
                }
            }
            return {
                alternative_pois,
                alternative_routes,
            };
        }
        catch (error) {
            this.logger.error(`[ClaudeLocalInsightAgent] 生成替代方案失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                alternative_pois: [],
                alternative_routes: [],
            };
        }
    }
    extractCountryCode(destination) {
        const countryMap = {
            '冰岛': 'IS',
            'Iceland': 'IS',
            'IS': 'IS',
            '尼泊尔': 'NP',
            'Nepal': 'NP',
            'NP': 'NP',
            '瑞士': 'CH',
            'Switzerland': 'CH',
            'CH': 'CH',
        };
        for (const [key, code] of Object.entries(countryMap)) {
            if (destination.includes(key)) {
                return code;
            }
        }
        return undefined;
    }
};
exports.ClaudeLocalInsightAgentService = ClaudeLocalInsightAgentService;
exports.ClaudeLocalInsightAgentService = ClaudeLocalInsightAgentService = ClaudeLocalInsightAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [local_insight_service_1.LocalInsightService,
        spatial_replacement_service_1.SpatialReplacementService,
        poi_route_affinity_service_1.POIRouteAffinityService])
], ClaudeLocalInsightAgentService);
//# sourceMappingURL=local-insight-agent.service.js.map