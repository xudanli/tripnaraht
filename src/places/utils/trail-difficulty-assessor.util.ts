// src/places/utils/trail-difficulty-assessor.util.ts

import {
  TrailDifficultyMetadata,
  DIFFICULTY_LEVEL,
  DifficultyLevel,
  RiskFactor,
  DIFFICULTY_SEMANTICS,
  SeasonalModifier,
  ExperienceModifier,
} from '../interfaces/trail-difficulty.interface';

/**
 * 徒步难度评估器
 * 
 * Track A: Trail Difficulty（是否"难"）
 * 
 * 核心定义：
 * 「在当前条件下，一个目标人群是否可能遭遇超出预期的风险或技术门槛」
 * 
 * Difficulty = 风险 × 技术 × 不可逆性
 * 
 * ⚠️ 设计原则：
 * 1. "可能危险"优先提醒 - 宁可保守，不可乐观（偏向 false positive）
 * 2. 同一路线对不同人难度不同 - 支持 Persona 修正
 * 3. Difficulty 会随季节变化 - 支持季节 Overlay
 * 4. "把难说得简单"是最危险的错误 - 高风险信号必须触发提升
 * 5. 可解释性 - 每个难度等级都有明确的解释因子
 * 
 * ❌ 禁止进入 Difficulty 的信号：
 * - 距离 / 时长
 * - 累计爬升
 * - 体力消耗
 */
export class TrailDifficultyAssessor {
  /**
   * 从 metadata 中评估难度
   * 
   * 优先级（风险门禁模型）：
   * 1. 高风险信号触发（任一高风险 + 无明显缓冲 → EXTREME）
   * 2. 官方/专业平台评级（AllTrails, Komoot）
   * 3. 技术等级（technicalGrade）
   * 4. 风险因素（riskFactors）
   * 5. 子类别推断（subCategory）
   */
  static assess(
    metadata: any,
    options?: {
      season?: 'winter' | 'spring' | 'summer' | 'autumn';
      userExperience?: ExperienceModifier['experience'];
    }
  ): TrailDifficultyMetadata | null {
    // 步骤1：基础评估（只允许：技术动作、地形不可逆、季节风险）
    const base = this.assessBase(metadata);
    if (!base) {
      return null;
    }

    // 步骤2：应用季节修正（如果提供）
    if (options?.season) {
      base.seasonalModifier = this.getSeasonalModifier(base, options.season);
      if (base.seasonalModifier) {
        base.level = this.applyModifier(base.level, base.seasonalModifier.modifier);
      }
    }

    // 步骤3：应用用户经验修正（如果提供）
    if (options?.userExperience) {
      const experienceMod = this.getExperienceModifier(options.userExperience);
      if (experienceMod.modifier !== 0) {
        base.level = this.applyModifier(base.level, experienceMod.modifier);
        base.explanations = base.explanations || [];
        base.explanations.push(experienceMod.reason);
      }
    }

    // 步骤4：生成解释因子
    base.explanations = this.generateExplanations(base);

    return base;
  }

  /**
   * 基础评估（风险门禁模型）
   * 
   * 核心原则：任一高风险信号 + 无明显缓冲 → 提升难度
   */
  private static assessBase(metadata: any): TrailDifficultyMetadata | null {
    // 优先级1：高风险信号触发（最严格）
    const highRiskLevel = this.checkHighRiskTriggers(metadata);
    if (highRiskLevel) {
      return highRiskLevel;
    }

    // 优先级2：官方/专业平台评级
    if (metadata.trailDifficulty) {
      return this.fromOfficialRating(metadata.trailDifficulty, metadata);
    }

    // 优先级3：技术等级
    if (metadata.technicalGrade) {
      return this.fromTechnicalGrade(metadata.technicalGrade, metadata);
    }

    // 优先级4：风险因素
    if (metadata.riskFactors && Array.isArray(metadata.riskFactors) && metadata.riskFactors.length > 0) {
      return this.fromRiskFactors(metadata.riskFactors, metadata);
    }

    // 优先级5：子类别推断（置信度最低）
    if (metadata.subCategory) {
      return this.fromSubCategory(metadata.subCategory, metadata);
    }

    return null;
  }

