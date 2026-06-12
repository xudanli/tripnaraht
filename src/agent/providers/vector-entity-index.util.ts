/**
 * 向量实体索引工具：余弦相似度粗筛（Week 3 P0 POC）。
 */

import type { EntityCandidate } from '../services/query-rewriting-dictionary.service';

export interface VectorIndexEntry {
  label: string;
  kind: 'destination' | 'poi';
  embedding: number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankVectorIndex(
  index: VectorIndexEntry[],
  queryVector: number[],
  limit: number,
  scoreThreshold: number,
): EntityCandidate[] {
  const scored = index
    .map((entry) => ({
      label: entry.label,
      kind: entry.kind,
      score: cosineSimilarity(queryVector, entry.embedding),
    }))
    .filter((x) => x.score >= scoreThreshold)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => ({
    label: x.label,
    kind: x.kind,
    score: x.score,
  }));
}
