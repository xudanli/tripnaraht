// src/trips/decision/examples/agent-runner-with-hitl.example.ts
/**
 * Agent Runner with HITL Example
 * 
 * 展示如何在 Agent 执行循环中集成 HITL 审批机制
 * 
 * 这是一个示例实现，展示：
 * 1. 如何在 Agent 循环中检测 SUSPENDED 信号
 * 2. 如何保存 Agent 状态
 * 3. 如何恢复 Agent 执行
 */

import { Injectable, Logger } from '@nestjs/common';
import { AgentResumeService } from '../services/agent-resume.service';

/**
 * 示例：Agent Runner 实现
 * 
 * 注意：这是一个简化的示例，实际实现可能需要根据你使用的 LLM 框架调整
 */
@Injectable()
export class AgentRunnerWithHitlExample {
  private readonly logger = new Logger(AgentRunnerWithHitlExample.name);

  constructor(
    private readonly agentResumeService: AgentResumeService,
  ) {}

  /**
   * Agent 执行循环（带 HITL 支持）
   * 
   * @param threadId 会话/线程 ID
   * @param userMessage 用户消息
   * @returns Agent 响应
   */
  async runAgentLoop(threadId: string, userMessage: string): Promise<any> {
    // 1. 加载或创建消息历史
    let messages = await this.loadMessageHistory(threadId);
    if (!messages) {
      messages = [
        {
          role: 'system' as const,
          content: 'You are TripNARA travel planning assistant. Use tools when needed.',
        },
        {
          role: 'user' as const,
          content: userMessage,
        },
      ];
    }

    // 2. 尝试加载之前挂起的状态
    const savedState = await this.agentResumeService.loadAgentState(threadId);
    if (savedState) {
      this.logger.log(`恢复之前的 Agent 状态: ${savedState.messages.length} 条消息`);
      messages = savedState.messages;
    }

    // 3. Agent 执行循环
    let maxIterations = 10; // 防止无限循环
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // 3.1 调用 LLM
      const llmResponse = await this.callLLM(messages);

      // 3.2 检查是否有工具调用
      if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
        // 没有工具调用，返回最终响应
        return {
          role: 'assistant',
          content: llmResponse.content,
        };
      }

      // 3.3 执行工具调用
      for (const toolCall of llmResponse.toolCalls) {
        const toolResult = await this.executeTool(toolCall);

        // 🔑 关键检查点：检测挂起信号
        if (this.agentResumeService.detectSuspensionSignal(toolResult)) {
          // 提取挂起信息
          const suspensionInfo = this.agentResumeService.extractSuspensionInfo(toolResult);
          if (!suspensionInfo) {
            continue;
          }

          // 保存 Agent 状态
          await this.agentResumeService.saveAgentState(threadId, {
            threadId,
            messages: [
              ...messages,
              {
                role: 'assistant',
                content: llmResponse.content,
                toolCalls: llmResponse.toolCalls,
              },
              {
                role: 'tool',
                toolCallId: toolCall.id,
                content: JSON.stringify(toolResult),
              },
            ],
            lastToolCallId: toolCall.id,
          });

          // 返回挂起响应给前端
          return {
            role: 'assistant',
            content: suspensionInfo.message || '我需要您的确认才能继续...',
            metadata: {
              suspended: true,
              approvalId: suspensionInfo.approvalId,
              showApprovalUI: true,
              userUI: suspensionInfo.userUI,
            },
          };
        }

        // 如果不是挂起，将工具结果添加到消息历史，继续循环
        messages.push({
          role: 'assistant',
          content: llmResponse.content,
          toolCalls: llmResponse.toolCalls,
        });
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    // 达到最大迭代次数
    return {
      role: 'assistant',
      content: '已达到最大迭代次数，请稍后重试。',
    };
  }

  /**
   * 恢复 Agent 执行（用户审批后调用）
   * 
   * @param threadId 会话/线程 ID
   * @param approvalId 审批请求 ID
   * @returns 继续执行后的响应
   */
  async resumeAgentAfterApproval(threadId: string, approvalId: string): Promise<any> {
    // 1. 恢复 Agent 状态（会构造 Tool Output 消息）
    const snapshot = await this.agentResumeService.resumeAgent(threadId, approvalId);
    if (!snapshot) {
      throw new Error('无法恢复 Agent 状态');
    }

    // 2. 继续执行 Agent 循环
    // 注意：此时消息历史已经包含了 Tool Output，Agent 会看到审批结果
    return this.runAgentLoop(threadId, ''); // 不需要新的用户消息
  }

  /**
   * 加载消息历史（示例方法）
   */
  private async loadMessageHistory(threadId: string): Promise<any[] | null> {
    // TODO: 从数据库或缓存加载消息历史
    return null;
  }

  /**
   * 调用 LLM（示例方法）
   * 
   * 实际实现需要根据你使用的 LLM 框架（OpenAI、Anthropic 等）调整
   */
  private async callLLM(messages: any[]): Promise<{
    content: string;
    toolCalls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }> {
    // TODO: 实现实际的 LLM 调用
    // 示例：
    // const response = await this.openai.chat.completions.create({
    //   model: 'gpt-4',
    //   messages,
    //   tools: [...],
    // });
    // return response.choices[0].message;

    throw new Error('需要实现 LLM 调用');
  }

  /**
   * 执行工具（示例方法）
   * 
   * 实际实现需要根据你的工具注册机制调整
   */
  private async executeTool(toolCall: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }): Promise<any> {
    // TODO: 实现实际的工具执行
    // 示例：
    // const toolName = toolCall.function.name;
    // const args = JSON.parse(toolCall.function.arguments);
    // const tool = this.toolsRegistry.getTool(toolName);
    // return await tool.execute(args);

    throw new Error('需要实现工具执行');
  }
}
