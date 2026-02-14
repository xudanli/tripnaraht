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
var RecommendationEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationEngineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../../prisma/prisma.service");
let RecommendationEngineService = RecommendationEngineService_1 = class RecommendationEngineService {
    constructor(prisma, routeDirectionsService) {
        this.prisma = prisma;
        this.routeDirectionsService = routeDirectionsService;
        this.logger = new common_1.Logger(RecommendationEngineService_1.name);
        this.seasonalPreferences = {
            1: ['tropical', 'ski', 'city'],
            2: ['tropical', 'ski', 'city'],
            3: ['cherry_blossom', 'city', 'nature'],
            4: ['cherry_blossom', 'nature', 'city'],
            5: ['nature', 'beach', 'city'],
            6: ['beach', 'nature', 'adventure'],
            7: ['beach', 'nature', 'adventure'],
            8: ['beach', 'nature', 'adventure'],
            9: ['nature', 'aurora', 'city'],
            10: ['autumn', 'city', 'nature'],
            11: ['autumn', 'city', 'tropical'],
            12: ['tropical', 'ski', 'christmas'],
        };
        this.destinationTags = {
            'iceland': {
                tags: ['nature', 'aurora', 'adventure', 'photography'],
                bestMonths: [9, 10, 11, 12, 1, 2, 3, 6, 7, 8],
                budgetLevel: 'high',
                idealTravelers: ['couple', 'friends', 'solo'],
                popularity: 85,
            },
            'japan': {
                tags: ['culture', 'food', 'city', 'cherry_blossom', 'autumn'],
                bestMonths: [3, 4, 5, 10, 11],
                budgetLevel: 'medium',
                idealTravelers: ['couple', 'family', 'solo', 'friends'],
                popularity: 95,
            },
            'newzealand': {
                tags: ['nature', 'adventure', 'hiking', 'beach'],
                bestMonths: [11, 12, 1, 2, 3],
                budgetLevel: 'high',
                idealTravelers: ['couple', 'friends', 'adventure'],
                popularity: 80,
            },
            'thailand': {
                tags: ['beach', 'tropical', 'food', 'budget', 'culture'],
                bestMonths: [11, 12, 1, 2, 3],
                budgetLevel: 'low',
                idealTravelers: ['solo', 'couple', 'friends', 'family'],
                popularity: 90,
            },
            'italy': {
                tags: ['culture', 'food', 'city', 'history', 'art'],
                bestMonths: [4, 5, 6, 9, 10],
                budgetLevel: 'medium',
                idealTravelers: ['couple', 'family', 'friends'],
                popularity: 92,
            },
            'switzerland': {
                tags: ['nature', 'ski', 'hiking', 'city', 'luxury'],
                bestMonths: [6, 7, 8, 9, 12, 1, 2],
                budgetLevel: 'luxury',
                idealTravelers: ['couple', 'family'],
                popularity: 88,
            },
            'maldives': {
                tags: ['beach', 'tropical', 'luxury', 'honeymoon', 'diving'],
                bestMonths: [1, 2, 3, 4, 11, 12],
                budgetLevel: 'luxury',
                idealTravelers: ['couple', 'honeymoon'],
                popularity: 87,
            },
            'spain': {
                tags: ['culture', 'food', 'city', 'beach', 'history'],
                bestMonths: [4, 5, 6, 9, 10],
                budgetLevel: 'medium',
                idealTravelers: ['couple', 'friends', 'solo', 'family'],
                popularity: 91,
            },
        };
        this.logger.log('推荐引擎服务已初始化');
        if (this.routeDirectionsService) {
            this.logger.log('路线方向服务已注入，将使用路线模板数据');
        }
    }
    async getRecommendations(input) {
        const { preferences, limit = 5, excludeDestinations = [], countryCode } = input;
        let candidates = await this.getCandidates(excludeDestinations, countryCode);
        if (countryCode && candidates.length === 0) {
            this.logger.warn(`[推荐引擎] 国家代码 ${countryCode} 无匹配候选，回退到全部候选`);
            candidates = await this.getCandidates(excludeDestinations);
        }
        const scoredCandidates = candidates.map(candidate => this.scoreDestination(candidate, preferences));
        const sortedCandidates = scoredCandidates
            .sort((a, b) => b.scores.total - a.scores.total)
            .slice(0, limit);
        this.logger.debug(`[推荐引擎] 推荐完成: 候选数=${candidates.length}, ` +
            `返回数=${sortedCandidates.length}, ` +
            `匹配度范围=${sortedCandidates.length > 0 ?
                `${sortedCandidates[sortedCandidates.length - 1].destination.matchScore.toFixed(1)}-${sortedCandidates[0].destination.matchScore.toFixed(1)}` :
                'N/A'}, ` +
            `前3名: ${sortedCandidates.slice(0, 3).map(s => `${s.destination.nameCN}(${s.destination.matchScore.toFixed(1)})`).join(', ')}`);
        return sortedCandidates;
    }
    async getCandidates(excludeDestinations, countryCode) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const candidates = [];
        const normalizedCountryCode = countryCode === null || countryCode === void 0 ? void 0 : countryCode.toUpperCase();
        const idToCountryCode = {
            iceland: 'IS',
            japan: 'JP',
            newzealand: 'NZ',
            italy: 'IT',
            thailand: 'TH',
            spain: 'ES',
        };
        for (const [id, data] of Object.entries(this.destinationTags)) {
            if (excludeDestinations.includes(id))
                continue;
            if (normalizedCountryCode && idToCountryCode[id] !== normalizedCountryCode)
                continue;
            candidates.push(this.createDestinationFromTags(id, data));
        }
        if (this.routeDirectionsService && normalizedCountryCode) {
            try {
                this.logger.debug(`从路线方向获取候选: countryCode=${normalizedCountryCode}`);
                const routeDirectionsResult = await this.routeDirectionsService.findRouteDirectionsByCountry(normalizedCountryCode, { limit: 10 });
                for (const rd of routeDirectionsResult.active) {
                    const destination = this.createDestinationFromRouteDirection(rd);
                    if (!candidates.some(c => c.id === destination.id ||
                        (c.countryCode === destination.countryCode && c.name === destination.name))) {
                        candidates.push(destination);
                        this.logger.debug(`添加路线方向候选: ${destination.nameCN} (${destination.countryCode})`);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`从路线方向获取候选失败: ${error.message}`);
            }
        }
        if (this.prisma) {
            try {
                const where = {
                    isActive: true,
                    packId: { notIn: excludeDestinations },
                };
                if (normalizedCountryCode) {
                    where.countryCode = normalizedCountryCode;
                }
                const packs = await this.prisma.readinessPack.findMany({
                    where,
                    take: 20,
                    select: {
                        packId: true,
                        destinationId: true,
                        displayName: true,
                        countryCode: true,
                        region: true,
                        city: true,
                        packData: true,
                    },
                });
                for (const pack of packs) {
                    if (candidates.some(c => c.id === pack.packId))
                        continue;
                    const packData = pack.packData;
                    candidates.push({
                        id: pack.packId,
                        countryCode: pack.countryCode,
                        name: ((_a = packData === null || packData === void 0 ? void 0 : packData.displayName) === null || _a === void 0 ? void 0 : _a.en) || pack.displayName,
                        nameCN: ((_b = packData === null || packData === void 0 ? void 0 : packData.displayName) === null || _b === void 0 ? void 0 : _b.zh) || pack.displayName,
                        description: ((_c = packData === null || packData === void 0 ? void 0 : packData.overview) === null || _c === void 0 ? void 0 : _c.en) || `Explore ${pack.displayName}`,
                        descriptionCN: ((_d = packData === null || packData === void 0 ? void 0 : packData.overview) === null || _d === void 0 ? void 0 : _d.zh) || `探索${pack.displayName}`,
                        highlights: ((_e = packData === null || packData === void 0 ? void 0 : packData.highlights) === null || _e === void 0 ? void 0 : _e.en) || [],
                        highlightsCN: ((_f = packData === null || packData === void 0 ? void 0 : packData.highlights) === null || _f === void 0 ? void 0 : _f.zh) || [],
                        matchScore: 0,
                        matchReasons: [],
                        matchReasonsCN: [],
                        estimatedBudget: {
                            min: ((_g = packData === null || packData === void 0 ? void 0 : packData.budget) === null || _g === void 0 ? void 0 : _g.min) || 2000,
                            max: ((_h = packData === null || packData === void 0 ? void 0 : packData.budget) === null || _h === void 0 ? void 0 : _h.max) || 5000,
                            currency: 'USD',
                        },
                        bestSeasons: (packData === null || packData === void 0 ? void 0 : packData.bestSeasons) || [],
                        tags: (packData === null || packData === void 0 ? void 0 : packData.tags) || [],
                    });
                }
            }
            catch (error) {
                this.logger.warn(`获取数据库候选失败: ${error.message}`);
            }
        }
        this.logger.debug(`候选目的地总数: ${candidates.length} (countryCode=${normalizedCountryCode || 'all'})`);
        return candidates;
    }
    createDestinationFromRouteDirection(rd) {
        const seasonality = rd.seasonality;
        const bestMonths = (seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths) || [];
        const tags = rd.tags || [];
        const metadata = rd.metadata;
        const budgetRange = metadata === null || metadata === void 0 ? void 0 : metadata.budgetRange;
        return {
            id: `route_direction_${rd.id}`,
            countryCode: rd.countryCode,
            name: rd.nameEN || rd.name || '',
            nameCN: rd.nameCN || rd.name || '',
            description: rd.description || '',
            descriptionCN: rd.description || '',
            highlights: tags.slice(0, 4),
            highlightsCN: this.translateTags(tags.slice(0, 4)),
            matchScore: 0,
            matchReasons: [],
            matchReasonsCN: [],
            estimatedBudget: budgetRange ? {
                min: budgetRange.min || 2000,
                max: budgetRange.max || 8000,
                currency: budgetRange.currency || 'USD',
            } : {
                min: 2000,
                max: 8000,
                currency: 'USD',
            },
            bestSeasons: this.formatBestSeasons(bestMonths),
            tags: tags,
            imageUrl: undefined,
        };
    }
    createDestinationFromTags(id, data) {
        const names = {
            iceland: { en: 'Iceland', cn: '冰岛', description: 'Land of fire and ice with stunning natural landscapes', descriptionCN: '冰与火之国，拥有令人惊叹的自然景观' },
            japan: { en: 'Japan', cn: '日本', description: 'Perfect blend of ancient tradition and modern innovation', descriptionCN: '古老传统与现代创新的完美融合' },
            newzealand: { en: 'New Zealand', cn: '新西兰', description: 'Adventure paradise with breathtaking scenery', descriptionCN: '冒险天堂，壮丽风景' },
            thailand: { en: 'Thailand', cn: '泰国', description: 'Tropical paradise with rich culture and amazing food', descriptionCN: '热带天堂，丰富文化与美食' },
            italy: { en: 'Italy', cn: '意大利', description: 'Cradle of civilization with art, history, and cuisine', descriptionCN: '文明摇篮，艺术、历史与美食' },
            switzerland: { en: 'Switzerland', cn: '瑞士', description: 'Alpine wonderland with pristine nature', descriptionCN: '阿尔卑斯仙境，纯净自然' },
            maldives: { en: 'Maldives', cn: '马尔代夫', description: 'Tropical island paradise for ultimate relaxation', descriptionCN: '热带岛屿天堂，极致放松' },
            spain: { en: 'Spain', cn: '西班牙', description: 'Vibrant culture, beautiful beaches, and delicious tapas', descriptionCN: '活力文化、美丽海滩、美味 tapas' },
        };
        const idToCountryCode = {
            iceland: 'IS',
            japan: 'JP',
            newzealand: 'NZ',
            italy: 'IT',
            thailand: 'TH',
            spain: 'ES',
            switzerland: 'CH',
            maldives: 'MV',
        };
        const info = names[id] || { en: id, cn: id, description: '', descriptionCN: '' };
        const budgetRanges = {
            low: { min: 1000, max: 2500 },
            medium: { min: 2500, max: 5000 },
            high: { min: 4000, max: 8000 },
            luxury: { min: 6000, max: 15000 },
        };
        return {
            id,
            countryCode: idToCountryCode[id] || id.substring(0, 2).toUpperCase(),
            name: info.en,
            nameCN: info.cn,
            description: info.description,
            descriptionCN: info.descriptionCN,
            highlights: data.tags.slice(0, 4),
            highlightsCN: this.translateTags(data.tags.slice(0, 4)),
            matchScore: 0,
            matchReasons: [],
            matchReasonsCN: [],
            estimatedBudget: {
                ...budgetRanges[data.budgetLevel],
                currency: 'USD',
            },
            bestSeasons: this.formatBestSeasons(data.bestMonths),
            tags: data.tags,
        };
    }
    scoreDestination(destination, preferences) {
        const scores = {
            budget: this.calculateBudgetScore(destination, preferences),
            season: this.calculateSeasonScore(destination, preferences),
            preference: this.calculatePreferenceScore(destination, preferences),
            travelers: this.calculateTravelersScore(destination, preferences),
            popularity: this.calculatePopularityScore(destination),
            total: 0,
        };
        const rawTotal = scores.budget + scores.season + scores.preference + scores.travelers + scores.popularity;
        let weightedTotal = rawTotal;
        const highScoreCount = [
            scores.budget >= 20,
            scores.season >= 18,
            scores.preference >= 20,
            scores.travelers >= 12,
            scores.popularity >= 12,
        ].filter(Boolean).length;
        if (highScoreCount >= 3) {
            weightedTotal += 5 + (highScoreCount - 3) * 2;
        }
        if (scores.budget >= 20 && scores.preference >= 20) {
            weightedTotal += 3;
        }
        if (scores.season >= 18) {
            weightedTotal += 2;
        }
        if (rawTotal < 50) {
            weightedTotal -= (50 - rawTotal) * 0.3;
        }
        scores.total = Math.max(0, Math.min(100, weightedTotal));
        this.logger.debug(`[推荐引擎] ${destination.nameCN} (${destination.id}): ` +
            `预算=${scores.budget}, 季节=${scores.season}, 偏好=${scores.preference}, ` +
            `人数=${scores.travelers}, 热门=${scores.popularity}, ` +
            `原始总分=${rawTotal.toFixed(1)}, 加权总分=${scores.total.toFixed(1)}, ` +
            `高分维度数=${highScoreCount}`);
        const { matchReasons, matchReasonsCN } = this.generateMatchReasons(destination, preferences, scores);
        return {
            destination: {
                ...destination,
                matchScore: Math.round(scores.total * 10) / 10,
                matchReasons,
                matchReasonsCN,
            },
            scores,
            matchReasons,
            matchReasonsCN,
        };
    }
    calculateBudgetScore(destination, preferences) {
        var _a;
        if (!((_a = preferences.budget) === null || _a === void 0 ? void 0 : _a.total))
            return 12;
        const userBudget = preferences.budget.total;
        const avgCost = (destination.estimatedBudget.min + destination.estimatedBudget.max) / 2;
        const budgetRange = destination.estimatedBudget.max - destination.estimatedBudget.min;
        if (userBudget >= destination.estimatedBudget.max) {
            const excessRatio = (userBudget - destination.estimatedBudget.max) / budgetRange;
            return Math.min(25, 25 + excessRatio * 2);
        }
        if (userBudget >= avgCost) {
            const ratio = (userBudget - avgCost) / (destination.estimatedBudget.max - avgCost);
            return 20 + ratio * 5;
        }
        if (userBudget >= destination.estimatedBudget.min) {
            const ratio = (userBudget - destination.estimatedBudget.min) / (avgCost - destination.estimatedBudget.min);
            return 12 + ratio * 8;
        }
        if (userBudget >= destination.estimatedBudget.min * 0.8) {
            const ratio = (userBudget - destination.estimatedBudget.min * 0.8) / (destination.estimatedBudget.min * 0.2);
            return 5 + ratio * 7;
        }
        return Math.max(0, 5 * (userBudget / (destination.estimatedBudget.min * 0.8)));
    }
    calculateSeasonScore(destination, preferences) {
        var _a, _b, _c, _d, _e;
        if (!((_a = preferences.dateRange) === null || _a === void 0 ? void 0 : _a.preferredMonths) && !((_b = preferences.dateRange) === null || _b === void 0 ? void 0 : _b.startDate)) {
            return 12;
        }
        let targetMonth;
        if ((_d = (_c = preferences.dateRange) === null || _c === void 0 ? void 0 : _c.preferredMonths) === null || _d === void 0 ? void 0 : _d.length) {
            targetMonth = preferences.dateRange.preferredMonths[0];
        }
        else if ((_e = preferences.dateRange) === null || _e === void 0 ? void 0 : _e.startDate) {
            targetMonth = new Date(preferences.dateRange.startDate).getMonth() + 1;
        }
        else {
            return 12;
        }
        const destData = this.destinationTags[destination.id.toLowerCase()];
        if (destData) {
            if (destData.bestMonths.includes(targetMonth))
                return 20;
            if (destData.bestMonths.some(m => Math.abs(m - targetMonth) <= 1 || Math.abs(m - targetMonth) >= 11))
                return 15;
            return 8;
        }
        const seasonMonths = {
            'Spring': [3, 4, 5],
            'Summer': [6, 7, 8],
            'Autumn': [9, 10, 11],
            'Fall': [9, 10, 11],
            'Winter': [12, 1, 2],
        };
        for (const season of destination.bestSeasons) {
            const months = seasonMonths[season];
            if (months === null || months === void 0 ? void 0 : months.includes(targetMonth))
                return 18;
        }
        return 10;
    }
    calculatePreferenceScore(destination, preferences) {
        var _a, _b, _c, _d;
        if (!((_a = preferences.destination) === null || _a === void 0 ? void 0 : _a.type) && !((_b = preferences.activities) === null || _b === void 0 ? void 0 : _b.preferred)) {
            return 12;
        }
        let score = 0;
        const destTags = destination.tags.map(t => t.toLowerCase());
        let matchCount = 0;
        let totalPreferenceCount = 0;
        if (((_c = preferences.destination) === null || _c === void 0 ? void 0 : _c.type) && preferences.destination.type.length > 0) {
            totalPreferenceCount += preferences.destination.type.length;
            const typeMatches = preferences.destination.type.filter(type => destTags.includes(type.toLowerCase()));
            matchCount += typeMatches.length;
            if (typeMatches.length === preferences.destination.type.length) {
                score += 18;
            }
            else if (typeMatches.length > 0) {
                score += 10 + (typeMatches.length / preferences.destination.type.length) * 8;
            }
        }
        if (((_d = preferences.activities) === null || _d === void 0 ? void 0 : _d.preferred) && preferences.activities.preferred.length > 0) {
            totalPreferenceCount += preferences.activities.preferred.length;
            const activityMatches = preferences.activities.preferred.filter(activity => destTags.some(tag => tag.includes(activity.toLowerCase()) || activity.toLowerCase().includes(tag)));
            matchCount += activityMatches.length;
            if (activityMatches.length === preferences.activities.preferred.length) {
                score += 12;
            }
            else if (activityMatches.length > 0) {
                score += 5 + (activityMatches.length / preferences.activities.preferred.length) * 7;
            }
        }
        if (matchCount === 0 && totalPreferenceCount > 0) {
            return 3;
        }
        if (totalPreferenceCount > 0) {
            const matchRatio = matchCount / totalPreferenceCount;
            if (matchRatio >= 0.8) {
                score += 2;
            }
        }
        return Math.min(Math.max(score, 0), 25);
    }
    calculateTravelersScore(destination, preferences) {
        if (!preferences.travelers)
            return 10;
        const destData = this.destinationTags[destination.id.toLowerCase()];
        if (!destData)
            return 10;
        const travelers = preferences.travelers;
        let travelType = 'couple';
        if (travelers.adults === 1 && !travelers.children) {
            travelType = 'solo';
        }
        else if (travelers.children && travelers.children > 0) {
            travelType = 'family';
        }
        else if (travelers.adults && travelers.adults > 2) {
            travelType = 'friends';
        }
        if (destData.idealTravelers.includes(travelType))
            return 15;
        if (destData.idealTravelers.length > 2)
            return 10;
        return 5;
    }
    calculatePopularityScore(destination) {
        const destData = this.destinationTags[destination.id.toLowerCase()];
        if (!destData)
            return 8;
        return Math.round(destData.popularity * 0.15);
    }
    generateMatchReasons(destination, preferences, scores) {
        const matchReasons = [];
        const matchReasonsCN = [];
        if (scores.budget >= 20) {
            matchReasons.push('Within your budget');
            matchReasonsCN.push('预算友好');
        }
        if (scores.season >= 18) {
            matchReasons.push('Perfect season to visit');
            matchReasonsCN.push('最佳旅行季节');
        }
        if (scores.preference >= 15) {
            matchReasons.push('Matches your interests');
            matchReasonsCN.push('符合你的兴趣');
        }
        if (scores.travelers >= 12) {
            matchReasons.push('Great for your travel group');
            matchReasonsCN.push('适合你的出行组合');
        }
        if (scores.popularity >= 12) {
            matchReasons.push('Popular destination');
            matchReasonsCN.push('热门目的地');
        }
        if (matchReasons.length === 0) {
            matchReasons.push('Interesting destination');
            matchReasonsCN.push('有趣的目的地');
        }
        return { matchReasons, matchReasonsCN };
    }
    translateTags(tags) {
        const translations = {
            nature: '自然风光',
            aurora: '极光',
            adventure: '冒险',
            photography: '摄影',
            culture: '文化',
            food: '美食',
            city: '城市',
            cherry_blossom: '樱花',
            autumn: '秋色',
            hiking: '徒步',
            beach: '海滩',
            tropical: '热带',
            budget: '经济实惠',
            history: '历史',
            art: '艺术',
            ski: '滑雪',
            luxury: '奢华',
            honeymoon: '蜜月',
            diving: '潜水',
        };
        return tags.map(tag => translations[tag] || tag);
    }
    formatBestSeasons(months) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (months.length === 0)
            return [];
        if (months.length <= 3) {
            return months.map(m => monthNames[m - 1]);
        }
        const ranges = [];
        let start = months[0];
        let end = months[0];
        for (let i = 1; i < months.length; i++) {
            if (months[i] === end + 1 || (end === 12 && months[i] === 1)) {
                end = months[i];
            }
            else {
                ranges.push(start === end ? monthNames[start - 1] : `${monthNames[start - 1]}-${monthNames[end - 1]}`);
                start = months[i];
                end = months[i];
            }
        }
        ranges.push(start === end ? monthNames[start - 1] : `${monthNames[start - 1]}-${monthNames[end - 1]}`);
        return ranges;
    }
};
exports.RecommendationEngineService = RecommendationEngineService;
exports.RecommendationEngineService = RecommendationEngineService = RecommendationEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], RecommendationEngineService);
//# sourceMappingURL=recommendation-engine.service.js.map