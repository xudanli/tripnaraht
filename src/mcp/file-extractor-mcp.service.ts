/**
 * File Extractor MCP Service
 * 
 * 提供 File Extractor MCP 服务的业务逻辑
 */

import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { FileExtractorMcpClient } from './file-extractor-client';
import { FileExtractorDirectService } from './file-extractor-direct.service';

@Injectable()
export class FileExtractorMcpService implements OnModuleInit {
  private readonly logger = new Logger(FileExtractorMcpService.name);
  private client: FileExtractorMcpClient | null = null;
  private isAvailableFlag = false;
  private useDirectService = false;

  constructor(
    @Optional() @Inject(FileExtractorDirectService)
    private readonly directService?: FileExtractorDirectService,
  ) {}

  async onModuleInit() {
    // 检查是否禁用 MCP 服务（优先使用 Direct Service）
    const enableMcpService = process.env.ENABLE_FILE_EXTRACTOR_MCP !== 'false';
    
    if (!enableMcpService) {
      this.logger.log('File Extractor MCP service disabled (ENABLE_FILE_EXTRACTOR_MCP=false), using Direct Service');
      this.isAvailableFlag = false;
      this.useDirectService = this.directService?.isServiceAvailable() || false;
      if (this.useDirectService) {
        this.logger.log('✅ File Extractor Direct Service is available');
      }
      return;
    }

    // 尝试连接 MCP 服务
    try {
      this.client = new FileExtractorMcpClient();
      await this.client.connect();
      this.isAvailableFlag = true;
      this.useDirectService = false;
      this.logger.log('✅ File Extractor MCP service initialized');
    } catch (error: any) {
      this.logger.warn('Failed to initialize File Extractor MCP service:', error.message);
      this.logger.log('Will use direct service as fallback if available');
      this.isAvailableFlag = false;
      this.useDirectService = this.directService?.isServiceAvailable() || false;
      if (this.useDirectService) {
        this.logger.log('✅ File Extractor Direct Service is available as fallback');
      } else {
        this.logger.warn('⚠️  Neither MCP nor Direct Service is available');
      }
    }
  }

  /**
   * 检查服务是否可用（包括降级到直接服务）
   */
  isAvailable(): boolean {
    return (this.isAvailableFlag && this.client !== null) || this.useDirectService;
  }

  /**
   * 提取文件元数据（支持降级到直接服务）
   */
  async extractMetadata(url: string): Promise<any> {
    // 优先使用 MCP 服务
    if (this.isAvailableFlag && this.client) {
      try {
        return await this.client.extractMetadata(url);
      } catch (error: any) {
        this.logger.warn('MCP service failed, falling back to direct service:', error.message);
        // 降级到直接服务
        if (this.directService?.isServiceAvailable()) {
          return await this.directService.extractMetadata(url);
        }
        throw error;
      }
    }

    // 使用直接服务
    if (this.directService?.isServiceAvailable()) {
      return await this.directService.extractMetadata(url);
    }

    throw new Error('File Extractor service is not available (neither MCP nor direct service)');
  }

  /**
   * 提取文件内容（支持降级到直接服务）
   */
  async extractFileContent(
    url: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      sheet?: string;
      caseSensitive?: boolean;
    }
  ): Promise<any> {
    // 优先使用 MCP 服务
    if (this.isAvailableFlag && this.client) {
      try {
        return await this.client.extractFileContent(url, options);
      } catch (error: any) {
        this.logger.warn('MCP service failed, falling back to direct service:', error.message);
        // 降级到直接服务
        if (this.directService?.isServiceAvailable()) {
          return await this.directService.extractFileContent(url, options);
        }
        throw error;
      }
    }

    // 使用直接服务
    if (this.directService?.isServiceAvailable()) {
      return await this.directService.extractFileContent(url, options);
    }

    throw new Error('File Extractor service is not available (neither MCP nor direct service)');
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('File Extractor MCP service is not available');
    }

    try {
      return await this.client!.listTools();
    } catch (error: any) {
      this.logger.error('Failed to list tools:', error);
      throw error;
    }
  }
}
