// src/trips/nl-clarification/services/ai-decision-logic.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DestinationClarificationConfigService } from './destination-clarification-config.service';
import { DestinationClarificationConfig } from '../config/destination-clarification.config';

/**
 * AI 决策逻辑服务
 * 
 * 基于目的地用户画像系统的 AI 决策逻辑，实现：
 * - 用户画像识别
 * - 安全第一原则检查
 * - 路线匹配和推荐
 * - 决策矩阵评估
 */
@Injectable()
export class AiDecisionLogicService {
  private readonly logger = new Logger(AiDecisionLogicService.name);

  constructor(
    private readonly configService: DestinationClarificationConfigService,
  ) {}

  /**
   * 识别用户画像
   * 
   * 基于用户回答的问题，匹配最符合的用户画像
   */
  async identifyPersona(
    destinationCode: string,
    userAnswers: Record<string, any>
  ): Promise<{
    personaId: string;
    personaName: string;
    personaNameEn?: string;
    confidence: number;
    matchReasons: string[];
  } | null> {
    const config = await this.configService.getConfig(destinationCode);
    if (!config || !config.userPersonas?.user_personas) {
      return null;
    }

    const personas = config.userPersonas.user_personas;
    const aiDecisionLogic = config.userPersonas.ai_decision_logic;

    if (!aiDecisionLogic) {
      this.logger.warn(`目的地 ${destinationCode} 没有 AI 决策逻辑配置`);
      return null;
    }

    // 使用评估工具进行画像识别
    const assessmentTool = config.userPersonas.persona_assessment_tool;
    if (!assessmentTool || !assessmentTool.questions) {
      this.logger.warn(`目的地 ${destinationCode} 没有画像评估工具`);
      return null;
    }

    // 计算每个画像的匹配分数
    const personaScores: Array<{
      persona: any;
      score: number;
      reasons: string[];
    }> = [];

    for (const persona of personas) {
      let score = 0;
      const reasons: string[] = [];
      let factors = 0;

      // 基于画像特征匹配
      const characteristics = persona.characteristics || {};
      
      // 匹配经验水平
      if (userAnswers.experienceLevel || userAnswers.extremeExperience) {
        const userExp = userAnswers.experienceLevel || userAnswers.extremeExperience;
        const personaExp = characteristics.experience_level || characteristics.experienceLevel;
        if (this.matchExperienceLevel(userExp, personaExp)) {
          score += 0.3;
          reasons.push(`经验水平匹配: ${personaExp}`);
        }
        factors += 0.3;
      }

      // 匹配风险承受度
      if (userAnswers.riskTolerance) {
        const userRisk = userAnswers.riskTolerance;
        const personaRisk = characteristics.risk_tolerance || characteristics.riskTolerance;
        if (this.matchRiskTolerance(userRisk, personaRisk)) {
          score += 0.25;
          reasons.push(`风险承受度匹配: ${personaRisk}`);
        }
        factors += 0.25;
      }

      // 匹配体力水平
      if (userAnswers.physicalFitness || userAnswers.physicalCondition) {
        const userFitness = userAnswers.physicalFitness || userAnswers.physicalCondition;
        const personaFitness = characteristics.physical_fitness || characteristics.physicalFitness;
        if (this.matchPhysicalFitness(userFitness, personaFitness)) {
          score += 0.2;
          reasons.push(`体力水平匹配: ${personaFitness}`);
        }
        factors += 0.2;
      }

      // 匹配预算
      if (userAnswers.totalBudget || userAnswers.budgetReality) {
        const userBudget = userAnswers.totalBudget || userAnswers.budgetReality;
        const personaBudget = characteristics.budget_eur || characteristics.budget_usd || characteristics.budget_dkk;
        if (this.matchBudget(userBudget, personaBudget)) {
          score += 0.15;
          reasons.push(`预算匹配`);
        }
        factors += 0.15;
      }

      // 匹配活动偏好（改进版：支持更灵活的匹配）
      if (userAnswers.activityTypes || userAnswers.activityPreferences) {
        const userActivities = Array.isArray(userAnswers.activityTypes) 
          ? userAnswers.activityTypes 
          : [userAnswers.activityTypes].filter(Boolean);
        const personaRoutes = persona.recommended_routes || [];
        
        const matchingRoutes = personaRoutes.filter((route: any) => {
          const routeText = `${route.route || ''} ${route.reason || ''}`.toLowerCase();
          
          return userActivities.some((act: string) => {
            const actLower = act.toLowerCase();
            
            // 🆕 支持 city_walking 匹配
            if (actLower === 'city_walking' || actLower.includes('city') || actLower.includes('walking')) {
              return routeText.includes('城市') || 
                     routeText.includes('漫步') || 
                     routeText.includes('温和') || 
                     routeText.includes('city') ||
                     routeText.includes('朗伊尔城');
            }
            
            // 🆕 支持 glacier_wildlife 匹配
            if (actLower.includes('glacier') || actLower.includes('冰川')) {
              return routeText.includes('冰川') || routeText.includes('glacier');
            }
            
            if (actLower.includes('wildlife') || actLower.includes('野生动物')) {
              return routeText.includes('野生动物') || 
                     routeText.includes('wildlife') || 
                     routeText.includes('北极熊');
            }
            
            // 🆕 支持 boat_tour 匹配
            if (actLower.includes('boat') || actLower.includes('船')) {
              return routeText.includes('船') || 
                     routeText.includes('boat') || 
                     routeText.includes('游船');
            }
            
            // 🆕 支持 multi_day_camping 匹配
            if (actLower.includes('camping') || actLower.includes('露营')) {
              return routeText.includes('露营') || 
                     routeText.includes('camping') || 
                     routeText.includes('野外');
            }
            
            // 默认匹配逻辑
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

    // 找到得分最高的画像
    personaScores.sort((a, b) => b.score - a.score);
    const bestMatch = personaScores[0];

    // 🆕 添加详细调试日志
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
      this.logger.debug(`未找到匹配的画像，最高得分: ${bestMatch?.score || 0}`);
      // 🆕 如果得分接近阈值，提供更多信息
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

  /**
   * 应用安全第一原则
   * 
   * 检查用户画像与路线/活动是否匹配，如果不匹配则劝阻
   */
  async applySafetyFirstPrinciple(
    destinationCode: string,
    personaId: string,
    activityTypes: string | string[],
    _userAnswers: Record<string, any>
  ): Promise<{
    shouldWarn: boolean;
    warningMessage?: string;
    shouldBlock: boolean;
    blockReason?: string;
    alternatives?: Array<{ label: string; description: string; action?: string }>;
  }> {
    const config = await this.configService.getConfig(destinationCode);
    if (!config || !config.userPersonas?.user_personas) {
      return { shouldWarn: false, shouldBlock: false };
    }

    const aiDecisionLogic = config.userPersonas.ai_decision_logic;
    if (!aiDecisionLogic) {
      return { shouldWarn: false, shouldBlock: false };
    }

    // 查找用户画像
    const persona = config.userPersonas.user_personas.find(
      (p: any) => p.persona_id === personaId
    );

    if (!persona) {
      return { shouldWarn: false, shouldBlock: false };
    }

    const activities = Array.isArray(activityTypes) ? activityTypes : [activityTypes];
    const notRecommended = persona.not_recommended || [];

    // 检查是否有不推荐的活动
    const hasNotRecommendedActivity = activities.some((act: string) => {
      return notRecommended.some((nr: string) => {
        const actLower = act.toLowerCase();
        const nrLower = nr.toLowerCase();
        return nrLower.includes(actLower) || actLower.includes(nrLower);
      });
    });

    if (hasNotRecommendedActivity) {
      const safetyFirstPrinciple = aiDecisionLogic.safety_first_principle || 
        '当用户画像与路线不匹配时，AI必须明确劝阻，即使用户坚持';

      // 检查是否是 Critical 不匹配（需要阻止）
      const criticalGates = persona.critical_gate || [];
      const isCriticalMismatch = criticalGates.some((gate: string) => {
        const gateLower = gate.toLowerCase();
        return activities.some((act: string) => gateLower.includes(act.toLowerCase()));
      });

      if (isCriticalMismatch) {
        return {
          shouldWarn: true,
          warningMessage: `⚠️ ${safetyFirstPrinciple}\n\n根据您的画像（${persona.persona_name}），您选择的活动可能不适合。为了您的安全，我们强烈建议您重新考虑。`,
          shouldBlock: true,
          blockReason: `画像与活动不匹配: ${persona.persona_name} vs ${activities.join(', ')}`,
          alternatives: this.generateAlternatives(persona, config),
        };
      } else {
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

  /**
   * 获取推荐路线
   * 
   * 基于用户画像返回推荐路线
   */
  async getRecommendedRoutes(
    destinationCode: string,
    personaId: string,
    userAnswers: Record<string, any>
  ): Promise<Array<{
    route: string;
    reason: string;
    difficultyMatch: string;
    season?: string;
    prerequisites?: string[];
  }>> {
    const config = await this.configService.getConfig(destinationCode);
    if (!config || !config.userPersonas?.user_personas) {
      return [];
    }

    const persona = config.userPersonas.user_personas.find(
      (p: any) => p.persona_id === personaId
    );

    if (!persona || !persona.recommended_routes) {
      return [];
    }

    // 根据用户答案过滤推荐路线
    const routes = persona.recommended_routes || [];
    const filteredRoutes = routes.filter((route: any) => {
      // 检查季节匹配
      if (route.season && userAnswers.travelSeason) {
        const routeSeason = route.season.toLowerCase();
        const userSeason = userAnswers.travelSeason.toLowerCase();
        if (!this.matchSeason(routeSeason, userSeason)) {
          return false;
        }
      }

      // 检查前置条件
      if (route.prerequisites && Array.isArray(route.prerequisites)) {
        const hasAllPrerequisites = route.prerequisites.every((prereq: string) => {
          // 检查用户是否满足前置条件
          return this.checkPrerequisite(prereq, userAnswers);
        });
        if (!hasAllPrerequisites) {
          return false;
        }
      }

      return true;
    });

    return filteredRoutes.map((route: any) => ({
      route: route.route,
      reason: route.reason,
      difficultyMatch: route.difficulty_match || '良好',
      season: route.season,
      prerequisites: route.prerequisites,
    }));
  }

  /**
   * 应用决策矩阵（支持所有目的地）
   * 
   * 评估用户是否应该前往该目的地
   * - 斯瓦尔巴：极地环境，最严格的安全标准
   * - 格陵兰：极地环境，但相对温和
   * - 阿尔卑斯：山地环境，需要技能和经验
   */
  async applyDecisionMatrix(
    destinationCode: string,
    userAnswers: Record<string, any>
  ): Promise<{
    decision: 'GO_FULLY_SUPPORTED' | 'GO_WITH_STRONG_CAUTION' | 'GO_ALTERNATIVE_PLAN' | 'STRONGLY_RECONSIDER' | 'NOT_RECOMMENDED';
    reason: string;
    recommendations: string[];
  }> {
    const config = await this.configService.getConfig(destinationCode);
    if (!config || !config.userPersonas) {
      return {
        decision: 'GO_FULLY_SUPPORTED',
        reason: '无特化配置，使用通用流程',
        recommendations: [],
      };
    }

    // 检查红色警告标志
    const redFlags = config.userPersonas.red_flags || {};
    const hasMedicalRedFlag = this.checkRedFlags(userAnswers, redFlags.medical || []);
    const hasPsychologicalRedFlag = this.checkRedFlags(userAnswers, redFlags.psychological || []);
    const hasPracticalRedFlag = this.checkRedFlags(userAnswers, redFlags.practical || []);
    const hasSafetyRedFlag = this.checkRedFlags(userAnswers, redFlags.safety || []);

    // 根据目的地类型应用不同的决策逻辑
    const destinationType = this.getDestinationType(destinationCode);
    
    // 应用决策矩阵
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

    // 检查是否通过所有安全门槛
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

    // 目的地特定的额外检查
    if (destinationType === 'AL') {
      // 阿尔卑斯：检查技能和经验匹配度
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

  /**
   * 获取目的地类型
   */
  private getDestinationType(destinationCode: string): 'SJ' | 'GL' | 'AL' | 'OTHER' {
    if (destinationCode === 'SJ') return 'SJ';
    if (destinationCode === 'GL') return 'GL';
    if (destinationCode === 'AL') return 'AL';
    return 'OTHER';
  }

  /**
   * 检查阿尔卑斯技能不匹配
   */
  private checkAlpsSkillMismatch(userAnswers: Record<string, any>): {
    reason: string;
    recommendations: string[];
  } | null {
    const experienceLevel = userAnswers.experienceLevel || userAnswers.extremeExperience || '';
    const activityTypes = userAnswers.activityTypes || [];
    const hasGuide = userAnswers.hasGuide === 'required' || userAnswers.hasGuide === true;

    // 检查是否选择了技术路线但无经验
    const hasTechnicalActivity = activityTypes.some((act: string) => {
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

  // ==================== 辅助方法 ====================

  private matchExperienceLevel(userExp: string, personaExp: string): boolean {
    if (!userExp || !personaExp) return false;
    
    const userLower = userExp.toLowerCase();
    const personaLower = personaExp.toLowerCase();

    // 🆕 首次访问者匹配（支持斯瓦尔巴的值格式）
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

    // 🆕 中等经验匹配（支持 yes_some）
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

    // 🆕 有经验匹配（支持 yes_extensive）
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

  private matchRiskTolerance(userRisk: string, personaRisk: string): boolean {
    if (!userRisk || !personaRisk) return false;
    
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

  private matchPhysicalFitness(userFitness: string, personaFitness: string): boolean {
    if (!userFitness || !personaFitness) return false;
    
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

  private matchBudget(userBudget: any, personaBudget: string): boolean {
    if (!userBudget || !personaBudget) return false;

    // 简化处理：如果预算在范围内，认为匹配
    // 实际应该解析预算范围字符串
    return true; // TODO: 实现更精确的预算匹配
  }

  private matchSeason(routeSeason: string, userSeason: string): boolean {
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

    return true; // 默认匹配
  }

  private checkPrerequisite(prereq: string, userAnswers: Record<string, any>): boolean {
    const prereqLower = prereq.toLowerCase();
    
    // 检查经验
    if (prereqLower.includes('经验') || prereqLower.includes('experience')) {
      const userExp = userAnswers.experienceLevel || userAnswers.extremeExperience;
      return userExp && (userExp.includes('extensive') || userExp.includes('多次'));
    }

    // 检查向导
    if (prereqLower.includes('向导') || prereqLower.includes('guide')) {
      return userAnswers.hasGuide === 'required' || userAnswers.hasGuide === true;
    }

    // 检查预算
    if (prereqLower.includes('预算') || prereqLower.includes('budget')) {
      return userAnswers.budgetReality && userAnswers.budgetReality !== 'under_1500';
    }

    return true; // 默认满足
  }

  private checkRedFlags(userAnswers: Record<string, any>, redFlagList: string[]): boolean {
    // 简化处理：检查用户答案中是否包含红色警告关键词
    const answerStr = JSON.stringify(userAnswers).toLowerCase();
    return redFlagList.some(flag => answerStr.includes(flag.toLowerCase()));
  }

  private checkAllCriticalFields(userAnswers: Record<string, any>, config: DestinationClarificationConfig): boolean {
    // 检查所有 Critical 字段是否都已回答
    for (const round of config.clarificationRounds) {
      for (const question of round.questions) {
        if (question.metadata?.isCritical && question.metadata?.fieldName) {
          const fieldName = question.metadata.fieldName;
          if (!userAnswers[fieldName]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private generateAlternatives(persona: any, _config: DestinationClarificationConfig): Array<{ label: string; description: string; action?: string }> {
    const alternatives: Array<{ label: string; description: string; action?: string }> = [];

    // 推荐该画像的推荐路线
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
}
