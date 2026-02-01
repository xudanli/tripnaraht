// src/kpu/services/kpu-config.service.ts
/**
 * KPU配置服务
 * 
 * 提供KPU相关的配置管理
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KPUConfig {
  enableSnippetValidation: boolean;
  minValidationScore: number;
  enableFactCheck: boolean;
  enableConsistencyCheck: boolean;
  enableCitationCheck: boolean;
  cacheTTL: number;
  cacheEnabled: boolean;
  cacheMemorySize: number;
  cacheRedisEnabled: boolean;
  defaultLlmProvider: string;
  maxConcurrentValidations: number;
  maxConcurrentGenerations: number;
  validationTimeout: number;
  generationTimeout: number;
}

@Injectable()
export class KPUConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取KPU配置
   */
  getConfig(): KPUConfig {
    return {
      enableSnippetValidation: this.configService.get<boolean>('kpu.enableSnippetValidation', true),
      minValidationScore: this.configService.get<number>('kpu.minValidationScore', 0.6),
      enableFactCheck: this.configService.get<boolean>('kpu.enableFactCheck', true),
      enableConsistencyCheck: this.configService.get<boolean>('kpu.enableConsistencyCheck', true),
      enableCitationCheck: this.configService.get<boolean>('kpu.enableCitationCheck', true),
      cacheTTL: this.configService.get<number>('kpu.cacheTTL', 3600),
      cacheEnabled: this.configService.get<boolean>('kpu.cacheEnabled', true),
      cacheMemorySize: this.configService.get<number>('kpu.cacheMemorySize', 1000),
      cacheRedisEnabled: this.configService.get<boolean>('kpu.cacheRedisEnabled', true),
      defaultLlmProvider: this.configService.get<string>('kpu.defaultLlmProvider', 'DEEPSEEK'),
      maxConcurrentValidations: this.configService.get<number>('kpu.maxConcurrentValidations', 10),
      maxConcurrentGenerations: this.configService.get<number>('kpu.maxConcurrentGenerations', 5),
      validationTimeout: this.configService.get<number>('kpu.validationTimeout', 5000),
      generationTimeout: this.configService.get<number>('kpu.generationTimeout', 10000),
    };
  }

  /**
   * 获取默认验证选项
   */
  getDefaultValidationOptions() {
    const config = this.getConfig();
    return {
      enableFactCheck: config.enableFactCheck,
      enableConsistencyCheck: config.enableConsistencyCheck,
      enableCitationCheck: config.enableCitationCheck,
    };
  }
}
