// src/content-strategy/services/content-strategy-qa.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  ContentType,
  CheckStatus,
  RationalityCheckResult,
  WarmthCheckResult,
  ExecutabilityCheckResult,
  EthicsCheckResult,
  ContentQualityCheckResult,
  ContentQualityCheckConfig,
  ContentContext,
} from '../interfaces/content-quality.interface';

/**
 * 内容策略质量保证服务
 * 
 * 实现文档要求的质量保证清单：
 * - 理性性检查：数据来源、推荐理由、多角度考虑、无矛盾
 * - 温度检查：理解同理、非命令式、尊重自主权、人性化细节
 * - 可执行性检查：可直接使用、无抽象表述、用户可理解、系统可执行
 * - 伦理检查：无销售隐瞒、无过度渲染风险、安全第一、用户决策权
 */
@Injectable()
export class ContentStrategyQAService {
  private readonly logger = new Logger(ContentStrategyQAService.name);

  private readonly defaultConfig: Required<ContentQualityCheckConfig> = {
    strictMode: false,
    minRationalityScore: 0.6,
    minWarmthScore: 0.5,
    minExecutabilityScore: 0.7,
    minEthicsScore: 0.8,
    requireAllChecks: false,
  };

  /**
   * 执行完整的内容质量检查
   */
  async checkContentQuality(
    context: ContentContext,
    config?: ContentQualityCheckConfig
  ): Promise<ContentQualityCheckResult> {
    const checkConfig = { ...this.defaultConfig, ...config };
    
    this.logger.debug(`Checking content quality for type: ${context.contentType}`);

    // 执行四个维度的检查
    const rationality = this.checkRationality(context, checkConfig);
    const warmth = this.checkWarmth(context, checkConfig);
    const executability = this.checkExecutability(context, checkConfig);
    const ethics = this.checkEthics(context, checkConfig);

    // 计算综合得分
    const overallScore = (
      rationality.score * 0.3 +
      warmth.score * 0.2 +
      executability.score * 0.3 +
      ethics.score * 0.2
    );

    // 确定综合状态
    const overallStatus = this.determineOverallStatus(
      rationality,
      warmth,
      executability,
      ethics,
      overallScore,
      checkConfig
    );

    // 收集关键问题和建议
    const criticalIssues = this.collectCriticalIssues(
      rationality,
      warmth,
      executability,
      ethics
    );

    const recommendations = this.generateRecommendations(
      rationality,
      warmth,
      executability,
      ethics,
      criticalIssues
    );

    const passed = overallStatus === 'PASS' && 
      rationality.status !== 'FAIL' &&
      warmth.status !== 'FAIL' &&
      executability.status !== 'FAIL' &&
      ethics.status !== 'FAIL';

    return {
      contentType: context.contentType,
      content: context.content,
      rationality,
      warmth,
      executability,
      ethics,
      overallScore,
      overallStatus,
      passed,
      criticalIssues,
      recommendations,
    };
  }

  /**
   * 理性性检查
   */
  checkRationality(
    context: ContentContext,
    config: Required<ContentQualityCheckConfig>
  ): RationalityCheckResult {
    const checks = {
      hasDataSources: this.checkDataSources(context),
      hasRecommendationReasons: this.checkRecommendationReasons(context),
      considersMultipleAngles: this.checkMultipleAngles(context),
      noContradictions: this.checkContradictions(context),
    };

    // 计算得分（每个检查25分）
    const score = (
      (checks.hasDataSources.passed ? 1 : 0) * 0.25 +
      (checks.hasRecommendationReasons.passed ? 1 : 0) * 0.25 +
      (checks.considersMultipleAngles.passed ? 1 : 0) * 0.25 +
      (checks.noContradictions.passed ? 1 : 0) * 0.25
    );

    const status = score >= config.minRationalityScore ? 'PASS' : 
                   score >= config.minRationalityScore * 0.7 ? 'WARNING' : 'FAIL';

    const overallMessage = this.generateRationalityMessage(checks, score);
    const suggestions = this.generateRationalitySuggestions(checks);

    return {
      status,
      score,
      checks,
      overallMessage,
      suggestions,
    };
  }

