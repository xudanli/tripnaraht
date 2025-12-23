// src/data-contracts/adapters/base.adapter.ts

import { Logger } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 基础适配器类
 * 
 * 提供通用的功能：
 * - HTTP 客户端创建
 * - 错误处理
 * - 日志记录
 */
export abstract class BaseAdapter {
  protected readonly logger: Logger;
  protected httpClient: AxiosInstance;

  constructor(
    adapterName: string,
    httpConfig: {
      baseURL?: string;
      timeout?: number;
      headers?: Record<string, string>;
      params?: Record<string, any>;
    }
  ) {
    this.logger = new Logger(adapterName);
    this.httpClient = HttpClientFactory.create(httpConfig);
  }

  /**
   * 安全执行 HTTP 请求，自动处理错误
   */
  protected async safeRequest<T>(
    requestFn: () => Promise<T>,
    errorContext: string,
    defaultValue: T
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      this.logger.error(
        `${errorContext}: ${AdapterMapper.extractErrorMessage(error)}`
      );
      return defaultValue;
    }
  }

  /**
   * 安全执行 HTTP 请求，返回 null 而不是默认值
   */
  protected async safeRequestOrNull<T>(
    requestFn: () => Promise<T>,
    errorContext: string
  ): Promise<T | null> {
    try {
      return await requestFn();
    } catch (error) {
      this.logger.debug(
        `${errorContext}: ${AdapterMapper.extractErrorMessage(error)}`
      );
      return null;
    }
  }
}

