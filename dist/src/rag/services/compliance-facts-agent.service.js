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
var ComplianceFactsAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceFactsAgent = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const chunk_retrieval_service_1 = require("./chunk-retrieval.service");
const llm_extraction_service_1 = require("./llm-extraction.service");
let ComplianceFactsAgent = ComplianceFactsAgent_1 = class ComplianceFactsAgent {
    constructor(prisma, chunkRetrieval, llmExtraction) {
        this.prisma = prisma;
        this.chunkRetrieval = chunkRetrieval;
        this.llmExtraction = llmExtraction;
        this.logger = new common_1.Logger(ComplianceFactsAgent_1.name);
    }
    async extractRailPassRules(passType, countryCode) {
        this.logger.debug(`提取 Rail Pass 规则: passType=${passType}, countryCode=${countryCode}`);
        try {
            const snippets = await this.chunkRetrieval.retrieve({
                query: `${passType} rules for ${countryCode}`,
                category: 'compliance_rules',
                chunkCategory: 'RULES',
                limit: 10,
                useHybridSearch: true,
            });
            if (snippets.length === 0) {
                this.logger.warn(`未找到相关文档: passType=${passType}, countryCode=${countryCode}`);
                return [];
            }
            const prompt = `Extract rail pass rules from the following text. Return a JSON array of RailPassRule objects.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Please extract all rail pass rules and return them as a JSON array. Each rule should have:
- passType: one of "EURAIL_GLOBAL", "EURAIL_ONE_COUNTRY", "INTERRAIL_GLOBAL", "INTERRAIL_ONE_COUNTRY"
- eligibleTraveler: object with "regions" (array of strings) and optional "citizenship" (array of strings)
- validCountries: array of country codes
- requiresReservation: boolean
- seatReservationFee: optional number
- notValidOn: optional array of train types
- seasonalRestrictions: optional object with "months" (array of numbers) and "reason" (string)

Return only valid JSON array.`;
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        passType: {
                            type: 'string',
                            enum: ['EURAIL_GLOBAL', 'EURAIL_ONE_COUNTRY', 'INTERRAIL_GLOBAL', 'INTERRAIL_ONE_COUNTRY'],
                        },
                        eligibleTraveler: {
                            type: 'object',
                            properties: {
                                regions: { type: 'array', items: { type: 'string' } },
                                citizenship: { type: 'array', items: { type: 'string' } },
                            },
                            required: ['regions'],
                        },
                        validCountries: { type: 'array', items: { type: 'string' } },
                        requiresReservation: { type: 'boolean' },
                        seatReservationFee: { type: 'number' },
                        notValidOn: { type: 'array', items: { type: 'string' } },
                        seasonalRestrictions: {
                            type: 'object',
                            properties: {
                                months: { type: 'array', items: { type: 'number' } },
                                reason: { type: 'string' },
                            },
                        },
                    },
                    required: ['passType', 'eligibleTraveler', 'validCountries', 'requiresReservation'],
                },
            };
            const rules = await this.llmExtraction.extractStructured(prompt, schema);
            await this.prisma.complianceEvidence.createMany({
                data: rules.map(rule => {
                    var _a, _b, _c;
                    return ({
                        countryCode,
                        ruleType: 'RAIL_PASS',
                        ruleData: rule,
                        source: 'RAG_EXTRACTED',
                        sourceUrl: ((_a = snippets[0]) === null || _a === void 0 ? void 0 : _a.sourceFile) || ((_c = (_b = snippets[0]) === null || _b === void 0 ? void 0 : _b.metadata) === null || _c === void 0 ? void 0 : _c.sourceUrl),
                        confidence: 'HIGH',
                    });
                }),
                skipDuplicates: true,
            });
            this.logger.debug(`提取完成: 找到 ${rules.length} 条 Rail Pass 规则`);
            return rules;
        }
        catch (error) {
            this.logger.error(`提取 Rail Pass 规则失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async extractTrailAccessRules(trailId, countryCode) {
        this.logger.debug(`提取 Trail Access 规则: trailId=${trailId}, countryCode=${countryCode}`);
        try {
            const snippets = await this.chunkRetrieval.retrieve({
                query: `${trailId} access permit requirements ${countryCode}`,
                category: 'compliance_rules',
                chunkCategory: 'RULES',
                limit: 10,
                useHybridSearch: true,
            });
            if (snippets.length === 0) {
                return [];
            }
            const prompt = `Extract trail access rules from the following text. Return a JSON array of TrailAccessRule objects.

Text:
${snippets.map(s => s.content).join('\n\n---\n\n')}

Schema:
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "trailId": { "type": "string" },
      "requiresPermit": { "type": "boolean" },
      "permitType": { "type": "string", "enum": ["DAILY", "SEASONAL", "ANNUAL"] },
      "permitCost": { "type": "number" },
      "bookingRequired": { "type": "boolean" },
      "bookingAdvanceDays": { "type": "number" },
      "seasonalClosure": {
        "type": "object",
        "properties": {
          "months": { "type": "array", "items": { "type": "number" } },
          "reason": { "type": "string" }
        }
      }
    },
    "required": ["trailId", "requiresPermit", "bookingRequired"]
  }
}`;
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        trailId: { type: 'string' },
                        requiresPermit: { type: 'boolean' },
                        permitType: { type: 'string', enum: ['DAILY', 'SEASONAL', 'ANNUAL'] },
                        permitCost: { type: 'number' },
                        bookingRequired: { type: 'boolean' },
                        bookingAdvanceDays: { type: 'number' },
                        seasonalClosure: {
                            type: 'object',
                            properties: {
                                months: { type: 'array', items: { type: 'number' } },
                                reason: { type: 'string' },
                            },
                        },
                    },
                    required: ['trailId', 'requiresPermit', 'bookingRequired'],
                },
            };
            const rules = await this.llmExtraction.extractStructured(prompt, schema);
            await this.prisma.complianceEvidence.createMany({
                data: rules.map(rule => {
                    var _a, _b, _c;
                    return ({
                        countryCode,
                        ruleType: 'TRAIL_ACCESS',
                        ruleData: rule,
                        source: 'RAG_EXTRACTED',
                        sourceUrl: ((_a = snippets[0]) === null || _a === void 0 ? void 0 : _a.sourceFile) || ((_c = (_b = snippets[0]) === null || _b === void 0 ? void 0 : _b.metadata) === null || _c === void 0 ? void 0 : _c.sourceUrl),
                        confidence: 'HIGH',
                    });
                }),
                skipDuplicates: true,
            });
            return rules;
        }
        catch (error) {
            this.logger.error(`提取 Trail Access 规则失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async refreshComplianceRules() {
        this.logger.log('开始定期更新合规规则...');
        const countries = ['IS', 'NO', 'CH', 'NP', 'CN'];
        const passTypes = ['EURAIL_GLOBAL', 'EURAIL_ONE_COUNTRY', 'INTERRAIL_GLOBAL', 'INTERRAIL_ONE_COUNTRY'];
        for (const country of countries) {
            for (const passType of passTypes) {
                try {
                    await this.extractRailPassRules(passType, country);
                }
                catch (error) {
                    this.logger.error(`更新合规规则失败: country=${country}, passType=${passType}, error=${error.message}`);
                }
            }
        }
        this.logger.log('合规规则更新完成');
    }
};
exports.ComplianceFactsAgent = ComplianceFactsAgent;
__decorate([
    (0, schedule_1.Cron)('0 0 * * 0'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ComplianceFactsAgent.prototype, "refreshComplianceRules", null);
exports.ComplianceFactsAgent = ComplianceFactsAgent = ComplianceFactsAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        chunk_retrieval_service_1.ChunkRetrievalService,
        llm_extraction_service_1.LlmExtractionService])
], ComplianceFactsAgent);
//# sourceMappingURL=compliance-facts-agent.service.js.map