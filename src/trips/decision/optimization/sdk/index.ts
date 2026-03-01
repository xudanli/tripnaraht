/**
 * SDK 模块导出
 *
 * P3.4 优化：多语言客户端 SDK
 */

// SDK 生成器
export { SDKGeneratorService } from './sdk-generator.service';
export type {
  ApiEndpoint,
  ParameterDefinition,
  TypeDefinition,
  PropertyDefinition,
  SDKConfig,
  GeneratedSDK,
  GeneratedFile,
} from './sdk-generator.service';

// 稳定版 SDK 客户端
export {
  StableSDKClient,
  DecisionOSClient,
  createDecisionOSClient,
} from './stable-sdk-client';
export type {
  SDKClientConfig,
  RetryConfig,
  RateLimitConfig,
  OfflineConfig,
  SDKLogger,
  Interceptors,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  RequestConfig,
  SDKResponse,
  SDKError,
  DecisionRequest,
  DecisionResponse,
  FeedbackRequest,
  FeedbackResponse,
} from './stable-sdk-client';
