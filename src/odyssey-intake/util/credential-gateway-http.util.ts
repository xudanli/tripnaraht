import { Logger } from '@nestjs/common';

const logger = new Logger('CredentialGatewayHttp');

export class CredentialGatewayHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'CredentialGatewayHttpError';
  }
}

export interface CredentialGatewayRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  apiKey?: string | null;
}

export async function credentialGatewayFetchJson<T>(
  url: string,
  options: CredentialGatewayRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'POST';
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetries = options.maxRetries ?? 3;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };

  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body != null ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '1');
        if (attempt < maxRetries) {
          await sleep(Math.max(retryAfter, 1) * 1000);
          continue;
        }
        throw new CredentialGatewayHttpError('授信网关限流，请稍后重试', 429, true);
      }

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new CredentialGatewayHttpError(
            `授信网关响应非 JSON (${response.status})`,
            response.status,
            response.status >= 500,
          );
        }
      }

      if (response.status >= 400) {
        const message =
          extractErrorMessage(payload) ??
          `授信网关错误 (${response.status})`;
        throw new CredentialGatewayHttpError(message, response.status, response.status >= 500);
      }

      return payload as T;
    } catch (error: unknown) {
      clearTimeout(timer);
      lastError = error;

      const retryable =
        error instanceof CredentialGatewayHttpError
          ? error.retryable
          : isAbortOrNetworkError(error);

      if (retryable && attempt < maxRetries) {
        await sleep(2 ** attempt * 300);
        continue;
      }

      if (error instanceof CredentialGatewayHttpError) throw error;
      throw new CredentialGatewayHttpError(
        error instanceof Error ? error.message : '授信网关请求失败',
        undefined,
        false,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new CredentialGatewayHttpError('授信网关请求失败');
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.error === 'string') return obj.error;
  if (obj.error && typeof obj.error === 'object' && typeof (obj.error as any).message === 'string') {
    return (obj.error as any).message;
  }
  return null;
}

function isAbortOrNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || /fetch failed|network/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
