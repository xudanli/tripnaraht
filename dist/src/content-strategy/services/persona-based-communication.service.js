"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PersonaBasedCommunicationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaBasedCommunicationService = void 0;
const common_1 = require("@nestjs/common");
let PersonaBasedCommunicationService = PersonaBasedCommunicationService_1 = class PersonaBasedCommunicationService {
    constructor() {
        this.logger = new common_1.Logger(PersonaBasedCommunicationService_1.name);
    }
    identifyUserPersona(userProfile) {
        var _a, _b, _c;
        const traits = [];
        let personaType = 'RATIONAL_EXPLORER';
        let confidence = 0.5;
        const riskTolerance = ((_a = userProfile.preferences) === null || _a === void 0 ? void 0 : _a.riskTolerance) || 'MEDIUM';
        if (riskTolerance === 'LOW') {
            personaType = 'CONSERVATIVE_SAFETY';
            traits.push('重视安全', '偏好稳定', '谨慎决策');
            confidence = 0.7;
        }
        else if (riskTolerance === 'HIGH') {
            personaType = 'EXPERIENCE_SEEKER';
            traits.push('追求体验', '愿意冒险', '开放探索');
            confidence = 0.7;
        }
        else {
            personaType = 'RATIONAL_EXPLORER';
            traits.push('理性分析', '数据驱动', '平衡决策');
            confidence = 0.6;
        }
        const interests = ((_b = userProfile.preferences) === null || _b === void 0 ? void 0 : _b.interests) || [];
        if (interests.includes('冒险') || interests.includes('挑战')) {
            if (personaType === 'RATIONAL_EXPLORER') {
                personaType = 'EXPERIENCE_SEEKER';
                confidence = Math.min(confidence + 0.2, 1.0);
            }
            traits.push('喜欢挑战');
        }
        if (interests.includes('安全') || interests.includes('舒适')) {
            if (personaType === 'RATIONAL_EXPLORER') {
                personaType = 'CONSERVATIVE_SAFETY';
                confidence = Math.min(confidence + 0.2, 1.0);
            }
            traits.push('重视舒适');
        }
        if ((_c = userProfile.history) === null || _c === void 0 ? void 0 : _c.pastTrips) {
            const pastTrips = userProfile.history.pastTrips;
            if (pastTrips.length > 0) {
                const hasAdventureTrips = pastTrips.some((trip) => { var _a, _b; return ((_a = trip.tags) === null || _a === void 0 ? void 0 : _a.includes('冒险')) || ((_b = trip.tags) === null || _b === void 0 ? void 0 : _b.includes('挑战')); });
                if (hasAdventureTrips && personaType !== 'CONSERVATIVE_SAFETY') {
                    personaType = 'EXPERIENCE_SEEKER';
                    confidence = Math.min(confidence + 0.1, 1.0);
                }
            }
        }
        return {
            type: personaType,
            confidence,
            traits,
            communicationPreferences: this.getCommunicationPreferences(personaType),
        };
    }
    generatePersonaBasedCommunication(persona, context) {
        switch (persona.type) {
            case 'RATIONAL_EXPLORER':
                return this.generateRationalExplorerCommunication(context);
            case 'EXPERIENCE_SEEKER':
                return this.generateExperienceSeekerCommunication(context);
            case 'CONSERVATIVE_SAFETY':
                return this.generateConservativeSafetyCommunication(context);
            default:
                return this.generateDefaultCommunication(context);
        }
    }
    adaptForCulture(text, culture) {
        const adaptedText = this.adaptTextForCulture(text, culture);
        const culturalElements = this.extractCulturalElements(culture);
        return {
            adaptedText,
            culturalElements,
        };
    }
    adaptForCity(text, city, culture) {
        const cityAdaptations = {
            '北京': ['更直接', '注重效率'],
            '上海': ['更精致', '注重细节'],
            '广州': ['更务实', '注重实用'],
            '深圳': ['更创新', '注重效率'],
        };
        const cityStyle = cityAdaptations[city] || [];
        if (cityStyle.length > 0) {
            return `${text}（${cityStyle.join('、')}）`;
        }
        return text;
    }
    generateRationalExplorerCommunication(context) {
        return {
            style: {
                tone: '专业、理性',
                language: ['数据驱动', '逻辑清晰', '客观分析'],
                emphasis: ['事实', '数据', '分析', '逻辑'],
            },
            contentFocus: {
                primary: ['数据支持', '逻辑分析', '客观评估', '风险量化'],
                secondary: ['对比分析', '成本效益', '可行性评估'],
                avoid: ['情感化表达', '主观判断', '模糊描述'],
            },
            approach: {
                introduction: '基于数据分析，我为你整理了以下信息：',
                explanation: '让我们从数据角度分析这个选择：',
                callToAction: '基于这些数据，你可以做出理性的判断。',
            },
        };
    }
    generateExperienceSeekerCommunication(context) {
        return {
            style: {
                tone: '热情、生动',
                language: ['体验丰富', '感受深刻', '探索发现'],
                emphasis: ['体验', '感受', '探索', '发现'],
            },
            contentFocus: {
                primary: ['体验价值', '独特感受', '探索乐趣', '记忆点'],
                secondary: ['文化体验', '自然风光', '当地特色'],
                avoid: ['过度技术化', '冷冰冰的数据', '风险恐吓'],
            },
            approach: {
                introduction: '想象一下，你将拥有这样的体验：',
                explanation: '这条路线的独特之处在于：',
                callToAction: '准备好开启这段精彩的探索之旅了吗？',
            },
        };
    }
    generateConservativeSafetyCommunication(context) {
        return {
            style: {
                tone: '温和、安心',
                language: ['安全可靠', '稳妥选择', '充分准备'],
                emphasis: ['安全', '准备', '保障', '可靠'],
            },
            contentFocus: {
                primary: ['安全保障', '风险控制', '充分准备', '可靠信息'],
                secondary: ['舒适体验', '稳定安排', '应急方案'],
                avoid: ['冒险刺激', '不确定性', '高风险活动'],
            },
            approach: {
                introduction: '我们理解你对安全的重视，让我们为你提供最稳妥的选择：',
                explanation: '在安全方面，这条路线的保障措施包括：',
                callToAction: '做好充分准备，你可以安心出发。',
            },
        };
    }
    generateDefaultCommunication(context) {
        return {
            style: {
                tone: '友好、平衡',
                language: ['清晰', '友好', '专业'],
                emphasis: ['信息', '选择', '支持'],
            },
            contentFocus: {
                primary: ['基本信息', '选择建议', '支持信息'],
                secondary: ['详细说明', '注意事项'],
                avoid: [],
            },
            approach: {
                introduction: '我为你整理了以下信息：',
                explanation: '让我们看看这个选择：',
                callToAction: '你可以根据这些信息做出决定。',
            },
        };
    }
    getCommunicationPreferences(persona) {
        const preferences = {
            RATIONAL_EXPLORER: {
                tone: 'PROFESSIONAL',
                detailLevel: 'DETAILED',
                focus: ['数据', '分析', '逻辑'],
            },
            EXPERIENCE_SEEKER: {
                tone: 'FRIENDLY',
                detailLevel: 'MODERATE',
                focus: ['体验', '感受', '探索'],
            },
            CONSERVATIVE_SAFETY: {
                tone: 'PROFESSIONAL',
                detailLevel: 'DETAILED',
                focus: ['安全', '准备', '保障'],
            },
        };
        return preferences[persona];
    }
    adaptTextForCulture(text, culture) {
        if (culture.language === 'zh-CN') {
            if (culture.region === '华南') {
                return text.replace(/您/g, '你');
            }
            else if (culture.region === '华北') {
                return text;
            }
        }
        return text;
    }
    extractCulturalElements(culture) {
        const elements = {
            expressions: [],
            references: [],
            style: '',
        };
        if (culture.language === 'zh-CN') {
            elements.expressions = ['本土化表达', '符合中文习惯'];
            elements.style = '中文表达风格';
        }
        else if (culture.language === 'en-US') {
            elements.expressions = ['Native expressions', 'Natural English'];
            elements.style = 'English style';
        }
        if (culture.city) {
            elements.references.push(`城市：${culture.city}`);
        }
        return elements;
    }
    generatePersonaCopy(baseText, persona, context) {
        const communication = this.generatePersonaBasedCommunication(persona, context);
        const adaptedText = this.adaptTextForCulture(baseText, {
            language: 'zh-CN',
        });
        let personaText = adaptedText;
        if (persona.type === 'RATIONAL_EXPLORER') {
            personaText = `${communication.approach.introduction}\n\n${adaptedText}\n\n${communication.approach.explanation}`;
        }
        else if (persona.type === 'EXPERIENCE_SEEKER') {
            personaText = `${communication.approach.introduction}\n\n${adaptedText}\n\n${communication.approach.callToAction}`;
        }
        else if (persona.type === 'CONSERVATIVE_SAFETY') {
            personaText = `${communication.approach.introduction}\n\n${adaptedText}\n\n${communication.approach.explanation}`;
        }
        return personaText;
    }
};
exports.PersonaBasedCommunicationService = PersonaBasedCommunicationService;
exports.PersonaBasedCommunicationService = PersonaBasedCommunicationService = PersonaBasedCommunicationService_1 = __decorate([
    (0, common_1.Injectable)()
], PersonaBasedCommunicationService);
//# sourceMappingURL=persona-based-communication.service.js.map