  /**
   * 检查数据来源
   */
  private checkDataSources(context: ContentContext): RationalityCheckResult['checks']['hasDataSources'] {
    const dataSources = context.metadata?.dataSources || [];
    const hasSources = dataSources.length > 0;

    // 检查内容中是否提到数据来源
    const mentionsSources = /(数据|来源|根据|基于|参考)/.test(context.content);

    return {
      passed: hasSources || mentionsSources,
      message: hasSources 
        ? `内容包含 ${dataSources.length} 个数据来源`
        : mentionsSources
        ? '内容中提到了数据来源'
        : '内容缺少明确的数据来源标注',
      dataSources: hasSources ? dataSources : undefined,
    };
  }

  /**
   * 检查推荐理由
   */
  private checkRecommendationReasons(context: ContentContext): RationalityCheckResult['checks']['hasRecommendationReasons'] {
    if (context.contentType !== 'RECOMMENDATION') {
      return {
        passed: true,
        message: '非推荐内容，无需检查推荐理由',
      };
    }

    const reasons = context.metadata?.recommendationReasons || [];
    const hasReasons = reasons.length > 0;

    // 检查内容中是否包含理由关键词
    const hasReasonKeywords = /(因为|由于|考虑到|基于|理由|原因|所以|因此)/.test(context.content);

    return {
      passed: hasReasons || hasReasonKeywords,
      message: hasReasons
        ? `内容包含 ${reasons.length} 个推荐理由`
        : hasReasonKeywords
        ? '内容中包含了推荐理由'
        : '推荐内容缺少明确的理由说明',
      reasons: hasReasons ? reasons : undefined,
    };
  }

  /**
   * 检查多角度考虑
   */
  private checkMultipleAngles(context: ContentContext): RationalityCheckResult['checks']['considersMultipleAngles'] {
    // 检查是否提到多个角度
    const angleKeywords = [
      '一方面', '另一方面', '同时', '此外', '另外',
      '从...角度', '从...来看', '综合考虑', '平衡',
      '优点', '缺点', '优势', '劣势', '风险', '机会'
    ];
    
    const foundAngles = angleKeywords.filter(keyword => 
      context.content.includes(keyword)
    );

    const hasMultipleAngles = foundAngles.length >= 2 || 
      (context.metadata?.relatedContent && context.metadata.relatedContent.length > 1);

    return {
      passed: hasMultipleAngles,
      message: hasMultipleAngles
        ? '内容考虑了多个角度'
        : '内容可能只考虑了单一角度',
      angles: foundAngles.length > 0 ? foundAngles : undefined,
    };
  }

  /**
   * 检查矛盾
   */
  private checkContradictions(context: ContentContext): RationalityCheckResult['checks']['noContradictions'] {
    // 检查常见的矛盾表述
    const contradictionPatterns = [
      /(虽然|尽管).*但是.*(不|没有)/,
      /(一方面).*(另一方面).*(相反|矛盾)/,
      /(推荐|建议).*(不推荐|不建议)/,
      /(安全|可靠).*(危险|风险)/,
    ];

    const contradictions: string[] = [];
    for (const pattern of contradictionPatterns) {
      if (pattern.test(context.content)) {
        contradictions.push(`检测到可能的矛盾表述: ${pattern.source}`);
      }
    }

    return {
      passed: contradictions.length === 0,
      message: contradictions.length === 0
        ? '未检测到矛盾表述'
        : `检测到 ${contradictions.length} 处可能的矛盾`,
      contradictions: contradictions.length > 0 ? contradictions : undefined,
    };
  }

