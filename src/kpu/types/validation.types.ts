// src/kpu/types/validation.types.ts
/**
 * KPU验证相关类型定义
 */

import { ChunkRetrievalResult } from '../../rag/services/chunk-retrieval.service';

/**
 * 验证后的检索结果
 */
export interface ValidatedRetrievalResult extends ChunkRetrievalResult {
  validation: {
    factCheck: 'pass' | 'fail' | 'unknown';
    sourceCredibility: number; // 0-1
    freshness: number; // 0-1
    completeness: number; // 0-1
    consistency: 'consistent' | 'inconsistent' | 'unknown';
    overallScore: number; // 0-1
  };
  citations: Citation[];
}

/**
 * 引用信息
 */
export interface Citation {
  id: string;
  content: string;
  source: string;
  documentId?: string;
  confidence: number; // 0-1
  position?: {
    field: string;
    paragraph?: number;
    line?: number;
  };
}

/**
 * 知识片段验证参数
 */
export interface SnippetValidationParams {
  content: string;
  source?: string;
  metadata?: Record<string, any>;
  context?: Record<string, any>;
  options?: {
    enableFactCheck: boolean;
    enableConsistencyCheck: boolean;
    enableCitationCheck: boolean;
  };
}

/**
 * 知识片段验证结果
 */
export interface SnippetValidationResult {
  factCheck: 'pass' | 'fail' | 'unknown';
  sourceCredibility: number; // 0-1
  freshness: number; // 0-1
  completeness: number; // 0-1
  consistency: 'consistent' | 'inconsistent' | 'unknown';
  citations?: Citation[];
  details?: string;
}

/**
 * AI输出验证参数
 */
export interface OutputValidationParams {
  output: string;
  sources: ValidatedRetrievalResult[];
  query: string;
  context?: Record<string, any>;
  options?: {
    enableFactCheck: boolean;
    enableConsistencyCheck: boolean;
    enableCitationCheck: boolean;
    enableCompletenessCheck: boolean;
  };
}

/**
 * AI输出验证结果
 */
export interface OutputValidationResult {
  overall: 'pass' | 'fail' | 'warning';
  score: number; // 0-100
  factChecks: Array<{
    id: string;
    description: string;
    passed: boolean;
    details: string;
    sources: string[];
  }>;
  consistencyChecks: Array<{
    id: string;
    type: 'internal' | 'external' | 'contextual';
    passed: boolean;
    details: string;
  }>;
  citations: Citation[];
  warnings: string[];
}

/**
 * 检索并验证参数
 */
export interface RetrievalAndValidateParams {
  query: string;
  limit?: number;
  credibilityMin?: number;
  type?: string;
  category?: string;
  chunkCategory?: string;
  fileId?: string;
  useHybridSearch?: boolean;
  denseWeight?: number;
  sparseWeight?: number;
  useReranking?: boolean;
  rerankTopK?: number;
  useQueryExpansion?: boolean;
  maxQueryVariants?: number;
  useIntentClassification?: boolean;
  // KPU扩展参数
  minValidationScore?: number; // 最低验证得分阈值
  enableSnippetValidation?: boolean; // 是否验证检索片段
  validationOptions?: {
    enableFactCheck: boolean;
    enableConsistencyCheck: boolean;
    enableCitationCheck: boolean;
  };
  context?: Record<string, any>;
}

/**
 * 生成并验证参数
 */
export interface GenerationWithValidationParams {
  query: string;
  validatedResults: ValidatedRetrievalResult[];
  context?: Record<string, any>;
  retryOnFailure?: boolean; // 验证失败时是否重试
  maxRetries?: number;
}

/**
 * 评分因子
 */
export interface ScoringFactors {
  factCheck: 'pass' | 'fail' | 'unknown';
  credibility: number;
  freshness: number;
  completeness: number;
  consistency: 'consistent' | 'inconsistent' | 'unknown';
  similarity: number; // 检索相似度
}
