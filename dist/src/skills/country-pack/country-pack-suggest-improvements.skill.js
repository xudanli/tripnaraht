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
var CountryPackSuggestImprovementsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackSuggestImprovementsSkill = void 0;
const common_1 = require("@nestjs/common");
const country_pack_validate_skill_1 = require("./country-pack-validate.skill");
let CountryPackSuggestImprovementsSkill = CountryPackSuggestImprovementsSkill_1 = class CountryPackSuggestImprovementsSkill {
    constructor(packValidateSkill) {
        this.packValidateSkill = packValidateSkill;
        this.logger = new common_1.Logger(CountryPackSuggestImprovementsSkill_1.name);
        this.metadata = {
            name: 'countryPack.suggestImprovements',
            description: '在验证 Pack 后提供改进建议，包括缺失字段、质量缺口和优先级待办事项',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.suggestImprovements: countryCode=${input.countryCode}, packType=${input.packType}`);
        try {
            let validateResult;
            if (this.packValidateSkill) {
                validateResult = await this.packValidateSkill.execute({
                    pack: input.currentPackSnapshot,
                    packType: input.packType,
                });
            }
            else {
                this.logger.warn('CountryPackValidateSkill 不可用，使用基本验证结果');
                validateResult = {
                    valid: true,
                    errors: [],
                    warnings: [],
                    summary: {
                        totalErrors: 0,
                        totalWarnings: 0,
                        criticalIssues: [],
                    },
                };
            }
            const missingFields = this.analyzeMissingFields(validateResult.errors, input.packType);
            const qualityGaps = this.analyzeQualityGaps(input.currentPackSnapshot, input.packType);
            const priorityTodo = this.generatePriorityTodo(missingFields, qualityGaps, validateResult);
            return {
                missingFields,
                qualityGaps,
                priorityTodo,
            };
        }
        catch (error) {
            this.logger.error(`生成改进建议失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    analyzeMissingFields(errors, packType) {
        const missingFields = [];
        for (const error of errors) {
            if (error.code === 'MISSING_FIELD') {
                missingFields.push({
                    path: error.path,
                    field: error.path.split('.').pop() || error.path,
                    description: error.message,
                    impact: this.determineFieldImpact(error.path, packType),
                });
            }
        }
        return missingFields;
    }
    determineFieldImpact(path, packType) {
        const highImpactFields = ['packId', 'countryCode', 'rules', 'routeDirections'];
        if (highImpactFields.some(field => path.includes(field))) {
            return 'high';
        }
        const mediumImpactFields = ['tags', 'checklists', 'metadata', 'seasonality'];
        if (mediumImpactFields.some(field => path.includes(field))) {
            return 'medium';
        }
        return 'low';
    }
    analyzeQualityGaps(pack, packType) {
        var _a, _b, _c, _d, _e;
        const gaps = [];
        if (packType === 'readiness') {
            const readinessPack = pack;
            const ruleCount = ((_a = readinessPack.rules) === null || _a === void 0 ? void 0 : _a.length) || 0;
            if (ruleCount < 10) {
                gaps.push({
                    category: 'rules',
                    issue: '规则数量偏少',
                    current: ruleCount,
                    recommended: 15,
                    impact: 'medium',
                });
            }
            const ruleCategories = new Set(((_b = readinessPack.rules) === null || _b === void 0 ? void 0 : _b.map(r => String(r.category))) || []);
            const expectedCategories = [
                'entry_transit',
                'gear_packing',
                'health_insurance',
                'logistics',
                'safety_hazards',
            ];
            const missingCategories = expectedCategories.filter((cat) => !ruleCategories.has(cat));
            if (missingCategories.length > 0) {
                gaps.push({
                    category: 'rule_coverage',
                    issue: `缺少以下规则类别：${missingCategories.join(', ')}`,
                    current: ruleCategories.size,
                    recommended: expectedCategories.length,
                    impact: 'high',
                });
            }
            const checklistCount = ((_c = readinessPack.checklists) === null || _c === void 0 ? void 0 : _c.length) || 0;
            if (checklistCount < 3) {
                gaps.push({
                    category: 'checklists',
                    issue: '清单数量不足',
                    current: checklistCount,
                    recommended: 5,
                    impact: 'medium',
                });
            }
        }
        else if (packType === 'routeDirection') {
            const routePack = pack;
            const routeCount = ((_d = routePack.routeDirections) === null || _d === void 0 ? void 0 : _d.length) || 0;
            if (routeCount < 3) {
                gaps.push({
                    category: 'route_directions',
                    issue: '路线方向数量偏少',
                    current: routeCount,
                    recommended: 5,
                    impact: 'medium',
                });
            }
            const allTags = new Set();
            (_e = routePack.routeDirections) === null || _e === void 0 ? void 0 : _e.forEach(rd => {
                var _a;
                (_a = rd.tags) === null || _a === void 0 ? void 0 : _a.forEach(tag => allTags.add(tag));
            });
            if (allTags.size < 5) {
                gaps.push({
                    category: 'tag_diversity',
                    issue: '标签多样性不足',
                    current: allTags.size,
                    recommended: 10,
                    impact: 'low',
                });
            }
        }
        return gaps;
    }
    generatePriorityTodo(missingFields, qualityGaps, validateResult) {
        const todos = [];
        const highImpactMissing = missingFields.filter(m => m.impact === 'high');
        if (highImpactMissing.length > 0) {
            todos.push({
                task: `补充高影响缺失字段：${highImpactMissing.map(m => m.field).join(', ')}`,
                priority: 'high',
                estimatedEffort: '1-2 小时',
                impact: '这些字段是 Pack 的核心，缺失会导致验证失败',
                actionableSteps: highImpactMissing.map(m => `添加 ${m.path} 字段`),
            });
        }
        const highImpactGaps = qualityGaps.filter(g => g.impact === 'high');
        if (highImpactGaps.length > 0) {
            for (const gap of highImpactGaps) {
                todos.push({
                    task: `改进 ${gap.category}：${gap.issue}`,
                    priority: 'high',
                    estimatedEffort: '2-4 小时',
                    impact: gap.issue,
                    actionableSteps: [
                        `当前值：${gap.current}`,
                        `建议值：${gap.recommended}`,
                        `制定计划逐步补充`,
                    ],
                });
            }
        }
        const mediumImpactItems = [
            ...missingFields.filter(m => m.impact === 'medium'),
            ...qualityGaps.filter(g => g.impact === 'medium'),
        ];
        if (mediumImpactItems.length > 0) {
            todos.push({
                task: '完善中等优先级字段和质量',
                priority: 'medium',
                estimatedEffort: '3-5 小时',
                impact: '提升 Pack 的完整性和可用性',
                actionableSteps: mediumImpactItems.map(item => {
                    if ('field' in item) {
                        return `补充 ${item.field} 字段`;
                    }
                    else {
                        return `改进 ${item.category}`;
                    }
                }),
            });
        }
        if (validateResult.errors.length > 0) {
            todos.push({
                task: `解决 ${validateResult.errors.length} 个验证错误`,
                priority: 'high',
                estimatedEffort: '根据错误数量而定',
                impact: '确保 Pack 通过验证，可以正常使用',
                actionableSteps: [
                    '逐个检查验证错误',
                    '修复格式和必需字段问题',
                    '重新运行验证',
                ],
            });
        }
        return todos.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
};
exports.CountryPackSuggestImprovementsSkill = CountryPackSuggestImprovementsSkill;
exports.CountryPackSuggestImprovementsSkill = CountryPackSuggestImprovementsSkill = CountryPackSuggestImprovementsSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [country_pack_validate_skill_1.CountryPackValidateSkill])
], CountryPackSuggestImprovementsSkill);
//# sourceMappingURL=country-pack-suggest-improvements.skill.js.map