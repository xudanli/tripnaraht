// src/content-strategy/services/localization.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  LocalizationContext,
  ChineseRegion,
  CityTier,
  UserGroup,
  ChineseLocalizationRules,
  CityAdaptationRules,
  UserGroupAdaptationRules,
  LocalizedContent,
} from '../interfaces/localization.interface';

/**
 * 本地化内容策略服务
 * 
 * 实现P2要求的：
 * - 中文本土化规范
 * - 不同城市用户的沟通适配
 */
@Injectable()
export class LocalizationService {
  private readonly logger = new Logger(LocalizationService.name);

  /**
   * 中文本土化规则
   */
  private readonly chineseLocalizationRules: ChineseLocalizationRules = {
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

  /**
   * 城市用户适配规则
   */
  private readonly cityAdaptationRules: CityAdaptationRules = {
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

  /**
   * 用户群体适配规则
   */
  private readonly userGroupAdaptationRules: UserGroupAdaptationRules = {
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

  /**
   * 本地化文本
   */
  async localizeContent(
    text: string,
    context: LocalizationContext,
  ): Promise<LocalizedContent> {
    this.logger.log(`Localizing content for language: ${context.language}, region: ${context.chineseRegion}`);

    let localizedText = text;
    const appliedRules: string[] = [];
    const adaptationNotes: string[] = [];

    // 1. 中文本土化
    if (context.language.startsWith('zh')) {
      localizedText = this.localizeForChinese(localizedText, context.chineseRegion);
      appliedRules.push('中文本土化');
      adaptationNotes.push('应用中文本土化规范');
    }

    // 2. 城市用户适配
    if (context.cityTier) {
      localizedText = this.adaptForCityUser(localizedText, context.cityTier, context.cityName);
      appliedRules.push(`城市层级适配（${context.cityTier}）`);
      adaptationNotes.push(`适配${this.getCityTierName(context.cityTier)}用户`);
    }

    // 3. 用户群体适配
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

  /**
   * 中文本土化
   */
  localizeForChinese(text: string, region?: ChineseRegion): string {
    let localized = text;

    // 1. 避免过度网络用语
    if (this.chineseLocalizationRules.avoidInternetSlang) {
      localized = this.removeInternetSlang(localized);
    }

    // 2. 避免强制娱乐化表达
    if (this.chineseLocalizationRules.avoidForcedEntertainment) {
      localized = this.removeForcedEntertainment(localized);
    }

    // 3. 避免生硬翻译
    if (this.chineseLocalizationRules.avoidLiteralTranslation) {
      localized = this.fixLiteralTranslation(localized);
    }

    // 4. 使用自然日常中文
    if (this.chineseLocalizationRules.useNaturalDailyChinese) {
      localized = this.useNaturalChinese(localized);
    }

    // 5. 地区特定适配
    if (region && this.chineseLocalizationRules.regionSpecificRules?.[region]) {
      localized = this.applyRegionSpecificRules(localized, region);
    }

    return localized;
  }

  /**
   * 不同城市用户的沟通适配
   */
  adaptForCityUser(text: string, cityTier: CityTier, cityName?: string): string {
    const rules = this.cityAdaptationRules[cityTier.toLowerCase() as keyof CityAdaptationRules];
    if (!rules) {
      return text;
    }

    let adapted = text;

    // 根据城市层级特征调整
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

  /**
   * 用户群体适配
   */
  adaptForUserGroup(text: string, userGroup: UserGroup): string {
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

  // ========== 中文本土化辅助方法 ==========

  /**
   * 移除网络用语
   */
  private removeInternetSlang(text: string): string {
    // 常见的网络用语替换
    const slangMap: Record<string, string> = {
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

  /**
   * 移除强制娱乐化表达
   */
  private removeForcedEntertainment(text: string): string {
    // 移除过度的表情符号和语气词
    let cleaned = text;

    // 移除过多的感叹号（保留1-2个）
    cleaned = cleaned.replace(/!{3,}/g, '!!');

    // 移除过多的问号
    cleaned = cleaned.replace(/\?{3,}/g, '??');

    // 移除过度的语气词（如"哦哦"、"哈哈"等）
    cleaned = cleaned.replace(/哦{2,}/g, '哦');
    cleaned = cleaned.replace(/哈{3,}/g, '哈哈');

    return cleaned;
  }

  /**
   * 修复生硬翻译
   */
  private fixLiteralTranslation(text: string): string {
    // 常见的生硬翻译替换
    const translationMap: Record<string, string> = {
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

  /**
   * 使用自然中文
   */
  private useNaturalChinese(text: string): string {
    // 将正式用语转换为更自然的表达
    const naturalMap: Record<string, string> = {
      '您': '你', // 在某些场景下更自然
      '敬请': '请',
      '敬请期待': '敬请期待', // 保留
      '敬请关注': '请关注',
    };

    let natural = text;
    // 注意：这里只是示例，实际应该根据上下文判断是否替换"您"
    // 在正式场合应该保留"您"

    return natural;
  }

  /**
   * 应用地区特定规则
   */
  private applyRegionSpecificRules(text: string, region: ChineseRegion): string {
    let adapted = text;

    switch (region) {
      case 'MAINLAND':
        // 大陆：使用简体中文，更口语化
        adapted = adapted.replace(/您/g, '你'); // 在某些场景下
        break;
      case 'TAIWAN':
        // 台湾：使用繁体中文，注意用词
        // 简化实现：保持原样（实际应该转换繁体）
        break;
      case 'HONGKONG':
        // 香港：使用繁体中文，注意粤语影响
        // 简化实现：保持原样
        break;
      case 'SINGAPORE':
        // 新加坡：简体中文，注意中英混合
        adapted = adapted.replace(/您/g, '你');
        break;
    }

    return adapted;
  }

  // ========== 城市用户适配辅助方法 ==========

  /**
   * 适配一线城市用户
   */
  private adaptForTier1City(
    text: string,
    rules: CityAdaptationRules['tier1'],
  ): string {
    let adapted = text;

    // 简化实现：添加效率相关的表达
    if (!adapted.includes('效率') && !adapted.includes('快速')) {
      // 不强制添加，保持原样
    }

    // 可以使用专业术语，但需要确保清晰
    return adapted;
  }

  /**
   * 适配二线城市用户
   */
  private adaptForTier2City(
    text: string,
    rules: CityAdaptationRules['tier2'],
  ): string {
    let adapted = text;

    // 解释专业术语
    adapted = this.explainTechnicalTerms(adapted);

    // 强调性价比
    if (adapted.includes('价格') || adapted.includes('成本')) {
      adapted = adapted.replace(/价格/g, '性价比');
    }

    return adapted;
  }

  /**
   * 适配三线城市用户
   */
  private adaptForTier3City(
    text: string,
    rules: CityAdaptationRules['tier3'],
  ): string {
    let adapted = text;

    // 使用更通俗的表达
    adapted = this.useColloquialExpressions(adapted);

    // 详细解释概念
    adapted = this.addDetailedExplanations(adapted);

    return adapted;
  }

  /**
   * 适配海外华人用户
   */
  private adaptForOverseasChinese(
    text: string,
    rules: CityAdaptationRules['overseas'],
  ): string {
    let adapted = text;

    // 避免地域特定用语
    adapted = this.removeRegionalSpecificTerms(adapted);

    // 使用通用表达
    adapted = this.useUniversalExpressions(adapted);

    return adapted;
  }

  // ========== 用户群体适配辅助方法 ==========

  /**
   * 适配学生用户
   */
  private adaptForStudent(text: string): string {
    const rules = this.userGroupAdaptationRules.student;
    let adapted = text;

    // 如果文本涉及成本，添加学生优惠提示
    if (text.includes('价格') || text.includes('成本') || text.includes('费用')) {
      adapted = `${rules.acknowledgeConstraints}\n\n${rules.optimizeForStudent}\n- ${rules.lowCostRoutes}\n- ${rules.timeMatching}\n- ${rules.specialSupport}\n\n${adapted}`;
    }

    return adapted;
  }

  /**
   * 适配工作者用户
   */
  private adaptForWorker(text: string): string {
    const rules = this.userGroupAdaptationRules.worker;
    let adapted = text;

    // 如果文本涉及时间，添加时间规划提示
    if (text.includes('时间') || text.includes('日程') || text.includes('安排')) {
      adapted = `${rules.acknowledgeValue}\n\n我们特别关注：\n- ${rules.timePlanning}\n- ${rules.rhythmArrangement}\n- ${rules.expectationManagement}\n\n${adapted}`;
    }

    return adapted;
  }

  /**
   * 适配退休用户
   */
  private adaptForRetiree(text: string): string {
    let adapted = text;

    // 使用更温和、尊重的语气
    adapted = adapted.replace(/你/g, '您');
    adapted = adapted.replace(/年轻人/g, '您');

    return adapted;
  }

  /**
   * 适配自由职业者用户
   */
  private adaptForFreelancer(text: string): string {
    let adapted = text;

    // 强调灵活性
    if (text.includes('时间') || text.includes('日程')) {
      adapted = `我们理解您的时间安排比较灵活。${adapted}`;
    }

    return adapted;
  }

  // ========== 通用辅助方法 ==========

  /**
   * 解释专业术语
   */
  private explainTechnicalTerms(text: string): string {
    // 简化实现：保持原样
    // 实际应该识别专业术语并添加解释
    return text;
  }

  /**
   * 使用通俗表达
   */
  private useColloquialExpressions(text: string): string {
    // 将正式用语转换为通俗表达
    const colloquialMap: Record<string, string> = {
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

  /**
   * 添加详细解释
   */
  private addDetailedExplanations(text: string): string {
    // 简化实现：保持原样
    // 实际应该识别需要解释的概念并添加说明
    return text;
  }

  /**
   * 移除地域特定用语
   */
  private removeRegionalSpecificTerms(text: string): string {
    // 移除地域特定的表达
    const regionalTerms = ['北上广', '一线城市', '二线城市'];
    let cleaned = text;

    for (const term of regionalTerms) {
      cleaned = cleaned.replace(new RegExp(term, 'g'), '这些城市');
    }

    return cleaned;
  }

  /**
   * 使用通用表达
   */
  private useUniversalExpressions(text: string): string {
    // 使用更通用的表达
    return text;
  }

  /**
   * 获取城市层级名称
   */
  private getCityTierName(tier: CityTier): string {
    const nameMap: Record<CityTier, string> = {
      TIER1: '一线城市',
      TIER2: '二线城市',
      TIER3: '三线城市',
      TIER4: '四线城市',
      OVERSEAS: '海外',
    };
    return nameMap[tier] || tier;
  }

  /**
   * 获取用户群体名称
   */
  private getUserGroupName(group: UserGroup): string {
    const nameMap: Record<UserGroup, string> = {
      STUDENT: '学生',
      WORKER: '工作者',
      RETIREE: '退休',
      FREELANCER: '自由职业者',
      OTHER: '其他',
    };
    return nameMap[group] || group;
  }
}
