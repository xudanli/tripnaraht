// src/common/utils/http-client.factory.ts

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * HTTP 客户端工厂
 * 
 * 统一创建和配置 axios 实例，减少重复代码
 */
export class HttpClientFactory {
  /**
   * 创建标准 HTTP 客户端
   */
  static create(config: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    params?: Record<string, any>;
  }): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      timeout: config.timeout ?? 15000,
      headers: {
        'Accept': 'application/json',
        ...config.headers,
      },
    };

    if (config.baseURL) {
      axiosConfig.baseURL = config.baseURL;
    }

    if (config.params) {
      axiosConfig.params = config.params;
    }

    return axios.create(axiosConfig);
  }

  /**
   * 创建带 API Key 的 HTTP 客户端（用于 OpenWeather 等）
   */
  static createWithApiKey(
    apiKey: string | undefined,
    config: {
      baseURL?: string;
      timeout?: number;
      paramName?: string; // API Key 参数名，默认为 'appid'
      additionalParams?: Record<string, any>;
    }
  ): AxiosInstance {
    const paramName = config.paramName || 'appid';
    const params: Record<string, any> = {
      [paramName]: apiKey || '',
      ...config.additionalParams,
    };

    return this.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      params,
    });
  }
}

