/**
 * Translation Direct Service
 * 
 * 直接使用 Google Cloud Translation API，不依赖 Smithery MCP 服务
 * 支持文本翻译、批量翻译、检测语言等功能
 * 支持用户级别的语言偏好设置
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface TranslationParams {
  text: string | string[]; // 单个文本或文本数组
  target: string; // 目标语言代码（如 'en', 'zh', 'ja'）
  source?: string; // 源语言代码（可选，自动检测）
  format?: 'text' | 'html'; // 文本格式
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
  originalText: string;
}

@Injectable()
export class TranslationDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationDirectService.name);
  private axiosInstance: AxiosInstance;
  private apiKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly baseUrl = 'https://translation.googleapis.com/language/translate/v2';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = 
      this.configService.get<string>('GOOGLE_TRANSLATE_API_KEY') || 
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') || 
      process.env.GOOGLE_TRANSLATE_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      null;
  }

  async onModuleInit() {
    if (this.apiKey) {
      // 初始化 HTTP 客户端（支持代理）
      const proxyUrl =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;
      
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent<string>(proxyUrl)
        : new https.Agent({
            keepAlive: true,
            family: 4, // 强制 IPv4
            rejectUnauthorized: true,
          });

      this.axiosInstance = axios.create({
        baseURL: this.baseUrl,
        timeout: 30000,
        httpsAgent,
        proxy: false,
        headers: {
          'User-Agent': 'TripNARA/1.0',
        },
      });

      // 测试连接
      try {
        const testResponse = await this.axiosInstance.post('', null, {
          params: {
            q: 'Hello',
            target: 'zh',
            key: this.apiKey,
          },
        });
        
        if (testResponse.data && testResponse.data.data) {
          this.isAvailable = true;
          this.logger.log('Translation Direct Service initialized');
        } else {
          this.logger.warn('Google Translate API test returned unexpected format');
          this.isAvailable = false;
        }
      } catch (error: any) {
        this.logger.error('Failed to initialize Translation Direct Service:', error.message);
        this.isAvailable = false;
      }
    } else {
      this.logger.warn('Google Translate API Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Translation Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && !!this.apiKey;
  }

  /**
   * 翻译文本
   */
  async translate(params: TranslationParams): Promise<TranslationResult | TranslationResult[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Translate API Key not configured');
    }

    try {
      const isArray = Array.isArray(params.text);
      const texts = isArray ? params.text : [params.text];

      const requestParams: any = {
        q: texts,
        target: params.target,
        key: this.apiKey!,
      };

      if (params.source) {
        requestParams.source = params.source;
      }

      if (params.format) {
        requestParams.format = params.format;
      }

      const response = await this.axiosInstance.post('', null, {
        params: requestParams,
      });

      if (!response.data || !response.data.data || !response.data.data.translations) {
        throw new Error('Invalid response from Google Translate API');
      }

      const translations = response.data.data.translations;
      const results = translations.map((translation: any, index: number) => ({
        translatedText: translation.translatedText,
        detectedSourceLanguage: translation.detectedSourceLanguage,
        originalText: texts[index],
      }));

      return isArray ? results : results[0];
    } catch (error: any) {
      this.logger.error('Failed to translate text:', error.message);
      throw error;
    }
  }

  /**
   * 检测语言
   */
  async detectLanguage(text: string): Promise<{
    language: string;
    confidence: number;
  }> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Translate API Key not configured');
    }

    try {
      const response = await this.axiosInstance.post('/detect', null, {
        params: {
          q: text,
          key: this.apiKey!,
        },
      });

      if (!response.data || !response.data.data || !response.data.data.detections) {
        throw new Error('Invalid response from Google Translate API');
      }

      const detections = response.data.data.detections[0];
      if (!detections || detections.length === 0) {
        throw new Error('Language detection failed');
      }

      const detection = detections[0];
      return {
        language: detection.language,
        confidence: detection.confidence || 1.0,
      };
    } catch (error: any) {
      this.logger.error('Failed to detect language:', error.message);
      throw error;
    }
  }

  /**
   * 获取支持的语言列表
   */
  async getSupportedLanguages(targetLanguage?: string): Promise<Array<{
    language: string;
    name: string;
  }>> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Translate API Key not configured');
    }

    try {
      const params: any = {
        key: this.apiKey!,
      };

      if (targetLanguage) {
        params.target = targetLanguage;
      }

      const response = await this.axiosInstance.get('/languages', {
        params,
      });

      if (!response.data || !response.data.data || !response.data.data.languages) {
        throw new Error('Invalid response from Google Translate API');
      }

      return response.data.data.languages;
    } catch (error: any) {
      this.logger.error('Failed to get supported languages:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户翻译设置
   */
  async getUserTranslationSettings(userId: string): Promise<{
    defaultTargetLanguage: string;
    preferredLanguages: string[];
    autoDetect: boolean;
  } | null> {
    try {
      const settings = await this.prisma.translationSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        return null;
      }

      return {
        defaultTargetLanguage: settings.defaultTargetLanguage || 'en',
        preferredLanguages: (settings.preferredLanguages as string[]) || [],
        autoDetect: settings.autoDetect ?? true,
      };
    } catch (error: any) {
      this.logger.error('Failed to get user translation settings:', error.message);
      throw error;
    }
  }

  /**
   * 保存用户翻译设置
   */
  async saveUserTranslationSettings(
    userId: string,
    settings: {
      defaultTargetLanguage?: string;
      preferredLanguages?: string[];
      autoDetect?: boolean;
    }
  ): Promise<void> {
    try {
      await this.prisma.translationSettings.upsert({
        where: { userId },
        create: {
          userId,
          defaultTargetLanguage: settings.defaultTargetLanguage || 'en',
          preferredLanguages: settings.preferredLanguages || [],
          autoDetect: settings.autoDetect ?? true,
        },
        update: {
          defaultTargetLanguage: settings.defaultTargetLanguage,
          preferredLanguages: settings.preferredLanguages,
          autoDetect: settings.autoDetect,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error('Failed to save user translation settings:', error.message);
      throw error;
    }
  }

  /**
   * 智能翻译（基于用户设置）
   */
  async smartTranslate(
    userId: string,
    text: string,
    targetLanguage?: string
  ): Promise<TranslationResult> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Translate API Key not configured');
    }

    try {
      // 获取用户设置
      const settings = await this.getUserTranslationSettings(userId);
      const target = targetLanguage || settings?.defaultTargetLanguage || 'en';

      // 如果启用自动检测，先检测语言
      let sourceLanguage: string | undefined;
      if (settings?.autoDetect !== false) {
        try {
          const detection = await this.detectLanguage(text);
          sourceLanguage = detection.language;
        } catch (error: any) {
          this.logger.warn('Failed to detect language, proceeding without source:', error.message);
        }
      }

      // 翻译
      const result = await this.translate({
        text,
        target,
        source: sourceLanguage,
      });

      return Array.isArray(result) ? result[0] : result;
    } catch (error: any) {
      this.logger.error('Failed to smart translate:', error.message);
      throw error;
    }
  }
}
