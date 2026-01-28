// src/agent/assistants/trip-planner/services/prompt.service.ts

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

/**
 * Prompt服务
 * 
 * 职责：
 * 1. 统一管理所有Prompt模板
 * 2. 支持版本管理
 * 3. 支持模板变量替换
 * 4. 支持Prompt缓存
 */
@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private readonly promptCache = new Map<string, string>();
  private readonly handlebars = Handlebars.create();

  constructor() {
    // 注册Handlebars helpers
    this.registerHelpers();
  }

  /**
   * 注册Handlebars helpers
   */
  private registerHelpers(): void {
    // #if helper for conditional blocks (Handlebars内置，但我们需要确保可用)
    // Handlebars默认支持#if，无需额外注册
  }

  /**
   * 获取Prompt模板
   * 
   * @param promptType Prompt类型
   * @param version 版本号（默认latest）
   * @returns Prompt模板内容
   */
  async getPrompt(
    promptType: 'intent_analysis' | 'qa_enhancement' | 'general_chat',
    version: string = 'latest'
  ): Promise<string> {
    const cacheKey = `${promptType}:${version}`;
    
    // 检查缓存
    if (this.promptCache.has(cacheKey)) {
      this.logger.debug(`[Prompt服务] 缓存命中: ${cacheKey}`);
      return this.promptCache.get(cacheKey)!;
    }

    // 加载Prompt文件
    const promptFile = this.getPromptFilePath(promptType, version);
    
    if (!fs.existsSync(promptFile)) {
      this.logger.warn(`[Prompt服务] Prompt文件不存在: ${promptFile}，使用默认版本`);
      // 尝试加载v1.0版本
      const defaultFile = this.getPromptFilePath(promptType, 'v1.0');
      if (fs.existsSync(defaultFile)) {
        const content = fs.readFileSync(defaultFile, 'utf-8');
        const template = this.extractPromptContent(content);
        this.promptCache.set(cacheKey, template);
        return template;
      }
      throw new Error(`Prompt文件不存在: ${promptFile}`);
    }

    const content = fs.readFileSync(promptFile, 'utf-8');
    const template = this.extractPromptContent(content);
    
    // 缓存模板
    this.promptCache.set(cacheKey, template);
    
    this.logger.debug(`[Prompt服务] Prompt加载成功: ${promptType}:${version}`);
    return template;
  }

  /**
   * 渲染Prompt模板
   * 
   * @param promptType Prompt类型
   * @param variables 模板变量
   * @param version 版本号
   * @returns 渲染后的Prompt
   */
  async renderPrompt(
    promptType: 'intent_analysis' | 'qa_enhancement' | 'general_chat',
    variables: Record<string, any>,
    version: string = 'latest'
  ): Promise<string> {
    const template = await this.getPrompt(promptType, version);
    const compiled = this.handlebars.compile(template);
    return compiled(variables);
  }

  /**
   * 获取Prompt文件路径
   */
  private getPromptFilePath(
    promptType: 'intent_analysis' | 'qa_enhancement' | 'general_chat',
    version: string
  ): string {
    const promptFileMap: Record<string, string> = {
      intent_analysis: 'intent-analysis',
      qa_enhancement: 'qa-enhancement',
      general_chat: 'general-chat',
    };

    const fileName = promptFileMap[promptType];
    const versionSuffix = version === 'latest' ? 'v1.0' : version;
    
    return path.join(
      process.cwd(),
      'prompts',
      'trip-planner',
      `${fileName}-${versionSuffix}.md`
    );
  }

  /**
   * 从Markdown文件中提取Prompt内容
   * 
   * 提取规则：
   * 1. 查找"## Prompt内容"或"## Prompt模板"部分
   * 2. 提取该部分到下一个##标题（如"## 输出格式要求"）之间的内容
   * 3. 保留Few-shot Examples（对LLM有用）
   * 4. 移除不必要的Markdown格式标记，但保留示例内容
   */
  private extractPromptContent(markdown: string): string {
    // 查找Prompt内容部分（从"## Prompt内容"或"## Prompt模板"开始）
    // 提取到下一个顶级标题（##）之前的所有内容，包括Few-shot Examples
    const promptSectionMatch = markdown.match(
      /##\s+(?:Prompt内容|Prompt模板)\s*\n([\s\S]*?)(?=\n##\s+(?:输出格式要求|分析步骤|版本信息|角色设定|职责范围|Few-shot Examples|用途)|$)/
    );

    if (!promptSectionMatch) {
      // 如果没有找到特定部分，尝试提取整个文件（排除Front Matter）
      let content = markdown.replace(/^---[\s\S]*?---\n/, '');
      // 移除"## 用途"等元数据部分
      content = content.replace(/^##\s+用途[\s\S]*?\n/, '');
      return content.trim();
    }

    let content = promptSectionMatch[1].trim();

    // 查找Few-shot Examples部分（如果有）
    const examplesMatch = markdown.match(/##\s+Few-shot Examples\s*\n([\s\S]*?)(?=\n##|$)/);
    if (examplesMatch) {
      let examplesContent = examplesMatch[1].trim();
      // 移除Markdown代码块标记，但保留JSON内容
      examplesContent = examplesContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      // 移除示例标题，但保留示例内容
      examplesContent = examplesContent.replace(/###\s+示例\d+\s*\n/g, '示例：\n');
      // 将Few-shot Examples添加到Prompt内容中
      content = `${content}\n\n## Few-shot Examples\n${examplesContent}`;
    }

    // 查找"输出格式要求"部分（如果有）
    const outputFormatMatch = markdown.match(/##\s+输出格式要求\s*\n([\s\S]*?)(?=\n##|$)/);
    if (outputFormatMatch) {
      let formatContent = outputFormatMatch[1].trim();
      formatContent = formatContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      content = `${content}\n\n## 输出格式要求\n${formatContent}`;
    }

    // 查找"分析步骤"部分（如果有）
    const stepsMatch = markdown.match(/##\s+分析步骤\s*\n([\s\S]*?)(?=\n##|$)/);
    if (stepsMatch) {
      content = `${content}\n\n## 分析步骤\n${stepsMatch[1].trim()}`;
    }

    return content.trim();
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.promptCache.clear();
    this.logger.debug('[Prompt服务] 缓存已清除');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.promptCache.size,
      keys: Array.from(this.promptCache.keys()),
    };
  }
}