  /**
   * 高风险信号触发检查（风险门禁模型）
   * 
   * 原则：任一高风险 + 不确定性高 → 提升 1 星
   */
  private static checkHighRiskTriggers(metadata: any): TrailDifficultyMetadata | null {
    const riskFactors: RiskFactor[] = [];
    let hasHighRisk = false;

    // 检查技术动作风险
    if (metadata.requiresRope || metadata.rope) {
      riskFactors.push('rope');
      hasHighRisk = true;
    }
    if (metadata.exposure || metadata.exposed) {
      riskFactors.push('exposure');
      hasHighRisk = true;
    }
    if (metadata.scramble || metadata.technical) {
      riskFactors.push('scramble');
      hasHighRisk = true;
    }

    // 检查地形不可逆风险
    if (metadata.cliff || metadata.steep) {
      riskFactors.push('cliff');
      hasHighRisk = true;
    }
    if (metadata.ice || metadata.icy) {
      riskFactors.push('ice');
      hasHighRisk = true;
    }
    if (metadata.looseRock || metadata.unstable) {
      riskFactors.push('loose_rock');
      hasHighRisk = true;
    }

    // 检查季节风险
    if (metadata.winterIce || metadata.snow) {
      riskFactors.push('winter_ice');
      hasHighRisk = true;
    }
    if (metadata.rainLoose || metadata.meltWater) {
      riskFactors.push('rain_loose');
      hasHighRisk = true;
    }

    // 如果存在高风险信号，且不确定性高（没有明确的官方评级），触发提升
    if (hasHighRisk && !metadata.trailDifficulty && riskFactors.length >= 2) {
      return {
        level: DIFFICULTY_LEVEL.EXTREME,  // 保守：直接提升到最高
        riskFactors,
        requiresEquipment: true,
        requiresGuide: riskFactors.includes('rope') || riskFactors.includes('ice'),
        source: 'manual',
        confidence: 0.8,
        explanations: [
          `检测到 ${riskFactors.length} 个高风险信号：${riskFactors.join('、')}`,
          '存在技术门槛或不可逆地形风险',
        ],
      };
    }

    return null;
  }

  /**
   * 从官方/专业平台评级推断
   */
  private static fromOfficialRating(
    rating: string,
    metadata: any
  ): TrailDifficultyMetadata {
    const upper = rating.toUpperCase();
    
    let level: DifficultyLevel;
    if (upper.includes('EASY') || upper === 'EASY' || upper === '1' || upper === '⭐') {
      level = DIFFICULTY_LEVEL.EASY;
    } else if (upper.includes('MODERATE') || upper === 'MODERATE' || upper === '2' || upper === '⭐⭐') {
      level = DIFFICULTY_LEVEL.MODERATE;
    } else if (upper.includes('HARD') || upper === 'HARD' || upper === '3' || upper === '⭐⭐⭐') {
      level = DIFFICULTY_LEVEL.HARD;
    } else if (upper.includes('EXTREME') || upper === 'EXTREME' || upper === '4' || upper === '5' || upper === '⭐⭐⭐⭐' || upper === '⭐⭐⭐⭐⭐') {
      level = DIFFICULTY_LEVEL.EXTREME;
    } else {
      level = DIFFICULTY_LEVEL.MODERATE; // 默认：中等（保守）
    }
    
    return {
      level,
      source: metadata.source || 'official',
      confidence: 0.9, // 官方评级置信度高
      requiresEquipment: metadata.requiresEquipment,
      requiresGuide: metadata.requiresGuide,
      riskFactors: this.extractRiskFactors(metadata),
      explanations: [
        `官方/专业平台评级：${DIFFICULTY_SEMANTICS[level].stars}`,
        DIFFICULTY_SEMANTICS[level].meaning,
      ],
    };
  }

