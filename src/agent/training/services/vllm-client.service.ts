import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { AxiosResponse } from 'axios';

/**
 * vLLM 模型信息
 */
export interface VllmModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * LoRA 适配器信息
 */
export interface LoraAdapter {
  name: string;
  path: string;
  base_model: string;
  rank: number;
  loaded: boolean;
}

/**
 * 生成请求
 */
export interface GenerateRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  lora_adapter?: string;
}

/**
 * 生成响应
 */
export interface GenerateResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * TripNARA vLLM 客户端服务
 * 
 * 职责：
 * 1. 与 vLLM 推理服务通信
 * 2. 管理 LoRA 适配器的加载/卸载
 * 3. 支持 OpenAI 兼容 API 调用
 * 4. 模型路由和负载均衡
 */
@Injectable()
export class VllmClientService implements OnModuleInit {
  private readonly logger = new Logger(VllmClientService.name);
  
  /** vLLM 服务地址 */
  private vllmUrl: string;
  
  /** API 密钥（如果设置） */
  private apiKey?: string;
  
  /** 服务是否可用 */
  private isAvailable: boolean = false;
  
  /** 已加载的 LoRA 适配器 */
  private loadedAdapters: Map<string, LoraAdapter> = new Map();
  
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.vllmUrl = this.configService.get<string>('VLLM_URL') || 'http://localhost:8080';
    this.apiKey = this.configService.get<string>('VLLM_API_KEY');
  }
  
  async onModuleInit() {
    this.logger.log(`VllmClientService initialized, vLLM URL: ${this.vllmUrl}`);
    
    // 检查 vLLM 服务健康状态
    await this.checkHealth();
    
    if (this.isAvailable) {
      // 获取已加载的模型和适配器
      await this.refreshModelInfo();
    }
  }
  
  /**
   * 获取请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return headers;
  }
  
  /**
   * 检查 vLLM 服务健康状态
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.vllmUrl}/health`, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(5000),
          catchError(() => of({ data: null })),
        ),
      );
      
      this.isAvailable = (response as AxiosResponse).data !== null;
      
      if (this.isAvailable) {
        this.logger.log('vLLM service is healthy');
      } else {
        this.logger.warn('vLLM service is not available');
      }
      
      return this.isAvailable;
    } catch (error: any) {
      this.logger.warn(`vLLM health check failed: ${error?.message || error}`);
      this.isAvailable = false;
      return false;
    }
  }
  
  /**
   * 服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }
  
  /**
   * 刷新模型信息
   */
  async refreshModelInfo(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.vllmUrl}/v1/models`, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(10000),
        ),
      );
      
      const models = (response as AxiosResponse).data?.data || [];
      this.logger.log(`Available models: ${models.map((m: any) => m.id).join(', ')}`);
    } catch (error: any) {
      this.logger.warn(`Failed to get model info: ${error?.message || error}`);
    }
  }
  
  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<VllmModelInfo[]> {
    if (!this.isAvailable) {
      return [];
    }
    
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.vllmUrl}/v1/models`, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(10000),
        ),
      );
      
      return (response as AxiosResponse).data?.data || [];
    } catch (error: any) {
      this.logger.error(`Failed to list models: ${error?.message || error}`);
      return [];
    }
  }
  
  /**
   * 生成文本（OpenAI 兼容 API）
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!this.isAvailable) {
      throw new Error('vLLM service is not available');
    }
    
    const startTime = Date.now();
    
    try {
      // 构建请求体
      const body: any = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2048,
        top_p: request.top_p ?? 0.95,
        stream: request.stream ?? false,
      };
      
      // 如果指定了 LoRA 适配器
      if (request.lora_adapter) {
        body.model = `${request.model}:${request.lora_adapter}`;
      }
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.vllmUrl}/v1/chat/completions`, body, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(120000), // 2 分钟超时
        ),
      );
      
      const duration = Date.now() - startTime;
      this.logger.debug(`Generation completed in ${duration}ms, tokens: ${(response as AxiosResponse).data?.usage?.total_tokens}`);
      
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Generation failed: ${error?.message || error}`);
      throw error;
    }
  }
  
  /**
   * 加载 LoRA 适配器（热加载）
   */
  async loadLoraAdapter(name: string, path: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('vLLM service is not available');
    }
    
    this.logger.log(`Loading LoRA adapter: ${name} from ${path}`);
    
    try {
      // vLLM 支持通过 API 动态加载 LoRA
      // 注意：需要 vLLM 启动时启用 --enable-lora
      const response = await firstValueFrom(
        this.httpService.post(`${this.vllmUrl}/v1/lora/load`, {
          lora_name: name,
          lora_path: path,
        }, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(60000),
        ),
      );
      
      const respData = (response as AxiosResponse).data;
      if (respData?.success) {
        this.loadedAdapters.set(name, {
          name,
          path,
          base_model: respData?.base_model || 'unknown',
          rank: respData?.rank || 64,
          loaded: true,
        });
        
        this.logger.log(`LoRA adapter loaded: ${name}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      // 如果 API 不支持动态加载，记录警告
      if (error?.response?.status === 404) {
        this.logger.warn('vLLM does not support dynamic LoRA loading via API');
        this.logger.warn('LoRA adapters must be specified at startup via --lora-modules');
      } else {
        this.logger.error(`Failed to load LoRA adapter: ${error?.message || error}`);
      }
      return false;
    }
  }
  
  /**
   * 卸载 LoRA 适配器
   */
  async unloadLoraAdapter(name: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('vLLM service is not available');
    }
    
    this.logger.log(`Unloading LoRA adapter: ${name}`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.vllmUrl}/v1/lora/unload`, {
          lora_name: name,
        }, {
          headers: this.getHeaders(),
        }).pipe(
          timeout(30000),
        ),
      );
      
      if ((response as AxiosResponse).data?.success) {
        this.loadedAdapters.delete(name);
        this.logger.log(`LoRA adapter unloaded: ${name}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to unload LoRA adapter: ${error?.message || error}`);
      return false;
    }
  }
  
  /**
   * 获取已加载的 LoRA 适配器列表
   */
  getLoadedAdapters(): LoraAdapter[] {
    return Array.from(this.loadedAdapters.values());
  }
  
  /**
   * TripNARA 决策生成
   */
  async generateDecision(options: {
    systemPrompt?: string;
    userRequest: string;
    loraAdapter?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    content: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    latency_ms: number;
  }> {
    const startTime = Date.now();
    
    const defaultSystemPrompt = `你是 TripNARA，一个专业的旅行决策助手。你的任务是：
1. 理解用户的旅行需求
2. 识别硬性约束（不可违反）和软性偏好（可权衡）
3. 生成多个方案（Plan A/B/C），每个方案带风险概率
4. 提供清晰的决策理由

请使用三人格策略思考：
- Abu：安全检查，识别风险红线
- Dr.Dre：节奏评估，权衡取舍
- Neptune：空间修复，保持路线哲学`;
    
    const messages = [
      {
        role: 'system' as const,
        content: options.systemPrompt || defaultSystemPrompt,
      },
      {
        role: 'user' as const,
        content: options.userRequest,
      },
    ];
    
    const response = await this.generate({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      lora_adapter: options.loraAdapter,
    });
    
    const latencyMs = Date.now() - startTime;
    
    return {
      content: response.choices[0]?.message?.content || '',
      usage: response.usage,
      latency_ms: latencyMs,
    };
  }
  
  /**
   * 批量生成（用于评估）
   */
  async batchGenerate(requests: Array<{
    id: string;
    messages: GenerateRequest['messages'];
  }>, options?: {
    loraAdapter?: string;
    concurrency?: number;
  }): Promise<Array<{
    id: string;
    content: string;
    latency_ms: number;
    error?: string;
  }>> {
    const concurrency = options?.concurrency || 4;
    const results: Array<{
      id: string;
      content: string;
      latency_ms: number;
      error?: string;
    }> = [];
    
    // 分批处理
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (req) => {
        const startTime = Date.now();
        try {
          const response = await this.generate({
            model: 'Qwen/Qwen2.5-7B-Instruct',
            messages: req.messages,
            lora_adapter: options?.loraAdapter,
          });
          
          return {
            id: req.id,
            content: response.choices[0]?.message?.content || '',
            latency_ms: Date.now() - startTime,
          };
        } catch (error: any) {
          return {
            id: req.id,
            content: '',
            latency_ms: Date.now() - startTime,
            error: error?.message || String(error),
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
}
