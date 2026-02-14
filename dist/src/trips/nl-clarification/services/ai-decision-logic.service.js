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
var AiDecisionLogicService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiDecisionLogicService = void 0;
const common_1 = require("@nestjs/common");
const destination_clarification_config_service_1 = require("./destination-clarification-config.service");
let AiDecisionLogicService = AiDecisionLogicService_1 = class AiDecisionLogicService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AiDecisionLogicService_1.name);
    }
    async identifyPersona(destinationCode, userAnswers) {
        var _a;
        const config = await this.configService.getConfig(destinationCode);
        if (!config || !((_a = config.userPersonas) === null || _a === void 0 ? void 0 : _a.user_personas)) {
            return null;
        }
        const personas = config.userPersonas.user_personas;
        const aiDecisionLogic = config.userPersonas.ai_decision_logic;
        if (!aiDecisionLogic) {
            this.logger.warn(`目的地 ${destinationCode} 没有 AI 决策逻辑配置`);
            return null;
        }
        const assessmentTool = config.userPersonas.persona_assessment_tool;
        if (!assessmentTool || !assessmentTool.questions) {
            this.logger.warn(`目的地 ${destinationCode} 没有画像评估工具`);
            return null;
        }
        const personaScores = [];
        for (const persona of personas) {
            let score = 0;
            const reasons = [];
            let factors = 0;
            const characteristics = persona.characteristics || {};
            if (userAnswers.experienceLevel || userAnswers.extremeExperience) {
                const userExp = userAnswers.experienceLevel || userAnswers.extremeExperience;
                const personaExp = characteristics.experience_level || characteristics.experienceLevel;
                if (this.matchExperienceLevel(userExp, personaExp)) {
                    score += 0.3;
                    reasons.push(`经验水平匹配: ${personaExp}`);
                }
                factors += 0.3;
            }
            if (userAnswers.riskTolerance) {
                const userRisk = userAnswers.riskTolerance;
                const personaRisk = characteristics.risk_tolerance || characteristics.riskTolerance;
                if (this.matchRiskTolerance(userRisk, personaRisk)) {
                    score += 0.25;
                    reasons.push(`风险承受度匹配: ${personaRisk}`);
                }
                factors += 0.25;
            }
            if (userAnswers.physicalFitness || userAnswers.physicalCondition) {
                const userFitness = userAnswers.physicalFitness || userAnswers.physicalCondition;
                const personaFitness = characteristics.physical_fitness || characteristics.physicalFitness;
                if (this.matchPhysicalFitness(userFitness, personaFitness)) {
                    score += 0.2;
                    reasons.push(`体力水平匹配: ${personaFitness}`);
                }
                factors += 0.2;
            }
            if (userAnswers.totalBudget || userAnswers.budgetReality) {
                const userBudget = userAnswers.totalBudget || userAnswers.budgetReality;
                const personaBudget = characteristics.budget_eur || characteristics.budget_usd || characteristics.budget_dkk;
                if (this.matchBudget(userBudget, personaBudget)) {
                    score += 0.15;
                    reasons.push(`预算匹配`);
                }
                factors += 0.15;
            }
            if (userAnswers.activityTypes || userAnswers.activityPreferences) {
                const userActivities = Array.isArray(userAnswers.activityTypes)
                    ? userAnswers.activityTypes
                    : [userAnswers.activityTypes].filter(Boolean);
                const personaRoutes = persona.recommended_routes || [];
                const matchingRoutes = personaRoutes.filter((route) => {
                    const routeText = `${route.route || ''} ${route.reason || ''}`.toLowerCase();
                    return userActivities.some((act) => {
                        const actLower = act.toLowerCase();
                        if (actLower === 'city_walking' || actLower.includes('city') || actLower.includes('walking')) {
                            return routeText.includes('城市') ||
                                routeText.includes('漫步') ||
                                routeText.includes('温和') ||
                                routeText.includes('city') ||
                                routeText.includes('朗伊尔城');
                        }
                        if (actLower.includes('glacier') || actLower.includes('冰川')) {
                            return routeText.includes('冰川') || routeText.includes('glacier');
                        }
                        if (actLower.includes('wildlife') || actLower.includes('野生动物')) {
                            return routeText.includes('野生动物') ||
                                routeText.includes('wildlife') ||
                                routeText.includes('北极熊');
                        }
                        if (actLower.includes('boat') || actLower.includes('船')) {
                            return routeText.includes('船') ||
                                routeText.includes('boat') ||
                                routeText.includes('游船');
                        }
                        if (actLower.includes('camping') || actLower.includes('露营')) {
                            return routeText.includes('露营') ||
                                routeText.includes('camping') ||
                                routeText.includes('野外');
                        }
                        return routeText.includes(actLower) || actLower.includes(routeText);
                    });
                });
                if (matchingRoutes.length > 0) {
                    score += 0.1;
                    reasons.push(`活动偏好匹配: ${matchingRoutes.length} 个推荐路线`);
                }
                factors += 0.1;
            }
            const finalScore = factors > 0 ? score / factors : 0;
            personaScores.push({
                persona,
                score: finalScore,
                reasons,
            });
        }
        personaScores.sort((a, b) => b.score - a.score);
        const bestMatch = personaScores[0];
        if (personaScores.length > 0) {
            this.logger.debug(`画像匹配详情:`, {
                destinationCode,
                userAnswersKeys: Object.keys(userAnswers),
                personaCount: personas.length,
                topScores: personaScores.slice(0, 3).map(p => ({
                    personaId: p.persona.persona_id,
                    personaName: p.persona.persona_name,
                    score: p.score.toFixed(3),
                    reasons: p.reasons,
                })),
            });
        }
        if (!bestMatch || bestMatch.score < 0.3) {
            this.logger.debug(`未找到匹配的画像，最高得分: ${(bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.score) || 0}`);
            if (bestMatch && bestMatch.score >= 0.2) {
                this.logger.debug(`接近匹配阈值，可能需要更多信息。当前得分: ${bestMatch.score.toFixed(3)}, 阈值: 0.3`);
                this.logger.debug(`匹配原因: ${bestMatch.reasons.join('; ')}`);
            }
            return null;
        }
        this.logger.debug(`识别到用户画像: ${bestMatch.persona.persona_id}, 得分: ${bestMatch.score.toFixed(2)}`);
        return {
            personaId: bestMatch.persona.persona_id,
            personaName: bestMatch.persona.persona_name,
            personaNameEn: bestMatch.persona.persona_name_en,
            confidence: bestMatch.score,
            matchReasons: bestMatch.reasons,
        };
    }
    async applySafetyFirstPrinciple(destinationCode, personaId, activityTypes, userAnswers) {
        var _a;
        const config = await this.configService.getConfig(destinationCode);
        if (!config || !((_a = config.userPersonas) === null || _a === void 0 ? void 0 : _a.user_personas)) {
            return { shouldWarn: false, shouldBlock: false };
        }
        const aiDecisionLogic = config.userPersonas.ai_decision_logic;
        if (!aiDecisionLogic) {
            return { shouldWarn: false, shouldBlock: false };
        }
        const persona = config.userPersonas.user_personas.find((p) => p.persona_id === personaId);
        if (!persona) {
            return { shouldWarn: false, shouldBlock: false };
        }
        const activities = Array.isArray(activityTypes) ? activityTypes : [activityTypes];
        const notRecommended = persona.not_recommended || [];
        const hasNotRecommendedActivity = activities.some((act) => {
            return notRecommended.some((nr) => {
                const actLower = act.toLowerCase();
                const nrLower = nr.toLowerCase();
                return nrLower.includes(actLower) || actLower.includes(nrLower);
            });
        });
        if (hasNotRecommendedActivity) {
            const safetyFirstPrinciple = aiDecisionLogic.safety_first_principle ||
                '当用户画像与路线不匹配时，AI必须明确劝阻，即使用户坚持';
            const criticalGates = persona.critical_gate || [];
            const isCriticalMismatch = criticalGates.some((gate) => {
                const gateLower = gate.toLowerCase();
                return activities.some((act) => gateLower.includes(act.toLowerCase()));
            });
            if (isCriticalMismatch) {
                return {
                    shouldWarn: true,
                    warningMessage: `⚠️ ${safetyFirstPrinciple}\n\n根据您的画像（${persona.persona_name}），您选择的活动可能不适合。为了您的安全，我们强烈建议您重新考虑。`,
                    shouldBlock: true,
                    blockReason: `画像与活动不匹配: ${persona.persona_name} vs ${activities.join(', ')}`,
                    alternatives: this.generateAlternatives(persona, config),
                };
            }
            else {
                return {
                    shouldWarn: true,
                    warningMessage: `⚠️ 根据您的画像（${persona.persona_name}），您选择的活动可能不是最佳选择。建议：${notRecommended.join('；')}`,
                    shouldBlock: false,
                    alternatives: this.generateAlternatives(persona, config),
                };
            }
        }
        return { shouldWarn: false, shouldBlock: false };
    }
    async getRecommendedRoutes(destinationCode, personaId, userAnswers) {
        var _a;
        const config = await this.configService.getConfig(destinationCode);
        if (!config || !((_a = config.userPersonas) === null || _a === void 0 ? void 0 : _a.user_personas)) {
            return [];
        }
        const persona = config.userPersonas.user_personas.find((p) => p.persona_id === personaId);
        if (!persona || !persona.recommended_routes) {
            return [];
        }
        const routes = persona.recommended_routes || [];
        const filteredRoutes = routes.filter((route) => {
            if (route.season && userAnswers.travelSeason) {
                const routeSeason = route.season.toLowerCase();
                const userSeason = userAnswers.travelSeason.toLowerCase();
                if (!this.matchSeason(routeSeason, userSeason)) {
                    return false;
                }
            }
            if (route.prerequisites && Array.isArray(route.prerequisites)) {
                const hasAllPrerequisites = route.prerequisites.every((prereq) => {
                    return this.checkPrerequisite(prereq, userAnswers);
                });
                if (!hasAllPrerequisites) {
                    return false;
                }
            }
            return true;
        });
        return filteredRoutes.map((route) => ({
            route: route.route,
            reason: route.reason,
            difficultyMatch: route.difficulty_match || '良好',
            season: route.season,
            prerequisites: route.prerequisites,
        }));
    }
    async applyDecisionMatrix(destinationCode, userAnswers) {
        const config = await this.configService.getConfig(destinationCode);
        if (!config || !config.userPersonas) {
            return {
                decision: 'GO_FULLY_SUPPORTED',
                reason: '无特化配置，使用通用流程',
                recommendations: [],
            };
        }
        const redFlags = config.userPersonas.red_flags || {};
        const hasMedicalRedFlag = this.checkRedFlags(userAnswers, redFlags.medical || []);
        const hasPsychologicalRedFlag = this.checkRedFlags(userAnswers, redFlags.psychological || []);
        const hasPracticalRedFlag = this.checkRedFlags(userAnswers, redFlags.practical || []);
        const hasSafetyRedFlag = this.checkRedFlags(userAnswers, redFlags.safety || []);
        const destinationType = this.getDestinationType(destinationCode);
        if (hasMedicalRedFlag || hasSafetyRedFlag) {
            const recommendations = destinationType === 'SJ'
                ? ['强烈建议改目的地', '咨询医生后重新评估']
                : destinationType === 'GL'
                    ? ['强烈建议改目的地（如冰岛、挪威）', '咨询医生后重新评估']
                    : ['强烈建议改目的地', '咨询医生后重新评估'];
            return {
                decision: 'NOT_RECOMMENDED',
                reason: '检测到严重的医疗或安全警告标志',
                recommendations,
            };
        }
        if (hasPsychologicalRedFlag) {
            const recommendations = destinationType === 'SJ'
                ? ['建议延期或改目的地', '咨询心理健康专家']
                : destinationType === 'GL'
                    ? ['建议延期或改目的地', '咨询心理健康专家']
                    : ['建议延期或改目的地', '咨询心理健康专家', '考虑先进行基础训练'];
            return {
                decision: 'STRONGLY_RECONSIDER',
                reason: destinationType === 'SJ' || destinationType === 'GL'
                    ? '检测到心理警告标志，可能不适合极地环境'
                    : '检测到心理警告标志，可能不适合山地环境',
                recommendations,
            };
        }
        if (hasPracticalRedFlag) {
            const recommendations = destinationType === 'SJ'
                ? ['增加预算', '购买保险', '选择其他目的地']
                : destinationType === 'GL'
                    ? ['增加预算', '购买保险', '缩短行程或选择更经济的活动']
                    : ['增加预算', '购买山地旅游保险（包括直升机救援）', '缩短行程或选择更经济的住宿'];
            return {
                decision: 'GO_ALTERNATIVE_PLAN',
                reason: '检测到实际约束问题（预算、保险等）',
                recommendations,
            };
        }
        const hasAllCriticalFields = this.checkAllCriticalFields(userAnswers, config);
        if (!hasAllCriticalFields) {
            const recommendations = destinationType === 'SJ'
                ? ['完成所有关键问题', '咨询专业向导']
                : destinationType === 'GL'
                    ? ['完成所有关键问题', '咨询专业向导', '选择温和的活动']
                    : ['完成所有关键问题', '咨询专业向导', '考虑参加培训课程'];
            return {
                decision: 'GO_WITH_STRONG_CAUTION',
                reason: '部分关键信息缺失，需要特别指导',
                recommendations,
            };
        }
        if (destinationType === 'AL') {
            const skillMismatch = this.checkAlpsSkillMismatch(userAnswers);
            if (skillMismatch) {
                return {
                    decision: 'GO_ALTERNATIVE_PLAN',
                    reason: skillMismatch.reason,
                    recommendations: skillMismatch.recommendations,
                };
            }
        }
        return {
            decision: 'GO_FULLY_SUPPORTED',
            reason: '用户完全适合，鼓励前往',
            recommendations: ['优化体验', '准备充分'],
        };
    }
    getDestinationType(destinationCode) {
        if (destinationCode === 'SJ')
            return 'SJ';
        if (destinationCode === 'GL')
            return 'GL';
        if (destinationCode === 'AL')
            return 'AL';
        return 'OTHER';
    }
    checkAlpsSkillMismatch(userAnswers) {
        const experienceLevel = userAnswers.experienceLevel || userAnswers.extremeExperience || '';
        const activityTypes = userAnswers.activityTypes || [];
        const hasGuide = userAnswers.hasGuide === 'required' || userAnswers.hasGuide === true;
        const hasTechnicalActivity = activityTypes.some((act) => {
            const actLower = act.toLowerCase();
            return actLower.includes('技术') || actLower.includes('攀登') ||
                actLower.includes('冰川') || actLower.includes('4000');
        });
        const hasNoExperience = experienceLevel.includes('无') || experienceLevel.includes('no') ||
            experienceLevel.includes('first');
        if (hasTechnicalActivity && hasNoExperience && !hasGuide) {
            return {
                reason: '选择了技术路线但缺乏经验且无向导支持',
                recommendations: [
                    '强烈建议选择非技术路线（如缆车+步行）',
                    '或参加专业培训课程',
                    '或雇佣专业向导',
                    '从简单路线开始积累经验'
                ],
            };
        }
        return null;
    }
    matchExperienceLevel(userExp, personaExp) {
        if (!userExp || !personaExp)
            return false;
        const userLower = userExp.toLowerCase();
        const personaLower = personaExp.toLowerCase();
        if (userLower === 'no_first_time' ||
            userLower.includes('first') ||
            userLower.includes('无') ||
            userLower.includes('no') ||
            userLower.includes('无经验')) {
            return personaLower.includes('首次') ||
                personaLower.includes('first') ||
                personaLower.includes('无') ||
                personaLower.includes('无经验') ||
                personaLower.includes('无或极少');
        }
        if (userLower === 'yes_some' ||
            userLower.includes('some') ||
            userLower.includes('有') ||
            userLower.includes('有1-2次') ||
            userLower.includes('有一些')) {
            return personaLower.includes('有') ||
                personaLower.includes('some') ||
                personaLower.includes('enthusiast') ||
                personaLower.includes('有1-2次') ||
                personaLower.includes('有极地或高海拔经验') ||
                personaLower.includes('有冒险活动经验') ||
                personaLower.includes('有自然观察经验');
        }
        if (userLower === 'yes_extensive' ||
            userLower.includes('extensive') ||
            userLower.includes('多次') ||
            userLower.includes('yes') ||
            userLower.includes('丰富')) {
            return personaLower.includes('多次') ||
                personaLower.includes('extensive') ||
                personaLower.includes('expert') ||
                personaLower.includes('多次极地经验') ||
                personaLower.includes('多次极地');
        }
        return false;
    }
    matchRiskTolerance(userRisk, personaRisk) {
        if (!userRisk || !personaRisk)
            return false;
        const userLower = userRisk.toLowerCase();
        const personaLower = personaRisk.toLowerCase();
        if (userLower === 'low' || userLower === '低') {
            return personaLower.includes('低') || personaLower.includes('low');
        }
        if (userLower === 'high' || userLower === '高') {
            return personaLower.includes('高') || personaLower.includes('high');
        }
        if (userLower === 'medium' || userLower === '中') {
            return personaLower.includes('中') || personaLower.includes('medium');
        }
        return false;
    }
    matchPhysicalFitness(userFitness, personaFitness) {
        if (!userFitness || !personaFitness)
            return false;
        const userLower = userFitness.toLowerCase();
        const personaLower = personaFitness.toLowerCase();
        if (userLower.includes('excellent') || userLower.includes('优秀')) {
            return personaLower.includes('优秀') || personaLower.includes('excellent');
        }
        if (userLower.includes('good') || userLower.includes('良好')) {
            return personaLower.includes('良好') || personaLower.includes('good');
        }
        if (userLower.includes('fair') || userLower.includes('一般')) {
            return personaLower.includes('一般') || personaLower.includes('fair');
        }
        return false;
    }
    matchBudget(userBudget, personaBudget) {
        if (!userBudget || !personaBudget)
            return false;
        return true;
    }
    matchSeason(routeSeason, userSeason) {
        const routeLower = routeSeason.toLowerCase();
        const userLower = userSeason.toLowerCase();
        if (routeLower.includes('全年') || routeLower.includes('all year')) {
            return true;
        }
        if (userLower.includes('summer') || userLower.includes('夏季')) {
            return routeLower.includes('summer') || routeLower.includes('夏季') || routeLower.includes('6-8');
        }
        if (userLower.includes('winter') || userLower.includes('冬季') || userLower.includes('polar_night') || userLower.includes('极夜')) {
            return routeLower.includes('winter') || routeLower.includes('冬季') || routeLower.includes('极夜') || routeLower.includes('10-2');
        }
        return true;
    }
    checkPrerequisite(prereq, userAnswers) {
        const prereqLower = prereq.toLowerCase();
        if (prereqLower.includes('经验') || prereqLower.includes('experience')) {
            const userExp = userAnswers.experienceLevel || userAnswers.extremeExperience;
            return userExp && (userExp.includes('extensive') || userExp.includes('多次'));
        }
        if (prereqLower.includes('向导') || prereqLower.includes('guide')) {
            return userAnswers.hasGuide === 'required' || userAnswers.hasGuide === true;
        }
        if (prereqLower.includes('预算') || prereqLower.includes('budget')) {
            return userAnswers.budgetReality && userAnswers.budgetReality !== 'under_1500';
        }
        return true;
    }
    checkRedFlags(userAnswers, redFlagList) {
        const answerStr = JSON.stringify(userAnswers).toLowerCase();
        return redFlagList.some(flag => answerStr.includes(flag.toLowerCase()));
    }
    checkAllCriticalFields(userAnswers, config) {
        var _a, _b;
        for (const round of config.clarificationRounds) {
            for (const question of round.questions) {
                if (((_a = question.metadata) === null || _a === void 0 ? void 0 : _a.isCritical) && ((_b = question.metadata) === null || _b === void 0 ? void 0 : _b.fieldName)) {
                    const fieldName = question.metadata.fieldName;
                    if (!userAnswers[fieldName]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    generateAlternatives(persona, config) {
        const alternatives = [];
        if (persona.recommended_routes && persona.recommended_routes.length > 0) {
            const firstRoute = persona.recommended_routes[0];
            alternatives.push({
                label: `选择推荐路线: ${firstRoute.route}`,
                description: firstRoute.reason || '适合您画像的路线',
                action: `set_route:${firstRoute.route}`,
            });
        }
        return alternatives;
    }
};
exports.AiDecisionLogicService = AiDecisionLogicService;
exports.AiDecisionLogicService = AiDecisionLogicService = AiDecisionLogicService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [destination_clarification_config_service_1.DestinationClarificationConfigService])
], AiDecisionLogicService);
//# sourceMappingURL=ai-decision-logic.service.js.map