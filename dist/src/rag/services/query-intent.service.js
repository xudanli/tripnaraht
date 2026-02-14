"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var QueryIntentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryIntentService = void 0;
const common_1 = require("@nestjs/common");
const INTENT_KEYWORDS = {
    ROUTE: {
        keywords: ['路线', '环岛', '自驾', '行程', '几天', '天数', '规划', 'ring road', '一号公路', '环线', '绕岛'],
        chunkCategory: undefined,
        synonyms: {
            '环岛': ['ring road', 'ring-road', 'route 1', '一号公路', '环线', '绕岛一圈'],
            '路线': ['route', '行程', '路径', 'itinerary'],
            '自驾': ['驾车', '开车', '租车自驾', 'self-drive'],
        },
    },
    WEATHER: {
        keywords: ['天气', '气候', '温度', '几月', '季节', '下雨', '下雪', '极光', '日照', 'weather', 'climate'],
        chunkCategory: 'WEATHER',
        synonyms: {
            '天气': ['气候', '气温', 'weather'],
            '极光': ['北极光', 'aurora', 'northern lights'],
            '季节': ['月份', '时节'],
        },
    },
    POI: {
        keywords: ['景点', '住宿', '酒店', '餐厅', '瀑布', '冰川', '温泉', '蓝湖', 'blue lagoon', '冰河湖', '黑沙滩'],
        chunkCategory: 'POI_INFO',
        synonyms: {
            '蓝湖': ['blue lagoon', '蓝色温泉'],
            '冰河湖': ['jökulsárlón', '杰古沙龙'],
            '住宿': ['酒店', '民宿', '旅馆', 'hotel'],
        },
    },
    SAFETY: {
        keywords: ['安全', '危险', '注意', '风险', '事故', '警告', '禁止', 'F路', '高地', '浪', '规则'],
        chunkCategory: 'RULES',
        synonyms: {
            '安全': ['危险', '风险', '注意事项'],
            'F路': ['f-road', '高地路', 'highland'],
        },
    },
    RENTAL: {
        keywords: ['租车', '保险', '费用', '价格', '预算', '租金', '车型', '四驱'],
        chunkCategory: 'GENERAL',
        synonyms: {
            '租车': ['car rental', '租赁', '借车'],
            '保险': ['insurance', '全险', '碎石险'],
            '四驱': ['4x4', 'SUV', '四驱车'],
        },
    },
    GENERAL: {
        keywords: [],
        synonyms: {},
    },
};
let QueryIntentService = QueryIntentService_1 = class QueryIntentService {
    constructor() {
        this.logger = new common_1.Logger(QueryIntentService_1.name);
    }
    classifyIntent(query) {
        const normalizedQuery = query.toLowerCase().trim();
        const scores = {
            ROUTE: { score: 0, matches: [] },
            WEATHER: { score: 0, matches: [] },
            POI: { score: 0, matches: [] },
            SAFETY: { score: 0, matches: [] },
            RENTAL: { score: 0, matches: [] },
            GENERAL: { score: 0, matches: [] },
        };
        for (const [intentType, config] of Object.entries(INTENT_KEYWORDS)) {
            for (const keyword of config.keywords) {
                if (normalizedQuery.includes(keyword.toLowerCase())) {
                    scores[intentType].score += 1;
                    scores[intentType].matches.push(keyword);
                }
            }
        }
        let maxScore = 0;
        let maxIntent = 'GENERAL';
        let maxMatches = [];
        for (const [intentType, result] of Object.entries(scores)) {
            if (result.score > maxScore) {
                maxScore = result.score;
                maxIntent = intentType;
                maxMatches = result.matches;
            }
        }
        const totalKeywords = Object.values(INTENT_KEYWORDS)
            .flatMap(c => c.keywords)
            .filter(k => normalizedQuery.includes(k.toLowerCase())).length;
        const confidence = totalKeywords > 0 ? Math.min(maxScore / totalKeywords, 1) : 0.5;
        const expandedKeywords = this.expandKeywords(normalizedQuery, maxIntent);
        const config = INTENT_KEYWORDS[maxIntent];
        const result = {
            type: maxIntent,
            confidence,
            suggestedChunkCategory: config.chunkCategory,
            expandedKeywords,
            reasoning: maxMatches.length > 0
                ? `匹配关键词: ${maxMatches.join(', ')}`
                : '无明确关键词匹配，默认为通用查询',
        };
        this.logger.debug(`Query意图分类: "${query.substring(0, 50)}..." → ${result.type} (confidence: ${result.confidence.toFixed(2)})`);
        return result;
    }
    expandKeywords(query, intentType) {
        const config = INTENT_KEYWORDS[intentType];
        const expanded = new Set();
        const normalizedQuery = query.toLowerCase();
        for (const [keyword, synonyms] of Object.entries(config.synonyms)) {
            if (normalizedQuery.includes(keyword.toLowerCase())) {
                synonyms.forEach(syn => expanded.add(syn));
            }
            for (const syn of synonyms) {
                if (normalizedQuery.includes(syn.toLowerCase())) {
                    expanded.add(keyword);
                    synonyms.forEach(s => expanded.add(s));
                }
            }
        }
        return Array.from(expanded);
    }
    enhanceQuery(query) {
        const intent = this.classifyIntent(query);
        if (intent.expandedKeywords.length === 0) {
            return query;
        }
        const enhancedParts = [query, ...intent.expandedKeywords.slice(0, 3)];
        return enhancedParts.join(' ');
    }
    shouldFilterByCategory(intent) {
        return intent.confidence >= 0.6 && intent.type !== 'GENERAL' && !!intent.suggestedChunkCategory;
    }
};
exports.QueryIntentService = QueryIntentService;
exports.QueryIntentService = QueryIntentService = QueryIntentService_1 = __decorate([
    (0, common_1.Injectable)()
], QueryIntentService);
//# sourceMappingURL=query-intent.service.js.map