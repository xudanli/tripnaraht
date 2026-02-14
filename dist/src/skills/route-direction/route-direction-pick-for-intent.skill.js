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
var RouteDirectionPickForIntentSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionPickForIntentSkill = void 0;
const common_1 = require("@nestjs/common");
const route_direction_selector_service_1 = require("../../route-directions/services/route-direction-selector.service");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
let RouteDirectionPickForIntentSkill = RouteDirectionPickForIntentSkill_1 = class RouteDirectionPickForIntentSkill {
    constructor(routeDirectionSelector, routeDirectionsService) {
        this.routeDirectionSelector = routeDirectionSelector;
        this.routeDirectionsService = routeDirectionsService;
        this.logger = new common_1.Logger(RouteDirectionPickForIntentSkill_1.name);
        this.metadata = {
            name: 'routeDirection.pickForIntent',
            description: '根据国家、季节和用户意图标签选择最合适的路线方向',
            version: '1.0.0',
            category: 'routeDirection',
            inputSchema: {
                required: ['countryCode'],
                extractors: {
                    countryCode: 'countryCode',
                },
            },
        };
    }
    async execute(input) {
        var _a;
        if (!input.countryCode) {
            throw new Error('routeDirection.pickForIntent 需要 countryCode 参数');
        }
        if (typeof input.season !== 'number' || input.season < 1 || input.season > 12) {
            throw new Error('routeDirection.pickForIntent 需要有效的 season 参数 (1-12)');
        }
        if (!Array.isArray(input.userIntentTags)) {
            this.logger.warn(`userIntentTags 不是数组，使用默认值: ${JSON.stringify(input.userIntentTags)}`);
            input.userIntentTags = [];
        }
        this.logger.debug(`执行 routeDirection.pickForIntent: country=${input.countryCode}, season=${input.season}, tags=${input.userIntentTags.join(',')}`);
        if (this.routeDirectionSelector) {
            try {
                const userIntent = {
                    preferences: input.userIntentTags,
                    ...input.userIntent,
                };
                const recommendations = await this.routeDirectionSelector.pickRouteDirections(userIntent, input.countryCode, input.season);
                if (recommendations.length > 0) {
                    const primary = recommendations[0];
                    const alternatives = recommendations.slice(1, 4).map(rec => {
                        var _a;
                        return ({
                            routeDirectionId: rec.routeDirection.uuid || String(rec.routeDirection.id),
                            name: rec.routeDirection.nameCN || rec.routeDirection.nameEN || rec.routeDirection.name,
                            score: rec.score || 0,
                            reasoning: ((_a = rec.explanation) === null || _a === void 0 ? void 0 : _a.summary) || '无说明',
                        });
                    });
                    return {
                        routeDirectionId: primary.routeDirection.uuid || String(primary.routeDirection.id),
                        reasoning: ((_a = primary.explanation) === null || _a === void 0 ? void 0 : _a.summary) || '基于用户意图和季节匹配',
                        alternatives,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`RouteDirectionSelectorService 执行失败，尝试降级方案: ${error.message}`);
            }
        }
        if (this.routeDirectionsService) {
            try {
                this.logger.debug('使用 RouteDirectionsService 降级方案');
                const results = await this.routeDirectionsService.findRouteDirectionsByCountry(input.countryCode, {
                    tags: input.userIntentTags.length > 0 ? input.userIntentTags : undefined,
                    month: input.season,
                    limit: 5,
                });
                if (results.active.length > 0) {
                    const primary = results.active[0];
                    const alternatives = results.active.slice(1, 4).map(rd => ({
                        routeDirectionId: rd.uuid || String(rd.id),
                        name: rd.nameCN || rd.nameEN || rd.name || '未知路线',
                        score: 0.7,
                        reasoning: `基于国家代码和季节匹配（降级方案）`,
                    }));
                    return {
                        routeDirectionId: primary.uuid || String(primary.id),
                        reasoning: `基于国家代码 ${input.countryCode} 和季节 ${input.season} 月匹配（降级方案，未使用智能推荐）`,
                        alternatives,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`RouteDirectionsService 降级方案也失败: ${error.message}`);
            }
        }
        const errorMessage = [
            '无法完成路线方向选择，因为关键依赖服务不可用。',
            '',
            '缺失的服务：',
            '- RouteDirectionSelectorService（智能推荐服务）',
            '- RouteDirectionsService（路线方向查询服务）',
            '',
            '影响：',
            '- 无法选择适合的路线方向',
            '- 无法进行安全评估（Should-Exist Gate）',
            '- 无法生成可执行的行程规划',
            '',
            '解决方案：',
            '1. 设置环境变量 ENABLE_ROUTE_DIRECTIONS_MODULE=true 以启用完整功能',
            '2. 或提供更具体的行程需求（如具体路线名称、已保存的行程 ID）',
            '3. 联系系统管理员检查 RouteDirectionsModule 是否正确配置',
        ].join('\n');
        this.logger.error(`[RouteDirectionPickForIntentSkill] 关键依赖缺失: ${errorMessage}`);
        const error = new Error(errorMessage);
        error.isCriticalDependencyMissing = true;
        error.missingServices = ['RouteDirectionSelectorService', 'RouteDirectionsService'];
        error.solutions = [
            '设置环境变量 ENABLE_ROUTE_DIRECTIONS_MODULE=true',
            '提供更具体的行程需求',
            '联系系统管理员检查配置',
        ];
        throw error;
    }
};
exports.RouteDirectionPickForIntentSkill = RouteDirectionPickForIntentSkill;
exports.RouteDirectionPickForIntentSkill = RouteDirectionPickForIntentSkill = RouteDirectionPickForIntentSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_direction_selector_service_1.RouteDirectionSelectorService,
        route_directions_service_1.RouteDirectionsService])
], RouteDirectionPickForIntentSkill);
//# sourceMappingURL=route-direction-pick-for-intent.skill.js.map