  /**
   * 温度检查
   */
  checkWarmth(
    context: ContentContext,
    config: Required<ContentQualityCheckConfig>
  ): WarmthCheckResult {
    const checks = {
      hasUnderstanding: this.checkUnderstanding(context),
      noCommanding: this.checkNoCommanding(context),
      respectsAutonomy: this.checkAutonomyRespect(context),
      hasHumanDetails: this.checkHumanDetails(context),
    };

    const score = (
      (checks.hasUnderstanding.passed ? 1 : 0) * 0.25 +
      (checks.noCommanding.passed ? 1 : 0) * 0.25 +
      (checks.respectsAutonomy.passed ? 1 : 0) * 0.25 +
      (checks.hasHumanDetails.passed ? 1 : 0) * 0.25
    );

    const status = score >= config.minWarmthScore ? 'PASS' :
                   score >= config.minWarmthScore * 0.7 ? 'WARNING' : 'FAIL';

    const overallMessage = this.generateWarmthMessage(checks, score);
    const suggestions = this.generateWarmthSuggestions(checks);

    return {
      status,
      score,
      checks,
      overallMessage,
      suggestions,
    };
  }

  /**
   * 检查理解和同理
   */
  private checkUnderstanding(context: ContentContext): WarmthCheckResult['checks']['hasUnderstanding'] {
    const understandingKeywords = [
      '理解', '明白', '知道', '了解', '体会', '感受',
      '我理解', '我明白', '我了解', '我知道',
      '可能', '也许', '或许', '想必',
    ];

    const foundKeywords = understandingKeywords.filter(keyword =>
      context.content.includes(keyword)
    );

    return {
      passed: foundKeywords.length > 0,
      message: foundKeywords.length > 0
        ? `内容表达了对用户的理解（${foundKeywords.length}处）`
        : '内容缺少对用户的理解和同理表达',
      evidence: foundKeywords.length > 0 ? foundKeywords : undefined,
    };
  }

  /**
   * 检查非命令式
   */
  private checkNoCommanding(context: ContentContext): WarmthCheckResult['checks']['noCommanding'] {
    const commandingPhrases = [
      '必须', '一定', '务必', '应该', '不应该',
      '你不能', '你不应该', '禁止', '不允许',
      '必须做', '一定要', '务必完成',
    ];

    const foundPhrases = commandingPhrases.filter(phrase =>
      context.content.includes(phrase)
    );

    return {
      passed: foundPhrases.length === 0,
      message: foundPhrases.length === 0
        ? '内容未使用命令式语言'
        : `检测到 ${foundPhrases.length} 处命令式表述`,
      commandingPhrases: foundPhrases.length > 0 ? foundPhrases : undefined,
    };
  }

  /**
   * 检查自主权尊重
   */
  private checkAutonomyRespect(context: ContentContext): WarmthCheckResult['checks']['respectsAutonomy'] {
    const autonomyKeywords = [
      '您', '你', '您的', '你的',
      '可以选择', '可以决定', '可以自行',
      '建议', '推荐', '不妨', '可以考虑',
      '最终决定权', '由您决定', '您来决定',
    ];

    const foundKeywords = autonomyKeywords.filter(keyword =>
      context.content.includes(keyword)
    );

    // 检查是否有明确的决策权表述
    const hasDecisionPower = /(决定|选择|决策|权)/.test(context.content);

    return {
      passed: foundKeywords.length > 0 || hasDecisionPower,
      message: foundKeywords.length > 0 || hasDecisionPower
        ? '内容尊重用户的自主权'
        : '内容可能未充分尊重用户的自主权',
      autonomyRespects: foundKeywords.length > 0 ? foundKeywords : undefined,
    };
  }

  /**
   * 检查人性化细节
   */
  private checkHumanDetails(context: ContentContext): WarmthCheckResult['checks']['hasHumanDetails'] {
    const humanDetailKeywords = [
      '关心', '注意', '提醒', '温馨提示',
      '建议', '推荐', '不妨', '可以考虑',
      '如果', '万一', '以防', '为了',
      '细节', '小贴士', '温馨提示',
    ];

    const foundKeywords = humanDetailKeywords.filter(keyword =>
      context.content.includes(keyword)
    );

    return {
      passed: foundKeywords.length > 0,
      message: foundKeywords.length > 0
        ? `内容包含人性化细节（${foundKeywords.length}处）`
        : '内容缺少人性化的细节和关心',
      humanDetails: foundKeywords.length > 0 ? foundKeywords : undefined,
    };
  }

