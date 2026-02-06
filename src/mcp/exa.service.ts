/**
 * Exa MCP Service
 * 
 * 封装 Exa MCP 客户端，提供业务逻辑层
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ExaMcpClient } from './exa-client';

@Injectable()
export class ExaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExaService.name);
  private client: ExaMcpClient | null = null;

  async onModuleInit() {
    // 延迟初始化，避免启动时连接失败
    this.logger.log('ExaService initialized');
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        this.logger.error('Failed to disconnect Exa client:', error);
      }
    }
  }

  /**
   * 获取或创建客户端实例
   */
  private async getClient(): Promise<ExaMcpClient> {
    if (this.client && this.client.getIsConnected()) {
      return this.client;
    }

    this.client = new ExaMcpClient();

    try {
      await this.client.connect();
    } catch (error: any) {
      this.logger.error('Failed to connect to Exa MCP:', error.message);
      throw error;
    }

    return this.client;
  }

  /**
   * Web 搜索
   */
  async webSearch(query: string, options?: {
    numResults?: number;
    useAutoprompt?: boolean;
    category?: string;
    startPublishedDate?: string;
    endPublishedDate?: string;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('web_search_exa', args);
  }

  /**
   * 获取代码上下文
   */
  async getCodeContext(query: string, options?: {
    numResults?: number;
    languages?: string[];
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('get_code_context_exa', args);
  }

  /**
   * 公司研究
   */
  async companyResearch(company: string, options?: {
    numResults?: number;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      companyName: company, // 参数名必须是 companyName
      ...options,
    };

    return await client.callTool('company_research_exa', args);
  }

  /**
   * 高级 Web 搜索
   */
  async webSearchAdvanced(query: string, options?: {
    numResults?: number;
    useAutoprompt?: boolean;
    category?: string;
    startPublishedDate?: string;
    endPublishedDate?: string;
    contents?: {
      text?: boolean;
      html?: boolean;
      markdown?: boolean;
    };
    filters?: {
      domains?: string[];
      excludeDomains?: string[];
    };
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('web_search_advanced_exa', args);
  }

  /**
   * 深度搜索
   */
  async deepSearch(query: string, options?: {
    numResults?: number;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('deep_search_exa', args);
  }

  /**
   * 网页爬取
   */
  async crawlUrl(url: string, options?: {
    text?: boolean;
    html?: boolean;
    markdown?: boolean;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      url,
      ...options,
    };

    return await client.callTool('crawling_exa', args);
  }

  /**
   * 人员搜索
   */
  async peopleSearch(query: string, options?: {
    numResults?: number;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('people_search_exa', args);
  }

  /**
   * 开始深度研究
   */
  async deepResearcherStart(query: string, options?: {
    reportType?: string;
    numResults?: number;
  }): Promise<any> {
    const client = await this.getClient();
    
    const args: Record<string, any> = {
      query,
      ...options,
    };

    return await client.callTool('deep_researcher_start', args);
  }

  /**
   * 检查深度研究状态
   */
  async deepResearcherCheck(taskId: string): Promise<any> {
    const client = await this.getClient();
    
    return await client.callTool('deep_researcher_check', { taskId });
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any[]> {
    const client = await this.getClient();
    return await client.listTools();
  }

  /**
   * 检查连接状态
   */
  async checkConnectionStatus(): Promise<{
    isConnected: boolean;
    hasApiKey: boolean;
  }> {
    const hasApiKey = !!process.env.EXA_API_KEY;
    const isConnected = this.client?.getIsConnected() || false;

    return {
      isConnected,
      hasApiKey,
    };
  }
}
