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
var CountryPackNewSkeletonSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackNewSkeletonSkill = void 0;
const common_1 = require("@nestjs/common");
const exa_integration_service_1 = require("../../mcp/exa-integration.service");
let CountryPackNewSkeletonSkill = CountryPackNewSkeletonSkill_1 = class CountryPackNewSkeletonSkill {
    constructor(exaIntegration) {
        this.exaIntegration = exaIntegration;
        this.logger = new common_1.Logger(CountryPackNewSkeletonSkill_1.name);
        this.metadata = {
            name: 'countryPack.newSkeleton',
            description: '创建国家 Pack 骨架，支持 ReadinessPack 和 RouteDirectionPack 两种类型',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.newSkeleton: country=${input.countryCode}, type=${input.packType}`);
        if (this.exaIntegration && input.packType === 'readiness') {
            try {
                const researchTopic = `${input.countryName} ${input.countryCode} 旅行准备 签证 入境要求 安全信息`;
                const researchResult = await this.exaIntegration.startDeepResearch(researchTopic, 'country_pack');
                if (researchResult.status === 'started') {
                    this.logger.debug(`已启动深度研究任务: ${researchResult.researchId}`);
                }
            }
            catch (error) {
                this.logger.warn(`启动深度研究失败: ${error.message}，继续创建骨架`);
            }
        }
        if (input.packType === 'readiness') {
            return this.createReadinessPackSkeleton(input);
        }
        else {
            return this.createRouteDirectionPackSkeleton(input);
        }
    }
    createReadinessPackSkeleton(input) {
        const now = new Date().toISOString();
        const packId = `pack.${input.countryCode.toLowerCase()}.${input.countryCode.toLowerCase()}`;
        const destinationId = `${input.countryCode}-${input.countryName.toUpperCase().replace(/\s+/g, '_')}`;
        const skeleton = {
            packId,
            destinationId,
            displayName: {
                en: input.countryName,
                zh: input.countryNameCN || input.countryName,
            },
            version: '1.0.0',
            lastReviewedAt: now,
            geo: {
                countryCode: input.countryCode,
                region: input.countryCode,
                city: input.countryName,
            },
            supportedSeasons: input.supportedSeasons || ['summer', 'winter', 'shoulder'],
            rules: [
                {
                    id: `rule.${input.countryCode.toLowerCase()}.entry_transit`,
                    category: 'entry_transit',
                    severity: 'medium',
                    when: {
                        eq: { path: 'itinerary.countries', value: [input.countryCode] },
                    },
                    then: {
                        level: 'should',
                        message: {
                            en: `Check entry requirements for ${input.countryName}`,
                            zh: `检查 ${input.countryNameCN || input.countryName} 的入境要求`,
                        },
                    },
                },
                {
                    id: `rule.${input.countryCode.toLowerCase()}.gear_packing`,
                    category: 'gear_packing',
                    severity: 'medium',
                    when: {
                        eq: { path: 'itinerary.countries', value: [input.countryCode] },
                    },
                    then: {
                        level: 'should',
                        message: {
                            en: `Prepare appropriate gear for ${input.countryName} based on season and activities`,
                            zh: `根据季节和活动准备适合 ${input.countryNameCN || input.countryName} 的装备`,
                        },
                    },
                },
                {
                    id: `rule.${input.countryCode.toLowerCase()}.health_insurance`,
                    category: 'health_insurance',
                    severity: 'high',
                    when: {
                        eq: { path: 'itinerary.countries', value: [input.countryCode] },
                    },
                    then: {
                        level: 'must',
                        message: {
                            en: `Ensure travel health insurance covers ${input.countryName}`,
                            zh: `确保旅行健康保险覆盖 ${input.countryNameCN || input.countryName}`,
                        },
                    },
                },
                {
                    id: `rule.${input.countryCode.toLowerCase()}.logistics`,
                    category: 'logistics',
                    severity: 'medium',
                    when: {
                        eq: { path: 'itinerary.countries', value: [input.countryCode] },
                    },
                    then: {
                        level: 'should',
                        message: {
                            en: `Plan logistics for ${input.countryName} (transportation, currency, connectivity)`,
                            zh: `规划 ${input.countryNameCN || input.countryName} 的物流（交通、货币、通讯）`,
                        },
                    },
                },
                {
                    id: `rule.${input.countryCode.toLowerCase()}.safety_hazards`,
                    category: 'safety_hazards',
                    severity: 'high',
                    when: {
                        eq: { path: 'itinerary.countries', value: [input.countryCode] },
                    },
                    then: {
                        level: 'should',
                        message: {
                            en: `Review safety hazards and risks in ${input.countryName}`,
                            zh: `了解 ${input.countryNameCN || input.countryName} 的安全风险和危险`,
                        },
                    },
                },
            ],
            checklists: [
                {
                    id: `checklist.${input.countryCode.toLowerCase()}.documents`,
                    category: 'entry_transit',
                    items: [
                        {
                            en: 'Passport and travel documents',
                            zh: '护照和旅行证件',
                        },
                        {
                            en: 'Visa or entry permit (if required)',
                            zh: '签证或入境许可（如需要）',
                        },
                    ],
                },
                {
                    id: `checklist.${input.countryCode.toLowerCase()}.gear`,
                    category: 'gear_packing',
                    items: [
                        {
                            en: 'Weather-appropriate clothing',
                            zh: '适合天气的衣物',
                        },
                        {
                            en: 'Essential travel gear',
                            zh: '基本旅行装备',
                        },
                    ],
                },
                {
                    id: `checklist.${input.countryCode.toLowerCase()}.health`,
                    category: 'health_insurance',
                    items: [
                        {
                            en: 'Travel health insurance',
                            zh: '旅行健康保险',
                        },
                        {
                            en: 'Prescription medications',
                            zh: '处方药',
                        },
                    ],
                },
                {
                    id: `checklist.${input.countryCode.toLowerCase()}.logistics`,
                    category: 'logistics',
                    items: [
                        {
                            en: 'Local currency or payment method',
                            zh: '当地货币或支付方式',
                        },
                        {
                            en: 'Transportation arrangements',
                            zh: '交通安排',
                        },
                    ],
                },
                {
                    id: `checklist.${input.countryCode.toLowerCase()}.safety`,
                    category: 'safety_hazards',
                    items: [
                        {
                            en: 'Emergency contacts',
                            zh: '紧急联系人',
                        },
                        {
                            en: 'Safety guidelines and local regulations',
                            zh: '安全指南和当地法规',
                        },
                    ],
                },
            ],
            hazards: [],
            sources: [],
        };
        return {
            skeleton,
            template: {
                type: 'ReadinessPack',
                description: '准备度检查 Pack，用于生成行前准备清单',
                requiredFields: [
                    'packId',
                    'destinationId',
                    'displayName',
                    'version',
                    'lastReviewedAt',
                    'geo',
                    'supportedSeasons',
                    'rules',
                    'checklists',
                ],
                optionalFields: ['hazards', 'sources'],
            },
        };
    }
    createRouteDirectionPackSkeleton(input) {
        const skeleton = {
            countryCode: input.countryCode,
            countryName: input.countryName,
            countryNameCN: input.countryNameCN,
            routeDirections: [
                {
                    name: `${input.countryCode}_EXAMPLE_ROUTE`,
                    nameCN: `${input.countryNameCN || input.countryName}示例路线`,
                    nameEN: `${input.countryName} Example Route`,
                    description: `示例路线方向，请根据实际情况修改`,
                    countryCode: input.countryCode,
                    tags: ['example'],
                    regions: input.regions || [],
                    entryHubs: [],
                    seasonality: {
                        bestMonths: [6, 7, 8, 9],
                        avoidMonths: [12, 1, 2],
                    },
                    constraints: {
                        soft: {
                            maxDailyAscentM: 500,
                            maxElevationM: 2000,
                        },
                    },
                    riskProfile: {
                        altitudeSickness: false,
                        roadClosure: false,
                    },
                },
            ],
            regions: input.regions || [],
        };
        return {
            skeleton,
            template: {
                type: 'RouteDirectionPack',
                description: '路线方向 Pack，用于定义国家级的路线方向资产',
                requiredFields: [
                    'countryCode',
                    'countryName',
                    'routeDirections',
                ],
                optionalFields: ['countryNameCN', 'regions', 'policy'],
            },
        };
    }
};
exports.CountryPackNewSkeletonSkill = CountryPackNewSkeletonSkill;
exports.CountryPackNewSkeletonSkill = CountryPackNewSkeletonSkill = CountryPackNewSkeletonSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [exa_integration_service_1.ExaIntegrationService])
], CountryPackNewSkeletonSkill);
//# sourceMappingURL=country-pack-new-skeleton.skill.js.map