  /**
   * 可执行性检查
   */
  checkExecutability(
    context: ContentContext,
    config: Required<ContentQualityCheckConfig>
  ): ExecutabilityCheckResult {
    const checks = {
      isDirectlyUsable: this.checkDirectlyUsable(context),
      noAbstractExpressions: this.checkNoAbstract(context),
      userCanUnderstand: this.checkUserUnderstanding(context),
      systemCanExecute: this.checkSystemExecution(context),
    };

    const score = (
      (checks.isDirectlyUsable.passed ? 1 : 0) * 0.25 +
      (checks.noAbstractExpressions.passed ? 1 : 0) * 0.25 +
      (checks.userCanUnderstand.passed ? 1 : 0) * 0.25 +
      (checks.systemCanExecute.passed ? 1 : 0) * 0.25
    );

    const status = score >= config.minExecutabilityScore ? 'PASS' :
                   score >= config.minExecutabilityScore * 0.7 ? 'WARNING' : 'FAIL';

    const overallMessage = this.generateExecutabilityMessage(checks, score);
    const suggestions = this.generateExecutabilitySuggestions(checks);

    return {
      status,
      score,
      checks,
      overallMessage,
      suggestions,
    };
  }

  /**
   * 检查是否可直接使用
   */
  private checkDirectlyUsable(context: ContentContext): ExecutabilityCheckResult['checks']['isDirectlyUsable'] {
    // 检查是否有TODO、待完善等标记
    const hasTodo = /(TODO|待完善|待补充|待确认|待定)/.test(context.content);
    
    // 检查是否有占位符
    const hasPlaceholder = /(\{\{|\}\}|\[\[|\]\])/.test(context.content);

    const issues: string[] = [];
    if (hasTodo) issues.push('包含TODO标记');
    if (hasPlaceholder) issues.push('包含占位符');

    return {
      passed: issues.length === 0,
      message: issues.length === 0
        ? '内容可以直接使用'
        : `内容存在 ${issues.length} 处问题，无法直接使用`,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * 检查无抽象表述
   */
  private checkNoAbstract(context: ContentContext): ExecutabilityCheckResult['checks']['noAbstractExpressions'] {
    const abstractExpressions = [
      '很好', '不错', '一般', '还可以',
      '适当', '合理', '合适', '恰当',
      '优化', '改进', '提升', '增强',
      '根据情况', '视情况而定', '酌情',
    ];

    const foundExpressions = abstractExpressions.filter(expr =>
      context.content.includes(expr)
    );

    return {
      passed: foundExpressions.length === 0,
      message: foundExpressions.length === 0
        ? '内容未使用抽象表述'
        : `检测到 ${foundExpressions.length} 处抽象表述`,
      abstractExpressions: foundExpressions.length > 0 ? foundExpressions : undefined,
    };
  }

  /**
   * 检查用户可理解
   */
  private checkUserUnderstanding(context: ContentContext): ExecutabilityCheckResult['checks']['userCanUnderstand'] {
    // 检查是否有专业术语（可能需要解释）
    const technicalTerms = [
      'RouteDirection', 'POI', 'VRPTW', 'DEM',
      'API', 'SDK', 'SDK', 'JSON', 'REST',
    ];

    const foundTerms = technicalTerms.filter(term =>
      context.content.includes(term)
    );

    // 检查句子长度（过长可能难以理解）
    const sentences = context.content.split(/[。！？]/);
    const longSentences = sentences.filter(s => s.length > 50);

    const unclearParts: string[] = [];
    if (foundTerms.length > 0) unclearParts.push(`包含 ${foundTerms.length} 个专业术语`);
    if (longSentences.length > 0) unclearParts.push(`包含 ${longSentences.length} 个过长句子`);

    return {
      passed: unclearParts.length === 0,
      message: unclearParts.length === 0
        ? '内容用户易于理解'
        : `内容可能存在理解障碍（${unclearParts.length}处）`,
      unclearParts: unclearParts.length > 0 ? unclearParts : undefined,
    };
  }

  /**
   * 检查系统可执行
   */
  private checkSystemExecution(context: ContentContext): ExecutabilityCheckResult['checks']['systemCanExecute'] {
    // 检查是否有明确的动作指令
    const hasActionVerbs = /(执行|操作|点击|选择|输入|提交|确认|取消)/.test(context.content);

    // 检查是否有条件判断
    const hasCondition = /(如果|当|若|假如|倘若)/.test(context.content);

    const executionIssues: string[] = [];
    if (!hasActionVerbs && context.contentType === 'CONFIRMATION') {
      executionIssues.push('确认内容缺少明确的动作指令');
    }

    return {
      passed: executionIssues.length === 0,
      message: executionIssues.length === 0
        ? '内容系统可以执行'
        : `内容存在 ${executionIssues.length} 处执行问题`,
      executionIssues: executionIssues.length > 0 ? executionIssues : undefined,
    };
  }

  /**
   * 伦理检查
   */
  checkEthics(
    context: ContentContext,
    config: Required<ContentQualityCheckConfig>
  ): EthicsCheckResult {
    const checks = {
      noSalesHiddenInfo: this.checkNoSalesHiddenInfo(context),
      noOverRiskRendering: this.checkNoOverRiskRendering(context),
      safetyFirst: this.checkSafetyFirst(context),
      userDecisionPower: this.checkUserDecisionPower(context),
    };

    const score = (
      (checks.noSalesHiddenInfo.passed ? 1 : 0) * 0.25 +
      (checks.noOverRiskRendering.passed ? 1 : 0) * 0.25 +
      (checks.safetyFirst.passed ? 1 : 0) * 0.25 +
      (checks.userDecisionPower.passed ? 1 : 0) * 0.25
    );

    const status = score >= config.minEthicsScore ? 'PASS' :
                   score >= config.minEthicsScore * 0.7 ? 'WARNING' : 'FAIL';

    const overallMessage = this.generateEthicsMessage(checks, score);
    const suggestions = this.generateEthicsSuggestions(checks);

    return {
      status,
      score,
      checks,
      overallMessage,
      suggestions,
    };
  }

  /**
   * 检查无销售隐瞒信息
   */
  private checkNoSalesHiddenInfo(context: ContentContext): EthicsCheckResult['checks']['noSalesHiddenInfo'] {
    // 检查是否有明显的销售话术
    const salesPhrases = [
      '限时', '仅限', '独家', '特价', '优惠',
      '立即', '马上', '赶快', '不要错过',
      '超值', '超划算', '性价比最高',
    ];

    const foundPhrases = salesPhrases.filter(phrase =>
      context.content.includes(phrase)
    );

    // 检查是否有隐藏信息（如"*"、"详见"等）
    const hasHiddenInfo = /(\*|详见|详情|更多信息|联系)/.test(context.content);

    const hiddenInfo: string[] = [];
    if (foundPhrases.length > 0) hiddenInfo.push(`包含销售话术（${foundPhrases.length}处）`);
    if (hasHiddenInfo) hiddenInfo.push('可能存在隐藏信息');

    return {
      passed: hiddenInfo.length === 0,
      message: hiddenInfo.length === 0
        ? '内容未发现销售隐瞒信息'
        : `检测到 ${hiddenInfo.length} 处可能的销售隐瞒`,
      hiddenInfo: hiddenInfo.length > 0 ? hiddenInfo : undefined,
    };
  }

  /**
   * 检查无过度渲染风险
   */
  private checkNoOverRiskRendering(context: ContentContext): EthicsCheckResult['checks']['noOverRiskRendering'] {
    // 检查是否有过度渲染风险的词汇
    const overRiskPhrases = [
      '非常危险', '极其危险', '极度危险',
      '绝对不要', '千万不能', '一定不能',
      '致命', '死亡', '生命危险',
      '恐怖', '可怕', '吓人',
    ];

    const foundPhrases = overRiskPhrases.filter(phrase =>
      context.content.includes(phrase)
    );

    return {
      passed: foundPhrases.length === 0,
      message: foundPhrases.length === 0
        ? '内容未过度渲染风险'
        : `检测到 ${foundPhrases.length} 处过度渲染风险的表述`,
      overRiskPhrases: foundPhrases.length > 0 ? foundPhrases : undefined,
    };
  }

  /**
   * 检查安全第一
   */
  private checkSafetyFirst(context: ContentContext): EthicsCheckResult['checks']['safetyFirst'] {
    // 检查是否有安全相关的表述
    const safetyKeywords = [
      '安全', '可靠', '保障', '保护',
      '风险', '危险', '注意', '小心',
      '建议', '推荐', '不推荐',
    ];

    const foundKeywords = safetyKeywords.filter(keyword =>
      context.content.includes(keyword)
    );

    // 检查是否有安全警告
    const hasSafetyWarning = /(警告|注意|小心|危险|风险)/.test(context.content);

    const safetyConcerns: string[] = [];
    if (foundKeywords.length === 0 && context.contentType === 'WARNING') {
      safetyConcerns.push('警告内容缺少安全相关表述');
    }

    return {
      passed: safetyConcerns.length === 0,
      message: safetyConcerns.length === 0
        ? '内容体现了安全第一的原则'
        : `内容存在 ${safetyConcerns.length} 处安全问题`,
      safetyConcerns: safetyConcerns.length > 0 ? safetyConcerns : undefined,
    };
  }

  /**
   * 检查用户决策权
   */
  private checkUserDecisionPower(context: ContentContext): EthicsCheckResult['checks']['userDecisionPower'] {
    // 检查是否有明确的决策权表述
    const decisionPowerKeywords = [
      '您决定', '您选择', '您来决定', '您来选择',
      '最终决定', '最终选择', '由您决定',
      '建议', '推荐', '不妨考虑',
    ];

    const foundKeywords = decisionPowerKeywords.filter(keyword =>
      context.content.includes(keyword)
    );

    // 检查是否有强制性的表述
    const hasForcefulLanguage = /(必须|一定|务必|强制|强制要求)/.test(context.content);

    const decisionPowerIssues: string[] = [];
    if (hasForcefulLanguage && foundKeywords.length === 0) {
      decisionPowerIssues.push('内容使用了强制性语言但未明确用户决策权');
    }

    return {
      passed: decisionPowerIssues.length === 0,
      message: decisionPowerIssues.length === 0
        ? '内容尊重用户的决策权'
        : `内容存在 ${decisionPowerIssues.length} 处决策权问题`,
      decisionPowerIssues: decisionPowerIssues.length > 0 ? decisionPowerIssues : undefined,
    };
  }

  // 辅助方法：生成消息和建议
  private generateRationalityMessage(checks: RationalityCheckResult['checks'], score: number): string {
    if (score >= 0.8) return '内容理性性良好，数据来源清晰，推荐理由明确';
    if (score >= 0.6) return '内容理性性基本合格，但部分方面可以改进';
    return '内容理性性不足，需要补充数据来源和推荐理由';
  }

  private generateRationalitySuggestions(checks: RationalityCheckResult['checks']): string[] {
    const suggestions: string[] = [];
    if (!checks.hasDataSources.passed) suggestions.push('添加数据来源标注');
    if (!checks.hasRecommendationReasons.passed) suggestions.push('补充推荐理由');
    if (!checks.considersMultipleAngles.passed) suggestions.push('考虑多个角度');
    if (!checks.noContradictions.passed) suggestions.push('消除矛盾表述');
    return suggestions;
  }

  private generateWarmthMessage(checks: WarmthCheckResult['checks'], score: number): string {
    if (score >= 0.8) return '内容温度适宜，表达了对用户的理解和关心';
    if (score >= 0.5) return '内容温度基本合格，但可以更加人性化';
    return '内容温度不足，需要增加对用户的理解和人性化表达';
  }

  private generateWarmthSuggestions(checks: WarmthCheckResult['checks']): string[] {
    const suggestions: string[] = [];
    if (!checks.hasUnderstanding.passed) suggestions.push('增加对用户的理解表达');
    if (!checks.noCommanding.passed) suggestions.push('避免使用命令式语言');
    if (!checks.respectsAutonomy.passed) suggestions.push('明确尊重用户的自主权');
    if (!checks.hasHumanDetails.passed) suggestions.push('增加人性化的细节和关心');
    return suggestions;
  }

  private generateExecutabilityMessage(checks: ExecutabilityCheckResult['checks'], score: number): string {
    if (score >= 0.8) return '内容可执行性良好，用户易于理解和操作';
    if (score >= 0.7) return '内容可执行性基本合格，但部分表述可以更清晰';
    return '内容可执行性不足，需要改进表述的清晰度和具体性';
  }

  private generateExecutabilitySuggestions(checks: ExecutabilityCheckResult['checks']): string[] {
    const suggestions: string[] = [];
    if (!checks.isDirectlyUsable.passed) suggestions.push('移除TODO标记和占位符');
    if (!checks.noAbstractExpressions.passed) suggestions.push('使用更具体的表述替代抽象词汇');
    if (!checks.userCanUnderstand.passed) suggestions.push('简化专业术语，缩短长句');
    if (!checks.systemCanExecute.passed) suggestions.push('添加明确的动作指令');
    return suggestions;
  }

  private generateEthicsMessage(checks: EthicsCheckResult['checks'], score: number): string {
    if (score >= 0.8) return '内容伦理检查通过，符合安全第一和用户决策权原则';
    if (score >= 0.7) return '内容伦理基本合格，但部分方面需要注意';
    return '内容存在伦理问题，需要修正销售隐瞒或过度渲染风险的问题';
  }

  private generateEthicsSuggestions(checks: EthicsCheckResult['checks']): string[] {
    const suggestions: string[] = [];
    if (!checks.noSalesHiddenInfo.passed) suggestions.push('避免销售话术和隐藏信息');
    if (!checks.noOverRiskRendering.passed) suggestions.push('避免过度渲染风险，使用客观表述');
    if (!checks.safetyFirst.passed) suggestions.push('强调安全第一的原则');
    if (!checks.userDecisionPower.passed) suggestions.push('明确用户的决策权');
    return suggestions;
  }

  private determineOverallStatus(
    rationality: RationalityCheckResult,
    warmth: WarmthCheckResult,
    executability: ExecutabilityCheckResult,
    ethics: EthicsCheckResult,
    overallScore: number,
    config: Required<ContentQualityCheckConfig>
  ): CheckStatus {
    // 伦理检查失败是严重问题
    if (ethics.status === 'FAIL') return 'FAIL';
    
    // 可执行性检查失败也是严重问题
    if (executability.status === 'FAIL') return 'FAIL';

    // 检查综合得分
    const minScore = Math.min(
      config.minRationalityScore,
      config.minWarmthScore,
      config.minExecutabilityScore,
      config.minEthicsScore
    );

    if (overallScore >= minScore) return 'PASS';
    if (overallScore >= minScore * 0.7) return 'WARNING';
    return 'FAIL';
  }

  private collectCriticalIssues(
    rationality: RationalityCheckResult,
    warmth: WarmthCheckResult,
    executability: ExecutabilityCheckResult,
    ethics: EthicsCheckResult
  ): string[] {
    const issues: string[] = [];

    if (rationality.status === 'FAIL') {
      issues.push('理性性检查失败');
    }
    if (warmth.status === 'FAIL') {
      issues.push('温度检查失败');
    }
    if (executability.status === 'FAIL') {
      issues.push('可执行性检查失败');
    }
    if (ethics.status === 'FAIL') {
      issues.push('伦理检查失败（严重）');
    }

    return issues;
  }

  private generateRecommendations(
    rationality: RationalityCheckResult,
    warmth: WarmthCheckResult,
    executability: ExecutabilityCheckResult,
    ethics: EthicsCheckResult,
    criticalIssues: string[]
  ): string[] {
    const recommendations = [
      ...rationality.suggestions,
      ...warmth.suggestions,
      ...executability.suggestions,
      ...ethics.suggestions,
    ];

    // 如果有关键问题，添加优先级建议
    if (criticalIssues.length > 0) {
      recommendations.unshift('优先解决关键问题：' + criticalIssues.join('、'));
    }

    return [...new Set(recommendations)]; // 去重
  }
}
