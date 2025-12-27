// src/rag/interfaces/rag.interface.ts
/**
 * RAG 相关接口定义
 */

/**
 * RAG 检索结果
 */
export interface RagRetrievalResult {
  id: string;
  content: string;
  title?: string;
  source?: string;
  score: number; // 相似度分数 (0-1)
  metadata?: Record<string, any>;
}

/**
 * RAG 检索参数
 */
export interface RagRetrievalParams {
  query: string;
  collection: string;
  limit?: number;
  countryCode?: string;
  tags?: string[];
  minScore?: number; // 最低相似度阈值
}

/**
 * 文档索引项
 */
export interface DocumentIndexItem {
  id?: string;
  collection: string;
  title: string;
  content: string;
  source?: string;
  countryCode?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

