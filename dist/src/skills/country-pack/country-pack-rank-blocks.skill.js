"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CountryPackRankBlocksSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackRankBlocksSkill = void 0;
const common_1 = require("@nestjs/common");
let CountryPackRankBlocksSkill = CountryPackRankBlocksSkill_1 = class CountryPackRankBlocksSkill {
    constructor() {
        this.logger = new common_1.Logger(CountryPackRankBlocksSkill_1.name);
        this.metadata = {
            name: 'countryPack.rankBlocks',
            description: '国家包块排序：根据 query、phase、intent 对块进行相关性排序',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.rankBlocks: query=${input.query.substring(0, 50)}..., phase=${input.phase}, blocks=${input.blocks.length}`);
        try {
            const scoredBlocks = input.blocks.map((block) => {
                const { score, reasons } = this.calculateRelevanceScore(block, input.query, input.phase, input.intent);
                return {
                    block,
                    score,
                    reasons,
                };
            });
            scoredBlocks.sort((a, b) => b.score - a.score);
            const rankedBlocks = scoredBlocks.map((item) => {
                return {
                    ...item.block,
                    priority: Math.max(item.block.priority, item.score),
                };
            });
            const scores = scoredBlocks.map((item) => ({
                key: item.block.key,
                score: item.score,
                reasons: item.reasons,
            }));
            return {
                rankedBlocks,
                scores,
            };
        }
        catch (error) {
            this.logger.error(`国家包块排序失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    calculateRelevanceScore(block, query, phase, intent) {
        let score = block.priority;
        const reasons = [];
        const queryLower = query.toLowerCase();
        const blockTextLower = block.text.toLowerCase();
        const blockKeyLower = block.key.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        const matchedWords = queryWords.filter((word) => blockTextLower.includes(word) || blockKeyLower.includes(word));
        if (matchedWords.length > 0) {
            score += matchedWords.length * 10;
            reasons.push(`匹配关键词: ${matchedWords.join(', ')}`);
        }
        const phaseBlockMap = {
            planning: ['COUNTRY_VISA', 'COUNTRY_SAFETY', 'COUNTRY_WEATHER'],
            decision: ['COUNTRY_ROAD_RULES', 'COUNTRY_SAFETY', 'ABU_RULES'],
            adjustment: ['COUNTRY_ROAD_RULES', 'COUNTRY_TRANSPORT'],
            repair: ['COUNTRY_ROAD_RULES', 'COUNTRY_BOOKING'],
            readiness: ['COUNTRY_VISA', 'COUNTRY_MONEY', 'COUNTRY_TRANSPORT'],
        };
        const phaseKey = phase.toLowerCase();
        const relevantTypes = phaseBlockMap[phaseKey] || [];
        if (relevantTypes.some((type) => block.type.includes(type))) {
            score += 20;
            reasons.push(`匹配规划阶段: ${phase}`);
        }
        if (intent) {
            const intentLower = intent.toLowerCase();
            const intentBlockMap = {
                visa: ['COUNTRY_VISA'],
                drone: ['COUNTRY_DRONE'],
                road: ['COUNTRY_ROAD_RULES'],
                money: ['COUNTRY_MONEY'],
                safety: ['COUNTRY_SAFETY'],
                weather: ['COUNTRY_WEATHER'],
                transport: ['COUNTRY_TRANSPORT'],
                booking: ['COUNTRY_BOOKING'],
            };
            for (const [intentKey, blockTypes] of Object.entries(intentBlockMap)) {
                if (intentLower.includes(intentKey)) {
                    if (blockTypes.some((type) => block.type.includes(type))) {
                        score += 25;
                        reasons.push(`匹配用户意图: ${intentKey}`);
                        break;
                    }
                }
            }
        }
        const typePriority = {
            COUNTRY_SAFETY: 15,
            COUNTRY_ROAD_RULES: 15,
            ABU_RULES: 15,
            COUNTRY_VISA: 10,
            COUNTRY_WEATHER: 10,
            COUNTRY_DRONE: 5,
            COUNTRY_MONEY: 5,
            COUNTRY_TRANSPORT: 5,
            COUNTRY_BOOKING: 5,
        };
        if (typePriority[block.type]) {
            score += typePriority[block.type];
            reasons.push(`类型优先级: ${block.type}`);
        }
        score = Math.min(100, Math.max(0, score));
        return { score, reasons };
    }
};
exports.CountryPackRankBlocksSkill = CountryPackRankBlocksSkill;
exports.CountryPackRankBlocksSkill = CountryPackRankBlocksSkill = CountryPackRankBlocksSkill_1 = __decorate([
    (0, common_1.Injectable)()
], CountryPackRankBlocksSkill);
//# sourceMappingURL=country-pack-rank-blocks.skill.js.map