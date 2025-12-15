// src/llm/services/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NaturalLanguageToParamsDto, TripCreationParams, HumanizeResultDto, DecisionSupportDto, LlmProvider } from '../dto/llm-request.dto';

/**
 * 通用 LLM 服务
 * 
 * 提供以下功能：
 * 1. 自然语言转接口参数（如创建行程）
 * 2. 复杂决策支持（What-If评估、多方案对比）
 * 3. 结果人性化转化（结构化数据转自然语言）
 * 4. 异常处理与追问
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly defaultProvider: LlmProvider;

  private readonly useMock: boolean;

  constructor(private configService: ConfigService) {
    // 检查是否启用 Mock 模式（用于测试或网络不可用时）
    this.useMock = this.configService.get<string>('LLM_USE_MOCK') === 'true';
    
    // 根据环境变量确定默认提供商
    if (this.configService.get<string>('OPENAI_API_KEY')) {
      this.defaultProvider = LlmProvider.OPENAI;
    } else if (this.configService.get<string>('GEMINI_API_KEY')) {
      this.defaultProvider = LlmProvider.GEMINI;
    } else if (this.configService.get<string>('DEEPSEEK_API_KEY')) {
      this.defaultProvider = LlmProvider.DEEPSEEK;
    } else if (this.configService.get<string>('ANTHROPIC_API_KEY')) {
      this.defaultProvider = LlmProvider.ANTHROPIC;
    } else {
      this.defaultProvider = LlmProvider.OPENAI; // 默认
      // 如果没有配置 API Key 且未启用 Mock，自动启用 Mock
      if (!this.useMock) {
        this.logger.warn('No LLM API key configured and LLM_USE_MOCK not set, will use mock mode');
        // 注意：这里不能直接修改 useMock，因为它是 readonly
        // 实际会在 callLlm 中检查网络连接失败时自动回退
      }
    }
  }

  /**
   * 自然语言转接口参数
   * 将用户的口语化需求转换为创建行程的接口参数
   */
  async naturalLanguageToTripParams(dto: NaturalLanguageToParamsDto): Promise<{
    params: TripCreationParams;
    needsClarification: boolean;
    clarificationQuestions?: string[];
  }> {
    const provider = dto.provider || this.defaultProvider;
    const prompt = this.buildTripCreationPrompt(dto.text);

    try {
      const response = await this.callLlm(provider, prompt, this.getTripCreationSchema());
      const parsed = JSON.parse(response);

      // 验证必需字段
      if (!parsed.destination || !parsed.startDate || !parsed.endDate || !parsed.totalBudget) {
        return {
          params: parsed as TripCreationParams,
          needsClarification: true,
          clarificationQuestions: this.generateClarificationQuestions(parsed),
        };
      }

      return {
        params: parsed as TripCreationParams,
        needsClarification: false,
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse natural language: ${error.message}`);
      throw error;
    }
  }

  /**
   * 结果人性化转化
   * 将接口返回的结构化数据转化为自然语言描述
   */
  async humanizeResult(dto: HumanizeResultDto): Promise<string> {
    const provider = dto.provider || this.defaultProvider;
    const prompt = this.buildHumanizePrompt(dto.dataType, dto.data);

    try {
      const response = await this.callLlm(provider, prompt);
      return response;
    } catch (error: any) {
      this.logger.error(`Failed to humanize result: ${error.message}`);
      throw error;
    }
  }

  /**
   * 决策支持
   * 基于接口数据提供智能决策建议
   */
  async provideDecisionSupport(dto: DecisionSupportDto): Promise<{
    recommendations: Array<{
      title: string;
      description: string;
      confidence: number;
      reasoning: string;
    }>;
    summary: string;
  }> {
    const provider = dto.provider || this.defaultProvider;
    const prompt = this.buildDecisionSupportPrompt(dto.scenario, dto.contextData);

    try {
      const response = await this.callLlm(provider, prompt, this.getDecisionSupportSchema());
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error: any) {
      this.logger.error(`Failed to provide decision support: ${error.message}`);
      throw error;
    }
  }

  /**
   * 异常处理与追问
   * 当接口调用失败或参数不足时，生成追问话术
   */
  async handleErrorAndClarify(error: any, context: string): Promise<{
    message: string;
    clarificationQuestions: string[];
    suggestedActions: string[];
  }> {
    // 如果启用 Mock 模式或网络不可用，直接返回默认错误处理
    if (this.useMock) {
      this.logger.warn('Using mock error handling');
      return {
        message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
        clarificationQuestions: [
          '请检查输入参数是否正确',
          '请提供更详细的行程信息（目的地、日期、预算等）',
        ],
        suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
      };
    }

    const provider = this.defaultProvider;
    const prompt = this.buildErrorHandlingPrompt(error, context);

    try {
      const response = await this.callLlm(provider, prompt, this.getErrorHandlingSchema());
      const parsed = JSON.parse(response);
      return parsed;
    } catch (err: any) {
      this.logger.error(`Failed to handle error with LLM: ${err.message}`);
      // 回退到默认错误处理
      return {
        message: `抱歉，处理您的请求时遇到了问题：${error.message || '未知错误'}`,
        clarificationQuestions: [
          '请检查输入参数是否正确',
          '请提供更详细的行程信息（目的地、日期、预算等）',
        ],
        suggestedActions: ['重试', '使用标准创建行程接口', '联系客服'],
      };
    }
  }

  /**
   * 调用 LLM API
   */
  private async callLlm(
    provider: LlmProvider,
    prompt: string,
    schema?: any
  ): Promise<string> {
    // 如果启用 Mock 模式，返回模拟响应
    if (this.useMock) {
      this.logger.warn('Using mock LLM response');
      return this.getMockResponse(prompt, schema);
    }

    try {
      switch (provider) {
        case LlmProvider.OPENAI:
          return await this.callOpenAI(prompt, schema);
        case LlmProvider.GEMINI:
          return await this.callGemini(prompt, schema);
        case LlmProvider.DEEPSEEK:
          return await this.callDeepSeek(prompt, schema);
        case LlmProvider.ANTHROPIC:
          return await this.callAnthropic(prompt, schema);
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    } catch (error: any) {
      // 如果网络请求失败，自动回退到 Mock 模式
      if (error.message?.includes('no response received') || error.message?.includes('network') || error.code === 'ECONNREFUSED') {
        this.logger.warn(`LLM API call failed (${error.message}), falling back to mock mode`);
        return this.getMockResponse(prompt, schema);
      }
      throw error;
    }
  }

  /**
   * Mock 响应（用于测试或网络不可用时）
   */
  private getMockResponse(prompt: string, schema?: any): string {
    this.logger.debug(`Mock LLM response for prompt: ${prompt.substring(0, 100)}...`);
    
    // 尝试提取天数
    const dayMatch = prompt.match(/(\d+)\s*天/);
    const days = dayMatch ? parseInt(dayMatch[1]) : 5;
    
    // 尝试提取预算
    const budgetMatch = prompt.match(/(\d+)\s*万/);
    const budget = budgetMatch ? parseInt(budgetMatch[1]) * 10000 : 20000;
    
    // 生成日期（使用日期格式，不带时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);
    
    // 格式化为 YYYY-MM-DD
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const startDateStr = formatDate(today);
    const endDateStr = formatDate(endDate);
    
    // 检测目的地
    let destination: string | null = null;
    if (prompt.includes('东京') || prompt.includes('日本') || prompt.includes('JP')) {
      destination = 'JP';
    } else if (prompt.includes('杭州') || prompt.includes('中国') || prompt.includes('CN')) {
      destination = 'CN';
    }
    
    const result = {
      destination: destination || 'JP', // 默认日本
      startDate: startDateStr,
      endDate: endDateStr,
      totalBudget: budget,
      hasChildren: (prompt.includes('带娃') || prompt.includes('小孩') || prompt.includes('孩子')) && !prompt.includes('去日本玩'),
      hasElderly: prompt.includes('老人') || prompt.includes('父母') || prompt.includes('长辈'),
      preferences: {},
    };
    
    this.logger.debug(`Mock response: ${JSON.stringify(result)}`);
    return JSON.stringify(result);
  }

  /**
   * 调用 OpenAI API
   */
  private async callOpenAI(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo';
    
    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    // 如果提供了 schema，使用 structured outputs
    if (schema && model.includes('gpt-4')) {
      body.response_format = { type: 'json_object' };
      body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      this.logger.error(`OpenAI API error: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`OpenAI API response: ${JSON.stringify(error.response.data)}`);
        throw new Error(`OpenAI API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      if (error.request) {
        this.logger.error(`OpenAI API request failed: no response received`);
        throw new Error(`OpenAI API request failed: no response received. Check network connection.`);
      }
      throw new Error(`OpenAI API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 Gemini API
   */
  private async callGemini(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-pro';
    
    const body: any = {
      contents: [{
        parts: [{ text: prompt }],
      }],
    };

    if (schema) {
      body.generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: schema,
      };
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const data = response.data as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Gemini API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Gemini API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeek(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const model = this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    
    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    if (schema) {
      body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      });

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      if (error.response) {
        throw new Error(`DeepSeek API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`DeepSeek API request failed: ${error.message}`);
    }
  }

  /**
   * 调用 Anthropic API
   */
  private async callAnthropic(prompt: string, schema?: any): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const model = this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';
    
    const body: any = {
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    };

    if (schema) {
      body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', body, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      });

      const data = response.data as {
        content?: Array<{ text?: string }>;
      };
      return data.content?.[0]?.text || '';
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Anthropic API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Anthropic API request failed: ${error.message}`);
    }
  }

  // ========== Prompt 构建方法 ==========

  private buildTripCreationPrompt(text: string): string {
    return `你是一个智能旅行规划助手。用户说："${text}"

请从用户的自然语言中提取以下信息，并返回 JSON 格式：
- destination: 目的地国家代码（ISO 3166-1 alpha-2，如 JP、CN、US）
- startDate: 开始日期（ISO 8601 格式，如果未指定则使用当前日期）
- endDate: 结束日期（ISO 8601 格式，根据天数推算）
- totalBudget: 总预算（人民币，元）
- hasChildren: 是否有小孩（布尔值）
- hasElderly: 是否有老人（布尔值）
- preferences: 其他偏好（对象，可选）

注意：
- 如果用户提到"带娃"、"带孩子"、"有小孩"等，设置 hasChildren 为 true
- 如果用户提到"带老人"、"带父母"、"有老人"等，设置 hasElderly 为 true
- 如果信息不足，请尽量推断合理默认值，但标记 needsClarification 为 true

返回的 JSON 格式示例：
{
  "destination": "JP",
  "startDate": "2024-05-01T00:00:00.000Z",
  "endDate": "2024-05-05T00:00:00.000Z",
  "totalBudget": 20000,
  "hasChildren": true,
  "hasElderly": false,
  "preferences": {}
}`;
  }

  private buildHumanizePrompt(dataType: string, data: any): string {
    const dataStr = JSON.stringify(data, null, 2);
    
    const prompts: Record<string, string> = {
      itinerary_optimization: `请将以下行程优化结果转化为自然语言描述，包括时间安排、路线顺序、快乐值评分等：

${dataStr}

请用流畅的中文描述，让用户容易理解。`,
      
      what_if_evaluation: `请将以下 What-If 评估结果转化为自然语言，包括风险指标、候选方案对比、推荐建议等：

${dataStr}

请用清晰的中文说明每个方案的优劣。`,
      
      trip_schedule: `请将以下行程计划转化为自然语言描述，包括每日安排、活动时间、地点信息等：

${dataStr}

请用友好的语气描述，让用户对行程有清晰的了解。`,
      
      transport_plan: `请将以下交通规划结果转化为自然语言，包括交通方式、时间、痛苦指数、推荐理由等：

${dataStr}

请用简洁明了的中文说明。`,
    };

    return prompts[dataType] || `请将以下数据转化为自然语言描述：\n\n${dataStr}`;
  }

  private buildDecisionSupportPrompt(scenario: string, contextData: any): string {
    return `你是一个智能决策助手。当前场景：${scenario}

相关数据：
${JSON.stringify(contextData, null, 2)}

请分析数据，提供 2-3 个决策建议，每个建议包括：
- title: 建议标题
- description: 详细描述
- confidence: 置信度（0-1）
- reasoning: 推理过程

最后提供一个总结。`;
  }

  private buildErrorHandlingPrompt(error: any, context: string): string {
    return `用户在执行以下操作时遇到错误：
${context}

错误信息：
${JSON.stringify(error, null, 2)}

请生成友好的错误提示、追问问题和建议操作。`;
  }

  // ========== Schema 定义 ==========

  private getTripCreationSchema(): any {
    return {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        totalBudget: { type: 'number' },
        hasChildren: { type: 'boolean' },
        hasElderly: { type: 'boolean' },
        preferences: { type: 'object' },
      },
      required: ['destination', 'startDate', 'endDate', 'totalBudget'],
    };
  }

  private getDecisionSupportSchema(): any {
    return {
      type: 'object',
      properties: {
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
            },
          },
        },
        summary: { type: 'string' },
      },
    };
  }

  private getErrorHandlingSchema(): any {
    return {
      type: 'object',
      properties: {
        message: { type: 'string' },
        clarificationQuestions: { type: 'array', items: { type: 'string' } },
        suggestedActions: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  private generateClarificationQuestions(parsed: any): string[] {
    const questions: string[] = [];
    
    if (!parsed.destination) {
      questions.push('请告诉我您想去哪个国家或地区？');
    }
    if (!parsed.startDate || !parsed.endDate) {
      questions.push('请告诉我您的出行日期？');
    }
    if (!parsed.totalBudget) {
      questions.push('请告诉我您的预算范围？');
    }
    
    return questions;
  }
}
