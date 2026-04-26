// src/trips/decision/orchestration/narrator-agent.service.ts
/**
 * Narrator Agent Service
 * 
 * 职责：结果润色、故事层文案生成
 * 
 * 设计原则：
 * - 只负责"安抚用户"和"生成可读解释"
 * - 不负责决策逻辑
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { INarratorAgent, LangGraphState } from './langgraph-orchestrator.interface';
import { TripNaraCoreToolOutput } from '../tools/tripnara-core-tool.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
import { buildContextForNode, writeBackFromNode, buildPromptFromContextPackage, mapPhaseToTripTaskPhase } from '../../../agent/context-engine/utils/langgraph-context-integration';

@Injectable()
export class NarratorAgentService implements INarratorAgent {
  private readonly logger = new Logger(NarratorAgentService.name);
  private readonly useLlm: boolean;

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly contextEngineer?: ContextEngineerService,
  ) {
    // 检查是否启用 LLM
    // 检查是否有 LLM 配置（优先 DeepSeek，内网环境可用）
    const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    this.useLlm = !!llmService && (hasDeepSeekKey || hasOpenAIKey);
    if (this.useLlm) {
      this.logger.log('Narrator Agent: LLM 已启用');
    } else {
      this.logger.warn('Narrator Agent: 使用模板模式（LLM 未启用）');
    }
  }

  /**
   * 生成可读解释（集成 Context Engineer）
   */
  async generateExplanation(
    coreToolOutput: TripNaraCoreToolOutput,
    state?: LangGraphState,
    complianceResult?: LangGraphState['complianceResult']
  ): Promise<string> {
    this.logger.debug('生成可读解释');

    // 1. 构建上下文（如果 Context Engineer 和 state 可用）
    let contextPackage;
    if (this.contextEngineer && state) {
      try {
        const ctx = await buildContextForNode(state, this.contextEngineer, {
          agent: 'NARRATOR',
          phase: state.planningPhase || 'FINALIZING',
          tokenBudget: 2400, // Narrator 需要较少的上下文
          requiredTopics: ['DECISION_LOG', 'PLAN_SUMMARY'], // Narrator 需要决策日志和计划摘要
        });
        contextPackage = ctx.contextPackage;
        this.logger.debug(`Context Package 构建完成: ${contextPackage.blocks.length} 个块, ${contextPackage.totalTokens} tokens`);
      } catch (error: any) {
        this.logger.warn(`构建 Context Package 失败: ${error.message}，继续使用原始输出`);
      }
    }

    // 2. 如果 LLM 可用，优先使用 LLM（使用增强的上下文）
    if (this.useLlm && this.llmService) {
      try {
        return await this.generateExplanationWithLlm(coreToolOutput, state, contextPackage, complianceResult);
      } catch (error) {
        this.logger.warn(`LLM 生成失败，回退到模板模式: ${error instanceof Error ? error.message : String(error)}`);
        // 回退到模板模式
      }
    }

    // 3. 使用模板作为回退或默认方案
    if (!coreToolOutput.allowed) {
      return this.generateRejectionExplanation(coreToolOutput);
    }

    const explanation = this.generateSuccessExplanation(coreToolOutput, complianceResult);

    // 4. 写入回写（如果 Context Engineer 和 state 可用）
    if (this.contextEngineer && state && state.metadata?.tripRunId) {
      try {
        await writeBackFromNode(state, this.contextEngineer, {
          tripRunId: state.metadata.tripRunId as string,
          attemptNumber: (state.metadata.attemptNumber as number) || 1,
          tripId: state.metadata?.tripId as string | undefined,
          phase: mapPhaseToTripTaskPhase(state.planningPhase || 'FINALIZING'),
          scratchpad: {
            planOutline: `Narrator 生成解释完成: ${coreToolOutput.allowed ? 'ALLOWED' : 'REJECTED'}`,
          },
        });
      } catch (error: any) {
        this.logger.warn(`写入回写失败: ${error.message}`);
      }
    }

    return explanation;
  }

  /**
   * 使用 LLM 生成解释（增强上下文）
   */
  private async generateExplanationWithLlm(
    coreToolOutput: TripNaraCoreToolOutput,
    state?: LangGraphState,
    contextPackage?: any,
    complianceResult?: LangGraphState['complianceResult']
  ): Promise<string> {
    const decisionLogs = coreToolOutput.logs || [];
    const personaLogs = {
      abu: decisionLogs.filter(log => log.persona === 'ABU'),
      drDre: decisionLogs.filter(log => log.persona === 'DR_DRE'),
      neptune: decisionLogs.filter(log => log.persona === 'NEPTUNE'),
    };

    // 构建增强的 prompt（如果 Context Package 可用）
    let contextPrompt = '';
    if (contextPackage) {
      contextPrompt = `\n\n上下文信息：\n${buildPromptFromContextPackage(contextPackage)}\n`;
    }

    const historical_precedents =
      (state?.metadata as any)?.historical_precedents ??
      (state?.metadata as any)?.early_warning?.historical_precedents ??
      undefined;
    const precedentsArr = Array.isArray(historical_precedents) ? historical_precedents : [];
    const top = precedentsArr.length > 0 ? (precedentsArr[0] as any) : undefined;
    const N =
      typeof top?.sample_count === 'number'
        ? top.sample_count
        : (() => {
            const m = String(top?.summary ?? '').match(/N\s*=\s*(\d+)/i);
            return m ? parseInt(m[1], 10) : 0;
          })();

    const citationRule =
      N > 3
        ? `【权威引用规则】N>3：必须引用具体百分比（%），并给出“节省成本”一项（如耗时 ms）。不得使用“可能/大概”。`
        : N >= 1
          ? `【探索性引用规则】1≤N≤3：禁止报百分比；只能用“近期类似案例显示/往往需要…”的判例描述，不得夸大确定性。`
          : `【降维规则】N=0：不要引用判例统计；只回到物理/业务规则与证据解释。`;

    const precedentsPrompt =
      precedentsArr.length > 0
        ? `\n\nhistorical_precedents（判例库召回结果）：\n${JSON.stringify(precedentsArr, null, 2)}\n\n${citationRule}\n`
        : `\n\nhistorical_precedents：[]\n\n${citationRule}\n`;

    const prompt = `你是一个旅行规划助手，负责将技术性的决策结果转化为友好、易懂的自然语言解释。

决策结果：
- 是否允许：${coreToolOutput.allowed ? '是' : '否'}
- 动作：${coreToolOutput.action}
- 解释：${coreToolOutput.explanation || '无'}

决策日志：
${JSON.stringify(personaLogs, null, 2)}

${complianceResult ? `合规检查结果：${JSON.stringify(complianceResult, null, 2)}` : ''}${contextPrompt}${precedentsPrompt}

请生成一段友好、易懂的中文解释，要求：
1. 如果路线被拒绝，要说明原因并给出建议
2. 如果路线通过，要总结决策过程（Abu（北极熊 🐻‍❄️）的安全检查、Dr.Dre（牧羊犬 🐕）的节奏调整、Neptune（海獭 🦦）的空间修复）
3. 语言要友好、专业，但不过于技术化
4. 如果有合规要求，要明确提示
5. 长度控制在 200 字以内
6. 如果上下文信息中有相关的决策历史或计划摘要，可以引用它们来增强解释的准确性
7. 如果提供了 historical_precedents，请用 1 句“判例式”表达总结（避免夸大，给出范围/概率/代价之一），用于节省用户反复试错成本
8. 严格遵守“权威引用规则”：当 N>3 时必须报百分比；当 1≤N≤3 时禁止报百分比；当 N=0 时禁止提及统计口径

只返回解释文本，不要其他格式。`;

    try {
      // 使用 DeepSeek（内网环境可用）
      const provider = process.env.DEEPSEEK_API_KEY 
        ? LlmProvider.DEEPSEEK 
        : (process.env.OPENAI_API_KEY ? LlmProvider.OPENAI : LlmProvider.DEEPSEEK);
      
      const response = await this.llmService!.callLlmWithSchema(
        provider,
        prompt
      );
      return response.trim();
    } catch (error) {
      this.logger.error(`LLM 生成解释失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 生成拒绝解释
   */
  private generateRejectionExplanation(output: TripNaraCoreToolOutput): string {
    const rejectLog = output.logs.find(log => log.action === 'REJECT');
    
    if (rejectLog) {
      const personaName = this.getPersonaName(rejectLog.persona);
      return `很抱歉，${personaName} 拒绝了这条路线。\n\n原因：${rejectLog.explanation}\n\n建议：${this.generateSuggestion(rejectLog)}`;
    }

    return '很抱歉，路线被拒绝。请尝试调整您的需求或选择其他路线。';
  }

  /**
   * 生成成功解释
   */
  private generateSuccessExplanation(
    output: TripNaraCoreToolOutput,
    complianceResult?: LangGraphState['complianceResult']
  ): string {
    const parts: string[] = [];

    // 添加核心工具的输出解释
    if (output.explanation) {
      parts.push(output.explanation);
    }

    // 添加合规检查结果（如果有）
    if (complianceResult) {
      if (complianceResult.requiresPermit) {
        parts.push('⚠️ 注意：此路线需要许可证，请提前申请。');
      }
      if (complianceResult.requiresGuide) {
        parts.push('⚠️ 注意：此路线需要向导陪同。');
      }
    }

    // 添加决策动作说明
    if (output.action === 'ADJUST') {
      parts.push('\n💡 Dr.Dre（牧羊犬 🐕）已为您调整了行程节奏，让每一天刚刚好，确保整体可持续。');
    } else if (output.action === 'REPLACE') {
      parts.push('\n💡 Neptune（海獭 🦦）已为您替换了不可用路段，提供了刚刚好的替代方案，保持了路线精神。');
    }

    return parts.join('\n\n');
  }

  /**
   * 获取人格名称（中文）
   */
  private getPersonaName(persona: string): string {
    const nameMap: Record<string, string> = {
      'ABU': '安全守护者 Abu（北极熊 🐻‍❄️）',
      'DR_DRE': '节奏设计师 Dr.Dre（牧羊犬 🐕）',
      'NEPTUNE': '空间魔法师 Neptune（海獭 🦦）',
    };
    return nameMap[persona] || persona;
  }

  /**
   * 生成建议
   */
  private generateSuggestion(log: any): string {
    if (log.decisionSource === 'PHYSICAL') {
      return '建议选择其他时间段或路线，避开物理限制。';
    }
    if (log.decisionSource === 'HUMAN') {
      return '建议调整行程节奏或选择更轻松的路线。';
    }
    if (log.decisionSource === 'PHILOSOPHY') {
      return '建议选择其他符合您需求的路线方向。';
    }
    return '建议调整您的需求或选择其他路线。';
  }
}

