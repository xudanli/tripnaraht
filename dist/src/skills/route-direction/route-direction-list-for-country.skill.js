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
var RouteDirectionListForCountrySkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionListForCountrySkill = void 0;
const common_1 = require("@nestjs/common");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
let RouteDirectionListForCountrySkill = RouteDirectionListForCountrySkill_1 = class RouteDirectionListForCountrySkill {
    constructor(routeDirectionsService) {
        this.routeDirectionsService = routeDirectionsService;
        this.logger = new common_1.Logger(RouteDirectionListForCountrySkill_1.name);
        this.metadata = {
            name: 'routeDirection.listForCountry',
            description: '列出指定国家可用的路线方向，包括基本信息、标签和适合人群',
            version: '1.0.0',
            category: 'routeDirection',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 routeDirection.listForCountry: countryCode=${input.countryCode}, season=${input.season || 'all'}`);
        try {
            if (!this.routeDirectionsService) {
                this.logger.warn('RouteDirectionsService 不可用，返回空列表');
                return {
                    routeDirections: [],
                };
            }
            const results = await this.routeDirectionsService.findRouteDirectionsByCountry(input.countryCode, {
                tags: input.intentTags,
                month: input.season,
                limit: 50,
            });
            const routeDirections = results.active.map(rd => {
                const durationDays = this.extractDurationDays(rd);
                const distanceKm = this.extractDistanceKm(rd);
                const suitableFor = this.extractSuitableFor(rd, input.difficultyLevel);
                const difficulty = this.extractDifficulty(rd);
                return {
                    id: String(rd.id),
                    uuid: rd.uuid,
                    name: rd.name,
                    nameCN: rd.nameCN,
                    nameEN: rd.nameEN || undefined,
                    distanceKm: distanceKm || undefined,
                    durationDays: durationDays || undefined,
                    tags: rd.tags || [],
                    suitableFor,
                    description: rd.description || undefined,
                    difficulty,
                };
            });
            return {
                routeDirections,
            };
        }
        catch (error) {
            this.logger.error(`列出路线方向失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    extractDurationDays(rd) {
        if (rd.RouteTemplate && rd.RouteTemplate.length > 0) {
            const durations = rd.RouteTemplate.map((t) => t.durationDays).filter((d) => d);
            if (durations.length > 0) {
                return Math.min(...durations);
            }
        }
        const metadata = rd.metadata;
        if (metadata === null || metadata === void 0 ? void 0 : metadata.durationDays) {
            return metadata.durationDays;
        }
        return null;
    }
    extractDistanceKm(rd) {
        const metadata = rd.metadata;
        if (metadata === null || metadata === void 0 ? void 0 : metadata.distanceKm) {
            return metadata.distanceKm;
        }
        return null;
    }
    extractSuitableFor(rd, requestedDifficulty) {
        const suitableFor = [];
        const tags = rd.tags || [];
        const metadata = rd.metadata;
        if (tags.includes('family-friendly') || tags.includes('easy')) {
            suitableFor.push('家庭游');
        }
        if (tags.includes('adventure') || tags.includes('hiking')) {
            suitableFor.push('探险爱好者');
        }
        if (tags.includes('photography') || tags.includes('scenic')) {
            suitableFor.push('摄影爱好者');
        }
        if (tags.includes('culture') || tags.includes('history')) {
            suitableFor.push('文化探索者');
        }
        const difficulty = this.extractDifficulty(rd);
        if (difficulty === 'easy') {
            suitableFor.push('新手');
        }
        else if (difficulty === 'hard') {
            suitableFor.push('经验丰富者');
        }
        if (requestedDifficulty) {
            if (requestedDifficulty === 'easy' && difficulty !== 'easy') {
                return [];
            }
            if (requestedDifficulty === 'hard' && difficulty !== 'hard') {
                return [];
            }
        }
        if (suitableFor.length === 0) {
            suitableFor.push('一般旅行者');
        }
        return suitableFor;
    }
    extractDifficulty(rd) {
        const tags = rd.tags || [];
        const metadata = rd.metadata;
        if (tags.includes('easy') || tags.includes('family-friendly')) {
            return 'easy';
        }
        if (tags.includes('hard') || tags.includes('expert') || tags.includes('challenging')) {
            return 'hard';
        }
        if (metadata === null || metadata === void 0 ? void 0 : metadata.difficulty) {
            return metadata.difficulty.toLowerCase();
        }
        const riskProfile = rd.riskProfile;
        if ((riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.level) === 'high' || (riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.level) === 'very-high') {
            return 'hard';
        }
        if ((riskProfile === null || riskProfile === void 0 ? void 0 : riskProfile.level) === 'low') {
            return 'easy';
        }
        return 'medium';
    }
};
exports.RouteDirectionListForCountrySkill = RouteDirectionListForCountrySkill;
exports.RouteDirectionListForCountrySkill = RouteDirectionListForCountrySkill = RouteDirectionListForCountrySkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_directions_service_1.RouteDirectionsService])
], RouteDirectionListForCountrySkill);
//# sourceMappingURL=route-direction-list-for-country.skill.js.map