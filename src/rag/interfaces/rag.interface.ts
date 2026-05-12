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
  /** 标准六集合之一或旧别名（如 travel_guides → routes）；参见 knowledge-taxonomy */
  collection: string;
  /** 业务子类型 slug，须属于该 collection 的允许列表；可空（迁移期旧数据） */
  subType?: string | null;
  title: string;
  content: string;
  source?: string;
  countryCode?: string;
  tags?: string[];
  /** 扩展字段；可含 taxonomy_version、source_doc、route_duration_bucket 等 */
  metadata?: Record<string, any>;
}

