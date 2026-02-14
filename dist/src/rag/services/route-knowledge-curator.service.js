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
var RouteKnowledgeCurator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteKnowledgeCurator = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const rag_service_1 = require("./rag.service");
const llm_extraction_service_1 = require("./llm-extraction.service");
let RouteKnowledgeCurator = RouteKnowledgeCurator_1 = class RouteKnowledgeCurator {
    constructor(prisma, ragService, llmExtraction) {
        this.prisma = prisma;
        this.ragService = ragService;
        this.llmExtraction = llmExtraction;
        this.logger = new common_1.Logger(RouteKnowledgeCurator_1.name);
    }
    async enrichRouteNarrative(routeDirectionId, countryCode) {
        this.logger.debug(`生成路线叙事: routeDirectionId=${routeDirectionId}`);
        try {
            const parsedId = parseInt(routeDirectionId, 10);
            if (isNaN(parsedId)) {
                this.logger.warn(`无效的 routeDirectionId: ${routeDirectionId}，将返回基础叙事`);
                return {
                    routeDirectionId,
                    philosophyExplanation: `路线 ${routeDirectionId} 的详细信息暂不可用。`,
                    whyThisRoute: ['这条路线正在完善中'],
                    whatToExpect: ['请稍后再试获取详细信息'],
                    commonMistakes: [],
                    evidenceSnippets: [],
                };
            }
            const routeDirection = await this.prisma.routeDirection.findUnique({
                where: { id: parsedId },
            });
            if (!routeDirection) {
                throw new Error(`RouteDirection not found: ${routeDirectionId}`);
            }
            const targetCountryCode = countryCode || routeDirection.countryCode;
            const query = `${routeDirection.nameCN || routeDirection.nameEN} ${targetCountryCode} travel guide experience`;
            const snippets = await this.ragService.retrieve({
                query,
                collection: 'travel_guides',
                countryCode: targetCountryCode,
                limit: 20,
            });
            if (snippets.length === 0) {
                this.logger.warn(`未找到相关游记: routeDirectionId=${routeDirectionId}`);
                return this.generateBasicNarrative(routeDirectionId, routeDirection);
            }
            const prompt = `Based on the following travel guides and route information, write a narrative explanation for the route "${routeDirection.nameCN || routeDirection.nameEN}".

Route Information:
- Name: ${routeDirection.nameCN || routeDirection.nameEN}
- Country: ${targetCountryCode}
- Description: ${routeDirection.description || 'N/A'}

Travel Guides:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please generate:
1. philosophyExplanation: A narrative explanation of the route's philosophy and essence (2-3 paragraphs)
2. whyThisRoute: An array of reasons why this route is special (3-5 items)
3. whatToExpect: An array of what travelers can expect (3-5 items)
4. commonMistakes: An array of common mistakes to avoid (2-4 items)
5. evidenceSnippets: Key quotes from the travel guides (3-5 short snippets)

Return as JSON object.`;
            const schema = {
                type: 'object',
                properties: {
                    philosophyExplanation: { type: 'string' },
                    whyThisRoute: { type: 'array', items: { type: 'string' } },
                    whatToExpect: { type: 'array', items: { type: 'string' } },
                    commonMistakes: { type: 'array', items: { type: 'string' } },
                    evidenceSnippets: { type: 'array', items: { type: 'string' } },
                },
                required: ['philosophyExplanation', 'whyThisRoute', 'whatToExpect', 'commonMistakes', 'evidenceSnippets'],
            };
            const narrative = await this.llmExtraction.extractStructured(prompt, schema);
            return {
                routeDirectionId,
                ...narrative,
            };
        }
        catch (error) {
            this.logger.error(`生成路线叙事失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    generateBasicNarrative(routeDirectionId, routeDirection) {
        return {
            routeDirectionId,
            philosophyExplanation: routeDirection.description || `This is a ${routeDirection.nameCN || routeDirection.nameEN} route.`,
            whyThisRoute: [
                'Unique landscape and experience',
                'Well-established route',
            ],
            whatToExpect: [
                'Scenic views',
                'Cultural experiences',
            ],
            commonMistakes: [
                'Not preparing adequately',
                'Underestimating difficulty',
            ],
            evidenceSnippets: [],
        };
    }
    async enrichSegmentNarrative(segmentId, dayIndex, segmentInfo) {
        this.logger.debug(`生成路线段叙事: segmentId=${segmentId}, dayIndex=${dayIndex}`);
        try {
            const query = `${segmentInfo.name || segmentId} ${segmentInfo.countryCode || ''} day ${dayIndex} experience tips`;
            const snippets = await this.ragService.retrieve({
                query,
                collection: 'travel_guides',
                countryCode: segmentInfo.countryCode,
                limit: 10,
            });
            if (snippets.length === 0) {
                return {
                    segmentId,
                    dayIndex,
                    storyText: segmentInfo.description || `Day ${dayIndex} of the journey.`,
                    practicalTips: [],
                    localInsights: [],
                    evidenceSnippets: [],
                };
            }
            const prompt = `Based on the following travel guide snippets, write a narrative for day ${dayIndex} of the route.

Segment: ${segmentInfo.name || segmentId}
Description: ${segmentInfo.description || 'N/A'}

Travel Guide Snippets:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please generate:
1. storyText: A narrative description of this day's experience (1-2 paragraphs)
2. practicalTips: Practical tips for this day (3-5 items)
3. localInsights: Local insights and cultural notes (2-4 items)
4. evidenceSnippets: Key quotes from the travel guides (2-3 short snippets)

Return as JSON object.`;
            const schema = {
                type: 'object',
                properties: {
                    storyText: { type: 'string' },
                    practicalTips: { type: 'array', items: { type: 'string' } },
                    localInsights: { type: 'array', items: { type: 'string' } },
                    evidenceSnippets: { type: 'array', items: { type: 'string' } },
                },
                required: ['storyText', 'practicalTips', 'localInsights', 'evidenceSnippets'],
            };
            const narrative = await this.llmExtraction.extractStructured(prompt, schema);
            return {
                segmentId,
                dayIndex,
                ...narrative,
            };
        }
        catch (error) {
            this.logger.error(`生成路线段叙事失败: ${error.message}`, error.stack);
            return {
                segmentId,
                dayIndex,
                storyText: segmentInfo.description || `Day ${dayIndex} of the journey.`,
                practicalTips: [],
                localInsights: [],
                evidenceSnippets: [],
            };
        }
    }
    async enrichMultipleRoutes(routeDirectionIds, countryCode) {
        const narratives = [];
        for (const routeId of routeDirectionIds) {
            try {
                const narrative = await this.enrichRouteNarrative(routeId, countryCode);
                narratives.push(narrative);
            }
            catch (error) {
                this.logger.error(`批量生成路线叙事失败: routeId=${routeId}, error=${error.message}`);
            }
        }
        return narratives;
    }
};
exports.RouteKnowledgeCurator = RouteKnowledgeCurator;
exports.RouteKnowledgeCurator = RouteKnowledgeCurator = RouteKnowledgeCurator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rag_service_1.RagService,
        llm_extraction_service_1.LlmExtractionService])
], RouteKnowledgeCurator);
//# sourceMappingURL=route-knowledge-curator.service.js.map