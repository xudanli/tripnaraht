/**
 * RAG 链路 Query Rewriting 多路召回灰度开关。
 *
 * 环境变量 QUERY_REWRITE_RAG_EXPANSION_ENABLED=1 时，
 * ChunkRetrievalService.retrieve 传入 useQueryExpansion: true。
 */

import type { ChunkRetrievalParams } from '../../rag/services/chunk-retrieval.service';

export function isQueryRewriteRagExpansionEnabled(): boolean {
  const v = process.env.QUERY_REWRITE_RAG_EXPANSION_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** 灰度开启时合并到 retrieve 参数的 expansion 字段 */
export function ragRetrievalExpansionParams(): Pick<
  ChunkRetrievalParams,
  'useQueryExpansion' | 'maxQueryVariants'
> {
  if (!isQueryRewriteRagExpansionEnabled()) {
    return {};
  }
  return {
    useQueryExpansion: true,
    maxQueryVariants: Number(process.env.QUERY_REWRITE_RAG_MAX_VARIANTS ?? 3),
  };
}
