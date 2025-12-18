// src/llm/utils/openai-http.factory.ts
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Logger } from '@nestjs/common';

/**
 * 创建统一的 OpenAI HTTP 客户端
 * 
 * 所有 OpenAI API 调用（chat/completions, embeddings, images 等）都应该使用这个工厂函数
 * 确保代理配置、IPv4 设置、超时等配置一致
 */
export function createOpenAIHttp(
  baseURL: string = 'https://api.openai.com/v1',
  logger?: Logger
): AxiosInstance {
  // 检查代理环境变量
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;

  if (proxyUrl && logger) {
    logger.debug(`Using proxy: ${proxyUrl}`);
  } else if (!proxyUrl && logger) {
    logger.warn('No proxy env found, but curl shows CONNECT; check your shell env / network proxy.');
  }

  // 处理 baseURL
  let processedBaseUrl = baseURL;
  
  // 确保使用 HTTPS（OpenAI API 要求）
  if (processedBaseUrl.startsWith('http://')) {
    if (logger) {
      logger.warn(`OPENAI_BASE_URL uses HTTP, converting to HTTPS: ${processedBaseUrl}`);
    }
    processedBaseUrl = processedBaseUrl.replace('http://', 'https://');
  }
  
  // 确保 URL 以 https:// 开头
  if (!processedBaseUrl.startsWith('https://')) {
    throw new Error(`OPENAI_BASE_URL must start with https://, got: ${processedBaseUrl}`);
  }
  
  // 移除末尾的斜杠（如果有）
  processedBaseUrl = processedBaseUrl.replace(/\/$/, '');

  // 创建 HTTPS Agent（显式代理或直接连接）
  const httpsAgent = proxyUrl
    ? new HttpsProxyAgent<string>(proxyUrl)
    : new https.Agent({
        keepAlive: true,
        family: 4, // 强制 IPv4
      });

  // 创建 OpenAI HTTP 客户端实例
  return axios.create({
    baseURL: processedBaseUrl,
    timeout: 60000,
    proxy: false, // ✅ 关键：禁止 axios 自己处理 proxy 逻辑
    httpsAgent, // ✅ 关键：我们自己指定走哪个代理
    httpAgent: proxyUrl ? new HttpsProxyAgent<string>(proxyUrl) : undefined, // HTTP 也走代理（如果需要）
    headers: { 'Content-Type': 'application/json' },
  });
}

