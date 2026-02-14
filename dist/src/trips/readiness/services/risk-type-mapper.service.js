"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskTypeMapperService = void 0;
const common_1 = require("@nestjs/common");
let RiskTypeMapperService = class RiskTypeMapperService {
    constructor() {
        this.TYPE_LABELS = {
            'WEATHER': {
                zh: '天气风险',
                en: 'Weather Risk',
                category: 'weather',
                icon: '🌨️',
                description: '天气相关风险，如极端天气、暴风雪等',
            },
            'TERRAIN': {
                zh: '地形风险',
                en: 'Terrain Risk',
                category: 'terrain',
                icon: '⛰️',
                description: '地形复杂或危险，如陡峭山路、F-road等',
            },
            'WATER': {
                zh: '水上安全',
                en: 'Water Safety',
                category: 'safety',
                icon: '🌊',
                description: '涉及水域活动，需要注意潮汐、海浪、水温等安全因素',
            },
            'OTHER': {
                zh: '其他风险',
                en: 'Other Risk',
                category: 'other',
                icon: '⚠️',
                description: '其他类型的风险',
            },
            'weather_extreme': {
                zh: '极端天气',
                en: 'Extreme Weather',
                category: 'weather',
                icon: '🌨️',
                description: '可能遭遇极端天气条件，如暴风雪、强风、低温等',
            },
            'terrain': {
                zh: '地形风险',
                en: 'Terrain Risk',
                category: 'terrain',
                icon: '⛰️',
                description: '地形复杂或危险，如陡峭山路、F-road、冰川等',
            },
            'wildlife': {
                zh: '野生动物',
                en: 'Wildlife',
                category: 'safety',
                icon: '🐻',
                description: '可能遭遇野生动物，需要注意安全距离和防护',
            },
            'water_safety': {
                zh: '水上安全',
                en: 'Water Safety',
                category: 'safety',
                icon: '🌊',
                description: '涉及水域活动，需要注意潮汐、海浪、水温等安全因素',
            },
            'logistics_remote': {
                zh: '偏远地区',
                en: 'Remote Area',
                category: 'logistics',
                icon: '🗺️',
                description: '位于偏远地区，交通不便，救援困难，需要充分准备',
            },
            'crime': {
                zh: '治安风险',
                en: 'Crime Risk',
                category: 'safety',
                icon: '⚠️',
                description: '存在治安风险，需要注意个人财物和人身安全',
            },
            'healthcare_gap': {
                zh: '医疗资源',
                en: 'Healthcare Gap',
                category: 'safety',
                icon: '🏥',
                description: '医疗资源有限，需要准备常用药品和急救用品',
            },
            'regulatory': {
                zh: '法规要求',
                en: 'Regulatory',
                category: 'other',
                icon: '📋',
                description: '涉及法规要求，如许可证、保险、签证等',
            },
        };
    }
    getTypeLabel(type, lang = 'zh') {
        if (this.TYPE_LABELS[type]) {
            return this.TYPE_LABELS[type][lang];
        }
        const lowerType = type.toLowerCase();
        if (this.TYPE_LABELS[lowerType]) {
            return this.TYPE_LABELS[lowerType][lang];
        }
        const normalizedType = this.normalizeRiskType(type);
        if (normalizedType && this.TYPE_LABELS[normalizedType]) {
            return this.TYPE_LABELS[normalizedType][lang];
        }
        return type;
    }
    normalizeRiskType(type) {
        const upperType = type.toUpperCase();
        const typeMap = {
            'WEATHER': 'weather_extreme',
            'TERRAIN': 'terrain',
            'WATER': 'water_safety',
            'WILDLIFE': 'wildlife',
            'CRIME': 'crime',
            'LOGISTICS': 'logistics_remote',
            'HEALTHCARE': 'healthcare_gap',
            'REGULATORY': 'regulatory',
        };
        return typeMap[upperType] || null;
    }
    getCategory(type) {
        var _a;
        return ((_a = this.TYPE_LABELS[type]) === null || _a === void 0 ? void 0 : _a.category) || 'other';
    }
    getIcon(type) {
        var _a;
        return ((_a = this.TYPE_LABELS[type]) === null || _a === void 0 ? void 0 : _a.icon) || '⚠️';
    }
    getTypeDescription(type, lang = 'zh') {
        const riskType = this.TYPE_LABELS[type];
        if (!riskType)
            return '';
        if (lang === 'en') {
            return riskType.en || riskType.description || '';
        }
        return riskType.zh || riskType.description || '';
    }
    getSeverityLabel(severity, lang = 'zh') {
        var _a;
        const normalizedSeverity = (severity === 'high' || severity === 'medium' || severity === 'low')
            ? severity
            : 'medium';
        const labels = {
            high: { zh: '高', en: 'High' },
            medium: { zh: '中', en: 'Medium' },
            low: { zh: '低', en: 'Low' },
        };
        return ((_a = labels[normalizedSeverity]) === null || _a === void 0 ? void 0 : _a[lang]) || severity;
    }
    enhanceRisk(risk, lang = 'zh') {
        let typeInfo = this.TYPE_LABELS[risk.type];
        if (!typeInfo) {
            const lowerType = risk.type.toLowerCase();
            typeInfo = this.TYPE_LABELS[lowerType];
        }
        if (!typeInfo) {
            const normalizedType = this.normalizeRiskType(risk.type);
            if (normalizedType) {
                typeInfo = this.TYPE_LABELS[normalizedType];
            }
        }
        if (!typeInfo) {
            typeInfo = {
                zh: risk.type,
                en: risk.type,
                category: 'other',
                icon: '⚠️',
                description: '',
            };
        }
        const message = risk.message || risk.summary || typeInfo.description || '';
        const severity = (risk.severity === 'high' || risk.severity === 'medium' || risk.severity === 'low')
            ? risk.severity
            : 'medium';
        return {
            ...risk,
            typeLabel: typeInfo[lang] || risk.type,
            typeLabelEn: typeInfo.en || risk.type,
            category: typeInfo.category || 'other',
            typeIcon: typeInfo.icon || '⚠️',
            typeDescription: typeInfo.description || '',
            severityLabel: this.getSeverityLabel(severity, lang),
            severityLabelEn: this.getSeverityLabel(severity, 'en'),
            message: message || typeInfo.description || '',
            summary: risk.summary || typeInfo.description || '',
            description: message || typeInfo.description || '',
            impact: this.generateImpactDescription(risk, lang),
            mitigation: risk.mitigation || [],
            sources: risk.sources || undefined,
            mitigationDetails: this.generateMitigationDetails(risk.mitigation || [], lang),
        };
    }
    generateImpactDescription(risk, lang) {
        if (risk.affectedPois && risk.affectedPois.length > 0) {
            return lang === 'zh'
                ? `影响 ${risk.affectedPois.length} 个POI`
                : `Affects ${risk.affectedPois.length} POIs`;
        }
        return lang === 'zh' ? '可能影响行程执行' : 'May affect trip execution';
    }
    generateMitigationDetails(mitigations, lang) {
        return mitigations.map((mitigation, index) => ({
            action: mitigation,
            priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
        }));
    }
    groupRisksByCategory(risks) {
        const grouped = {
            weather: [],
            terrain: [],
            safety: [],
            logistics: [],
            other: [],
        };
        for (const risk of risks) {
            const category = risk.category || this.getCategory(risk.type);
            if (grouped[category]) {
                grouped[category].push(risk);
            }
            else {
                grouped.other.push(risk);
            }
        }
        return grouped;
    }
};
exports.RiskTypeMapperService = RiskTypeMapperService;
exports.RiskTypeMapperService = RiskTypeMapperService = __decorate([
    (0, common_1.Injectable)()
], RiskTypeMapperService);
//# sourceMappingURL=risk-type-mapper.service.js.map