  /**
   * 从技术等级推断
   */
  private static fromTechnicalGrade(
    grade: number,
    metadata: any
  ): TrailDifficultyMetadata {
    let level: DifficultyLevel;
    if (grade <= 1) {
      level = DIFFICULTY_LEVEL.EASY;
    } else if (grade <= 2) {
      level = DIFFICULTY_LEVEL.MODERATE;
    } else if (grade <= 3) {
      level = DIFFICULTY_LEVEL.HARD;
    } else {
      level = DIFFICULTY_LEVEL.EXTREME;
    }
    
    return {
      level,
      technicalGrade: grade,
      source: metadata.source || 'technical',
      confidence: 0.8,
      requiresEquipment: grade >= 3,
      requiresGuide: grade >= 4,
      riskFactors: this.extractRiskFactors(metadata),
      explanations: [
        `技术等级：${grade}/5`,
        grade >= 4 ? '需要专业装备和向导' : grade >= 3 ? '需要专业装备' : '基础装备即可',
      ],
    };
  }

  /**
   * 从风险因素推断
   */
  private static fromRiskFactors(
    riskFactors: string[],
    metadata: any
  ): TrailDifficultyMetadata {
    const factors = riskFactors.map(f => f.toLowerCase()) as RiskFactor[];
    
    // 高风险因素
    const highRisk: RiskFactor[] = ['exposure', 'rope', 'ice', 'cliff', 'scramble'];
    const hasHighRisk = factors.some(f => highRisk.includes(f));
    
    // 中等风险因素
    const mediumRisk: RiskFactor[] = ['loose_rock', 'unstable', 'technical'];
    const hasMediumRisk = factors.some(f => mediumRisk.includes(f));
    
    let level: DifficultyLevel;
    if (hasHighRisk || factors.length >= 3) {
      level = DIFFICULTY_LEVEL.EXTREME;  // 保守：高风险直接提升到最高
    } else if (hasMediumRisk || factors.length >= 2) {
      level = DIFFICULTY_LEVEL.HARD;
    } else {
      level = DIFFICULTY_LEVEL.MODERATE;
    }
    
    return {
      level,
      riskFactors: factors,
      source: metadata.source || 'risk_assessment',
      confidence: 0.7,
      requiresEquipment: hasHighRisk,
      requiresGuide: factors.includes('rope') || factors.includes('ice'),
      explanations: [
        `风险因素：${factors.join('、')}`,
        hasHighRisk ? '存在高风险路段，需要专业装备' : '存在中等风险，需要经验判断',
      ],
    };
  }

  /**
   * 从子类别推断（优先级最低）
   */
  private static fromSubCategory(
    subCategory: string,
    metadata: any
  ): TrailDifficultyMetadata {
    const lower = subCategory.toLowerCase();
    
    // 高难度类别
    if (lower.includes('volcano') || lower.includes('glacier') || lower.includes('climbing')) {
      return {
        level: DIFFICULTY_LEVEL.EXTREME,  // 保守：高难度类别直接提升
        source: 'manual',
        confidence: 0.5, // 置信度较低
        requiresEquipment: true,
        requiresGuide: lower.includes('glacier'),
        riskFactors: ['exposure', 'technical'],
        explanations: [
          `子类别：${subCategory}`,
          '火山/冰川/攀爬类活动通常需要专业装备和向导',
        ],
      };
    }
    
    // 中等难度类别
    if (lower.includes('canyon') || lower.includes('waterfall') || lower.includes('cave')) {
      return {
        level: DIFFICULTY_LEVEL.HARD,
        source: 'manual',
        confidence: 0.4,
        explanations: [
          `子类别：${subCategory}`,
          '峡谷/瀑布/洞穴类活动需要经验判断',
        ],
      };
    }
    
    // 默认：简单（但置信度很低）
    return {
      level: DIFFICULTY_LEVEL.EASY,
      source: 'manual',
      confidence: 0.3,
      explanations: [
        `子类别：${subCategory}`,
        '基于子类别的推断，置信度较低',
      ],
    };
  }

  /**
   * 提取风险因素
   */
  private static extractRiskFactors(metadata: any): RiskFactor[] {
    const factors: RiskFactor[] = [];
    
    if (metadata.rope || metadata.requiresRope) factors.push('rope');
    if (metadata.exposure || metadata.exposed) factors.push('exposure');
    if (metadata.scramble || metadata.technical) factors.push('scramble');
    if (metadata.cliff || metadata.steep) factors.push('cliff');
    if (metadata.ice || metadata.icy) factors.push('ice');
    if (metadata.looseRock || metadata.unstable) factors.push('loose_rock');
    if (metadata.winterIce || metadata.snow) factors.push('winter_ice');
    if (metadata.rainLoose || metadata.meltWater) factors.push('rain_loose');
    
    return factors;
  }

