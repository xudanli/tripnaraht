"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CompliancePluginService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompliancePluginService = void 0;
const common_1 = require("@nestjs/common");
let CompliancePluginService = CompliancePluginService_1 = class CompliancePluginService {
    constructor() {
        this.logger = new common_1.Logger(CompliancePluginService_1.name);
    }
    generateChecklist(routeDirection, itineraryDraft, regions, poiTypes, userComplianceStatus) {
        var _a, _b, _c;
        const rd = routeDirection.routeDirection;
        const constraints = (rd.constraints || {});
        const complianceRules = (rd.complianceRules || ((_a = rd.metadata) === null || _a === void 0 ? void 0 : _a.complianceRules) || {});
        const countryCode = rd.countryCode || '';
        const items = [];
        const requiresPermit = ((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.requiresPermit) ||
            constraints.requiresPermit ||
            complianceRules.requiresPermit;
        if (requiresPermit) {
            const permitItem = this.createPermitItem(countryCode, complianceRules.permitInfo, regions, userComplianceStatus === null || userComplianceStatus === void 0 ? void 0 : userComplianceStatus.permitRejected);
            if (permitItem) {
                items.push(permitItem);
            }
        }
        const requiresGuide = ((_c = constraints.hard) === null || _c === void 0 ? void 0 : _c.requiresGuide) ||
            constraints.requiresGuide ||
            complianceRules.requiresGuide;
        if (requiresGuide) {
            const guideItem = this.createGuideItem(countryCode, regions, userComplianceStatus === null || userComplianceStatus === void 0 ? void 0 : userComplianceStatus.guideRejected);
            if (guideItem) {
                items.push(guideItem);
            }
        }
        if (complianceRules.restrictedAreas && complianceRules.restrictedAreas.length > 0) {
            const restrictionItem = this.createRestrictionItem(countryCode, complianceRules.restrictedAreas, regions);
            if (restrictionItem) {
                items.push(restrictionItem);
            }
        }
        if (itineraryDraft && (regions || poiTypes)) {
            const additionalItems = this.checkItineraryCompliance(itineraryDraft, countryCode, regions, poiTypes);
            items.push(...additionalItems);
        }
        const hardItems = items.filter(item => item.required && item.urgency === 'critical');
        const softItems = items.filter(item => !item.required || item.urgency !== 'critical');
        let downgradeOptions;
        if ((userComplianceStatus === null || userComplianceStatus === void 0 ? void 0 : userComplianceStatus.permitRejected) || (userComplianceStatus === null || userComplianceStatus === void 0 ? void 0 : userComplianceStatus.guideRejected)) {
            downgradeOptions = this.generateDowngradeOptions(countryCode, hardItems);
        }
        const summary = {
            totalItems: items.length,
            requiredItems: items.filter(item => item.required).length,
            criticalItems: hardItems.length,
            estimatedDaysAhead: Math.max(...items.map(item => item.recommendedDaysAhead), 0),
        };
        return {
            items,
            summary,
            userActionRequired: {
                hard: hardItems,
                soft: softItems,
            },
            downgradeOptions,
        };
    }
    createPermitItem(countryCode, permitInfo, regions, userRejected) {
        const countryPermitConfig = this.getCountryPermitConfig(countryCode);
        if (!countryPermitConfig && !permitInfo) {
            return null;
        }
        const config = permitInfo || countryPermitConfig;
        return {
            id: `permit_${countryCode}`,
            type: 'permit',
            title: (config === null || config === void 0 ? void 0 : config.name) || `${countryCode} 旅行许可`,
            description: (config === null || config === void 0 ? void 0 : config.name)
                ? `需要办理 ${config.name}。${userRejected ? '⚠️ 您已拒绝办理，系统将提供备选路线。' : '未办理可能导致无法进入相关区域。'}`
                : `该地区需要特殊许可。${userRejected ? '⚠️ 您已拒绝办理，系统将提供备选路线。' : '请提前查询并办理。'}`,
            required: !userRejected,
            recommendedDaysAhead: this.getRecommendedDaysAhead(countryCode, 'permit'),
            urgency: userRejected ? 'low' : (countryCode === 'NP' || countryCode === 'CN_XZ' ? 'critical' : 'high'),
            riskReminder: userRejected
                ? '已拒绝办理，将使用备选路线'
                : '未办理许可可能导致无法进入相关区域，行程将无法执行',
            applicationInfo: {
                name: (config === null || config === void 0 ? void 0 : config.name) || `${countryCode} 旅行许可`,
                link: config === null || config === void 0 ? void 0 : config.link,
                cost: config === null || config === void 0 ? void 0 : config.cost,
                provider: config === null || config === void 0 ? void 0 : config.name,
            },
            alternativeOptions: userRejected ? ['使用城市/轻线备选路线'] : undefined,
            regions,
        };
    }
    createGuideItem(countryCode, regions, userRejected) {
        const countryGuideConfig = this.getCountryGuideConfig(countryCode);
        if (!countryGuideConfig) {
            return null;
        }
        return {
            id: `guide_${countryCode}`,
            type: 'guide',
            title: countryGuideConfig.name,
            description: `${countryGuideConfig.name}。${userRejected ? '⚠️ 您已拒绝向导，系统将提供备选路线。' : '某些区域要求必须有向导陪同。'}`,
            required: !userRejected,
            recommendedDaysAhead: this.getRecommendedDaysAhead(countryCode, 'guide'),
            urgency: userRejected ? 'low' : (countryCode === 'NP' ? 'critical' : 'high'),
            riskReminder: userRejected
                ? '已拒绝向导，将使用备选路线'
                : '未安排向导可能导致无法进入相关区域',
            applicationInfo: {
                name: countryGuideConfig.name,
                link: countryGuideConfig.link,
                cost: countryGuideConfig.cost,
                provider: countryGuideConfig.provider,
            },
            alternativeOptions: userRejected ? ['使用城市/轻线备选路线'] : undefined,
            regions,
        };
    }
    createRestrictionItem(countryCode, restrictedAreas, regions) {
        return {
            id: `restriction_${countryCode}`,
            type: 'restriction',
            title: '限制区域提醒',
            description: `以下区域有特殊限制：${restrictedAreas.join('、')}。请提前了解相关规定。`,
            required: false,
            recommendedDaysAhead: 14,
            urgency: 'medium',
            riskReminder: '进入限制区域可能需要特殊许可或向导',
            regions: restrictedAreas,
        };
    }
    checkItineraryCompliance(itinerary, countryCode, regions, poiTypes) {
        const items = [];
        return items;
    }
    generateDowngradeOptions(countryCode, hardItems) {
        if (hardItems.length === 0) {
            return undefined;
        }
        const reasons = hardItems.map(item => item.title).join('、');
        const alternativeRoutes = this.getAlternativeRoutes(countryCode);
        return {
            reason: `用户拒绝办理：${reasons}。建议使用以下备选路线：`,
            alternativeRouteDirections: alternativeRoutes,
        };
    }
    getCountryPermitConfig(countryCode) {
        const configs = {
            'NP': {
                name: 'TIMS (Trekkers Information Management System)',
                link: 'https://www.timsnepal.gov.np',
                cost: 20,
            },
            'CN_XZ': {
                name: '西藏边防证',
                link: 'https://www.xizang.gov.cn',
                cost: 0,
            },
            'BT': {
                name: 'Bhutan Visa',
                link: 'https://www.mfa.gov.bt',
                cost: 40,
            },
        };
        return configs[countryCode] || null;
    }
    getCountryGuideConfig(countryCode) {
        const configs = {
            'NP': {
                name: '尼泊尔徒步向导',
                link: 'https://www.taan.org.np',
                cost: 25,
                provider: 'TAAN (Trekking Agencies Association of Nepal)',
            },
            'CN_XZ': {
                name: '西藏向导',
                link: 'https://www.xizang.gov.cn',
                cost: 300,
            },
        };
        return configs[countryCode] || null;
    }
    getRecommendedDaysAhead(countryCode, type) {
        var _a;
        const configs = {
            'NP': {
                permit: 30,
                guide: 14,
            },
            'CN_XZ': {
                permit: 21,
                guide: 7,
            },
            'BT': {
                permit: 30,
                guide: 14,
            },
        };
        return ((_a = configs[countryCode]) === null || _a === void 0 ? void 0 : _a[type]) || 14;
    }
    getAlternativeRoutes(countryCode) {
        const alternatives = {
            'NP': [
                '尼泊尔城市文化之旅',
                '尼泊尔轻松徒步路线',
                '加德满都谷地探索',
            ],
            'CN_XZ': [
                '西藏城市文化之旅',
                '拉萨周边轻松游',
                '日喀则文化探索',
            ],
            'BT': [
                '不丹文化之旅',
                '廷布城市探索',
            ],
        };
        return alternatives[countryCode] || ['城市/轻线备选路线'];
    }
};
exports.CompliancePluginService = CompliancePluginService;
exports.CompliancePluginService = CompliancePluginService = CompliancePluginService_1 = __decorate([
    (0, common_1.Injectable)()
], CompliancePluginService);
//# sourceMappingURL=compliance-plugin.service.js.map