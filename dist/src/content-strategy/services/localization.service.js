"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LocalizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalizationService = void 0;
const common_1 = require("@nestjs/common");
let LocalizationService = LocalizationService_1 = class LocalizationService {
    constructor() {
        this.logger = new common_1.Logger(LocalizationService_1.name);
        this.chineseLocalizationRules = {
            avoidInternetSlang: true,
            avoidForcedEntertainment: true,
            avoidLiteralTranslation: true,
            useNaturalDailyChinese: true,
            regionSpecificRules: {
                MAINLAND: [
                    '使用简体中文',
                    '避免繁体字',
                    '使用大陆常用表达',
                ],
                TAIWAN: [
                    '使用繁体中文',
                    '使用台湾常用表达',
                    '注意用词差异',
                ],
                HONGKONG: [
                    '使用繁体中文',
                    '使用香港常用表达',
                    '注意粤语影响',
                ],
                SINGAPORE: [
                    '使用简体中文',
                    '注意中英混合表达',
                    '使用新加坡常用表达',
                ],
            },
        };
        this.cityAdaptationRules = {
            tier1: {
                characteristics: ['快节奏', '信息接受度高', '追求效率', '国际化视野'],
                communicationStyle: '简洁高效，直接明了，可以使用专业术语',
                examples: [
                    '直接说明核心信息',
                    '使用专业术语',
                    '强调效率和价值',
                ],
            },
            tier2: {
                characteristics: ['平衡节奏', '注重实用性', '性价比敏感'],
                communicationStyle: '平衡专业和通俗，注重实用性',
                examples: [
                    '解释专业术语',
                    '强调性价比',
                    '提供实用建议',
                ],
            },
            tier3: {
                characteristics: ['较慢节奏', '注重理解', '需要更多解释'],
                communicationStyle: '通俗易懂，详细解释，避免专业术语',
                examples: [
                    '使用日常用语',
                    '详细解释概念',
                    '提供具体例子',
                ],
            },
            overseas: {
                characteristics: ['文化背景不同', '可能不熟悉中文表达', '需要文化适配'],
                communicationStyle: '考虑文化差异，使用通用表达，避免地域特定用语',
                examples: [
                    '避免地域特定用语',
                    '使用通用表达',
                    '考虑文化背景',
                ],
            },
        };
        this.userGroupAdaptationRules = {
            student: {
                acknowledgeConstraints: '我注意到你是学生。这意味着什么？',
                optimizeForStudent: '我们为学生用户特别优化了什么：',
                lowCostRoutes: '低成本路线库',
                timeMatching: '时间匹配',
                specialSupport: '特别支持',
            },
            worker: {
                acknowledgeValue: '你的假期很宝贵。',
                timePlanning: '时间规划',
                rhythmArrangement: '节奏安排',
                expectationManagement: '预期管理',
            },
        };
    }
    async localizeContent(text, context) {
        this.logger.log(`Localizing content for language: ${context.language}, region: ${context.chineseRegion}`);
        let localizedText = text;
        const appliedRules = [];
        const adaptationNotes = [];
        if (context.language.startsWith('zh')) {
            localizedText = this.localizeForChinese(localizedText, context.chineseRegion);
            appliedRules.push('中文本土化');
            adaptationNotes.push('应用中文本土化规范');
        }
        if (context.cityTier) {
            localizedText = this.adaptForCityUser(localizedText, context.cityTier, context.cityName);
            appliedRules.push(`城市层级适配（${context.cityTier}）`);
            adaptationNotes.push(`适配${this.getCityTierName(context.cityTier)}用户`);
        }
        if (context.userGroup) {
            localizedText = this.adaptForUserGroup(localizedText, context.userGroup);
            appliedRules.push(`用户群体适配（${context.userGroup}）`);
            adaptationNotes.push(`适配${this.getUserGroupName(context.userGroup)}用户`);
        }
        return {
            originalText: text,
            localizedText,
            appliedRules,
            adaptationNotes,
        };
    }
    localizeForChinese(text, region) {
        var _a;
        let localized = text;
        if (this.chineseLocalizationRules.avoidInternetSlang) {
            localized = this.removeInternetSlang(localized);
        }
        if (this.chineseLocalizationRules.avoidForcedEntertainment) {
            localized = this.removeForcedEntertainment(localized);
        }
        if (this.chineseLocalizationRules.avoidLiteralTranslation) {
            localized = this.fixLiteralTranslation(localized);
        }
        if (this.chineseLocalizationRules.useNaturalDailyChinese) {
            localized = this.useNaturalChinese(localized);
        }
        if (region && ((_a = this.chineseLocalizationRules.regionSpecificRules) === null || _a === void 0 ? void 0 : _a[region])) {
            localized = this.applyRegionSpecificRules(localized, region);
        }
        return localized;
    }
    adaptForCityUser(text, cityTier, cityName) {
        const rules = this.cityAdaptationRules[cityTier.toLowerCase()];
        if (!rules) {
            return text;
        }
        let adapted = text;
        switch (cityTier) {
            case 'TIER1':
                adapted = this.adaptForTier1City(adapted, rules);
                break;
            case 'TIER2':
                adapted = this.adaptForTier2City(adapted, rules);
                break;
            case 'TIER3':
                adapted = this.adaptForTier3City(adapted, rules);
                break;
            case 'OVERSEAS':
                adapted = this.adaptForOverseasChinese(adapted, rules);
                break;
        }
        return adapted;
    }
    adaptForUserGroup(text, userGroup) {
        let adapted = text;
        switch (userGroup) {
            case 'STUDENT':
                adapted = this.adaptForStudent(text);
                break;
            case 'WORKER':
                adapted = this.adaptForWorker(text);
                break;
            case 'RETIREE':
                adapted = this.adaptForRetiree(text);
                break;
            case 'FREELANCER':
                adapted = this.adaptForFreelancer(text);
                break;
        }
        return adapted;
    }
    removeInternetSlang(text) {
        const slangMap = {
            '666': '很好',
            'yyds': '永远的神',
            '绝绝子': '非常好',
            'yyds！': '非常好！',
            'yyds。': '非常好。',
            'yyds，': '非常好，',
            'yyds？': '非常好？',
            'yyds：': '非常好：',
            'yyds；': '非常好；',
            '绝绝子！': '非常好！',
            '绝绝子。': '非常好。',
            '绝绝子，': '非常好，',
            '绝绝子？': '非常好？',
            '绝绝子：': '非常好：',
            '绝绝子；': '非常好；',
            '666！': '很好！',
            '666。': '很好。',
            '666，': '很好，',
            '666？': '很好？',
            '666：': '很好：',
            '666；': '很好；',
        };
        let cleaned = text;
        for (const [slang, replacement] of Object.entries(slangMap)) {
            cleaned = cleaned.replace(new RegExp(slang, 'gi'), replacement);
        }
        return cleaned;
    }
    removeForcedEntertainment(text) {
        let cleaned = text;
        cleaned = cleaned.replace(/!{3,}/g, '!!');
        cleaned = cleaned.replace(/\?{3,}/g, '??');
        cleaned = cleaned.replace(/哦{2,}/g, '哦');
        cleaned = cleaned.replace(/哈{3,}/g, '哈哈');
        return cleaned;
    }
    fixLiteralTranslation(text) {
        const translationMap = {
            '点击这里': '点击此处',
            '了解更多': '了解详情',
            '立即开始': '开始使用',
            '马上开始': '开始使用',
            '立即体验': '体验一下',
            '马上体验': '体验一下',
        };
        let fixed = text;
        for (const [literal, natural] of Object.entries(translationMap)) {
            fixed = fixed.replace(new RegExp(literal, 'g'), natural);
        }
        return fixed;
    }
    useNaturalChinese(text) {
        const naturalMap = {
            '您': '你',
            '敬请': '请',
            '敬请期待': '敬请期待',
            '敬请关注': '请关注',
        };
        let natural = text;
        return natural;
    }
    applyRegionSpecificRules(text, region) {
        let adapted = text;
        switch (region) {
            case 'MAINLAND':
                adapted = adapted.replace(/您/g, '你');
                break;
            case 'TAIWAN':
                break;
            case 'HONGKONG':
                break;
            case 'SINGAPORE':
                adapted = adapted.replace(/您/g, '你');
                break;
        }
        return adapted;
    }
    adaptForTier1City(text, rules) {
        let adapted = text;
        if (!adapted.includes('效率') && !adapted.includes('快速')) {
        }
        return adapted;
    }
    adaptForTier2City(text, rules) {
        let adapted = text;
        adapted = this.explainTechnicalTerms(adapted);
        if (adapted.includes('价格') || adapted.includes('成本')) {
            adapted = adapted.replace(/价格/g, '性价比');
        }
        return adapted;
    }
    adaptForTier3City(text, rules) {
        let adapted = text;
        adapted = this.useColloquialExpressions(adapted);
        adapted = this.addDetailedExplanations(adapted);
        return adapted;
    }
    adaptForOverseasChinese(text, rules) {
        let adapted = text;
        adapted = this.removeRegionalSpecificTerms(adapted);
        adapted = this.useUniversalExpressions(adapted);
        return adapted;
    }
    adaptForStudent(text) {
        const rules = this.userGroupAdaptationRules.student;
        let adapted = text;
        if (text.includes('价格') || text.includes('成本') || text.includes('费用')) {
            adapted = `${rules.acknowledgeConstraints}\n\n${rules.optimizeForStudent}\n- ${rules.lowCostRoutes}\n- ${rules.timeMatching}\n- ${rules.specialSupport}\n\n${adapted}`;
        }
        return adapted;
    }
    adaptForWorker(text) {
        const rules = this.userGroupAdaptationRules.worker;
        let adapted = text;
        if (text.includes('时间') || text.includes('日程') || text.includes('安排')) {
            adapted = `${rules.acknowledgeValue}\n\n我们特别关注：\n- ${rules.timePlanning}\n- ${rules.rhythmArrangement}\n- ${rules.expectationManagement}\n\n${adapted}`;
        }
        return adapted;
    }
    adaptForRetiree(text) {
        let adapted = text;
        adapted = adapted.replace(/你/g, '您');
        adapted = adapted.replace(/年轻人/g, '您');
        return adapted;
    }
    adaptForFreelancer(text) {
        let adapted = text;
        if (text.includes('时间') || text.includes('日程')) {
            adapted = `我们理解您的时间安排比较灵活。${adapted}`;
        }
        return adapted;
    }
    explainTechnicalTerms(text) {
        return text;
    }
    useColloquialExpressions(text) {
        const colloquialMap = {
            '实施': '做',
            '执行': '做',
            '进行': '做',
        };
        let colloquial = text;
        for (const [formal, casual] of Object.entries(colloquialMap)) {
            colloquial = colloquial.replace(new RegExp(formal, 'g'), casual);
        }
        return colloquial;
    }
    addDetailedExplanations(text) {
        return text;
    }
    removeRegionalSpecificTerms(text) {
        const regionalTerms = ['北上广', '一线城市', '二线城市'];
        let cleaned = text;
        for (const term of regionalTerms) {
            cleaned = cleaned.replace(new RegExp(term, 'g'), '这些城市');
        }
        return cleaned;
    }
    useUniversalExpressions(text) {
        return text;
    }
    getCityTierName(tier) {
        const nameMap = {
            TIER1: '一线城市',
            TIER2: '二线城市',
            TIER3: '三线城市',
            TIER4: '四线城市',
            OVERSEAS: '海外',
        };
        return nameMap[tier] || tier;
    }
    getUserGroupName(group) {
        const nameMap = {
            STUDENT: '学生',
            WORKER: '工作者',
            RETIREE: '退休',
            FREELANCER: '自由职业者',
            OTHER: '其他',
        };
        return nameMap[group] || group;
    }
};
exports.LocalizationService = LocalizationService;
exports.LocalizationService = LocalizationService = LocalizationService_1 = __decorate([
    (0, common_1.Injectable)()
], LocalizationService);
//# sourceMappingURL=localization.service.js.map