  /**
   * 获取季节修正
   */
  private static getSeasonalModifier(
    base: TrailDifficultyMetadata,
    season: 'winter' | 'spring' | 'summer' | 'autumn'
  ): SeasonalModifier | null {
    // 检查是否有季节相关风险因素
    const hasSeasonalRisk = base.riskFactors?.some(f => 
      f === 'winter_ice' || f === 'rain_loose' || f === 'snow' || f === 'melt_water'
    );

    if (!hasSeasonalRisk) {
      return null;
    }

    let modifier = 0;
    let reason = '';

    if (season === 'winter') {
      if (base.riskFactors?.includes('winter_ice') || base.riskFactors?.includes('snow')) {
        modifier = +1;  // 冬季结冰：+1 星
        reason = '冬季结冰，失足风险高';
      }
    } else if (season === 'spring') {
      if (base.riskFactors?.includes('rain_loose') || base.riskFactors?.includes('melt_water')) {
        modifier = +1;  // 雨季/融水：+1 星
        reason = '雨季碎石松动，融水增加风险';
      }
    }

    if (modifier === 0) {
      return null;
    }

    return {
      season,
      modifier,
      reason,
    };
  }

  /**
   * 获取用户经验修正
   */
  private static getExperienceModifier(
    experience: ExperienceModifier['experience']
  ): ExperienceModifier {
    const modifierMap: Record<ExperienceModifier['experience'], { modifier: number; reason: string }> = {
      beginner: {
        modifier: +1,
        reason: '新手用户：难度提升 1 星（更保守）',
      },
      intermediate: {
        modifier: 0,
        reason: '中级用户：难度不变',
      },
      advanced: {
        modifier: -0.5,
        reason: '高级用户：难度降低 0.5 星',
      },
      expert: {
        modifier: -1,
        reason: '专家用户：难度降低 1 星',
      },
    };

    const config = modifierMap[experience];
    return {
      experience,
      modifier: config.modifier,
      reason: config.reason,
    };
  }

  /**
   * 应用难度修正
   */
  private static applyModifier(
    level: DifficultyLevel,
    modifier: number
  ): DifficultyLevel {
    const levels: DifficultyLevel[] = [
      DIFFICULTY_LEVEL.EASY,
      DIFFICULTY_LEVEL.MODERATE,
      DIFFICULTY_LEVEL.HARD,
      DIFFICULTY_LEVEL.EXTREME,
    ];

    const currentIndex = levels.indexOf(level);
    const newIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + Math.round(modifier)));

    return levels[newIndex];
  }

  /**
   * 生成解释因子
   */
  private static generateExplanations(
    metadata: TrailDifficultyMetadata
  ): string[] {
    const explanations: string[] = [];

    // 基础解释
    const semantics = DIFFICULTY_SEMANTICS[metadata.level];
    explanations.push(`${semantics.stars} ${semantics.meaning}`);

    // 风险因素解释
    if (metadata.riskFactors && metadata.riskFactors.length > 0) {
      const riskNames: Record<RiskFactor, string> = {
        scramble: '攀爬路段',
        rope: '需要绳索',
        exposure: '暴露感强（悬崖路段）',
        technical: '技术路段',
        cliff: '陡崖',
        ice: '冰雪',
        loose_rock: '碎石',
        unstable: '不稳定地形',
        winter_ice: '冬季结冰',
        rain_loose: '雨季碎石松动',
        snow: '雪',
        melt_water: '融水',
      };

      const riskDescriptions = metadata.riskFactors
        .map(f => riskNames[f] || f)
        .join('、');
      explanations.push(`风险因素：${riskDescriptions}`);
    }

    // 装备要求
    if (metadata.requiresEquipment) {
      explanations.push('需要专业装备');
    }
    if (metadata.requiresGuide) {
      explanations.push('建议向导陪同');
    }

    // 季节修正解释
    if (metadata.seasonalModifier && metadata.seasonalModifier.modifier > 0) {
      explanations.push(`季节修正：${metadata.seasonalModifier.reason}`);
    }

    return explanations;
  }
}
