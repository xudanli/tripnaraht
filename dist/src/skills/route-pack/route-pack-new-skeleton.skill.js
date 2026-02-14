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
var RoutePackNewSkeletonSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutePackNewSkeletonSkill = void 0;
const common_1 = require("@nestjs/common");
let RoutePackNewSkeletonSkill = RoutePackNewSkeletonSkill_1 = class RoutePackNewSkeletonSkill {
    constructor() {
        this.logger = new common_1.Logger(RoutePackNewSkeletonSkill_1.name);
        this.metadata = {
            name: 'routePack.newSkeleton',
            description: '创建 RoutePack 骨架：为 RouteDirection 创建 Pack 化骨架，包含 blocks、evidence、source 等',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 routePack.newSkeleton: countryCode=${input.countryCode}, routeDirectionId=${input.routeDirectionId}`);
        const now = new Date().toISOString();
        const version = input.version || '1.0.0';
        const routeDirectionIdentifier = input.routeDirectionUuid ||
            ((_a = input.routeDirectionId) === null || _a === void 0 ? void 0 : _a.toString()) ||
            ((_b = input.routeDirectionName) === null || _b === void 0 ? void 0 : _b.toUpperCase().replace(/\s+/g, '_')) ||
            'NEW_ROUTE';
        const packId = `routePack:${input.countryCode}:${routeDirectionIdentifier}`;
        const blocks = [
            {
                blockId: `${packId}:constraints`,
                type: 'constraint',
                content: '路线约束条件（海拔、爬升、坡度等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.constraints 中提取',
                },
            },
            {
                blockId: `${packId}:preferences`,
                type: 'preference',
                content: '路线偏好（观景点、温泉、摄影等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.constraints.objectives 中提取',
                },
            },
            {
                blockId: `${packId}:safety`,
                type: 'safety',
                content: '安全信息（高反、封路、渡轮依赖等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.riskProfile 中提取',
                },
            },
            {
                blockId: `${packId}:seasonality`,
                type: 'seasonality',
                content: '季节性信息（最佳月份、避免月份等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.seasonality 中提取',
                },
            },
            {
                blockId: `${packId}:risk`,
                type: 'risk',
                content: '风险画像（高反、封路、天气窗口等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.riskProfile 中提取',
                },
            },
            {
                blockId: `${packId}:logistics`,
                type: 'logistics',
                content: '物流信息（入口枢纽、许可要求等）',
                evidence: [
                    {
                        source: 'RouteDirection Data',
                        verifiedAt: now,
                        confidence: 0.8,
                        metadata: {
                            sourceType: 'database',
                        },
                    },
                ],
                source: 'PACK',
                lastVerifiedAt: now,
                metadata: {
                    note: '需要从 RouteDirection.entryHubs 和 RouteDirection.constraints 中提取',
                },
            },
        ];
        const pack = {
            metadata: {
                packId,
                routeDirectionId: input.routeDirectionId,
                routeDirectionUuid: input.routeDirectionUuid,
                countryCode: input.countryCode,
                version,
                lastVerifiedAt: now,
            },
            blocks,
        };
        return {
            pack,
            template: {
                type: 'RoutePack',
                description: '路线方向 Pack，用于定义路线方向的知识块，支持验证、回归测试、演进',
                requiredFields: [
                    'metadata.packId',
                    'metadata.countryCode',
                    'metadata.version',
                    'blocks',
                ],
                optionalFields: [
                    'metadata.routeDirectionId',
                    'metadata.routeDirectionUuid',
                    'blocks[].metadata',
                ],
            },
        };
    }
};
exports.RoutePackNewSkeletonSkill = RoutePackNewSkeletonSkill;
exports.RoutePackNewSkeletonSkill = RoutePackNewSkeletonSkill = RoutePackNewSkeletonSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RoutePackNewSkeletonSkill);
//# sourceMappingURL=route-pack-new-skeleton.skill.js.map