// src/knowledge-base/interfaces/knowledge-base.interface.ts

/**
 * 知识库相关接口定义
 */

export interface KBFileData {
  filename: string;
  filepath: string;
  content: any;
  metadata: {
    version: string;
    credibility_score: number;
    language: string;
    data_sources: string[];
    last_updated: string;
  };
}

export interface Chunk {
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  section?: string;
  metadata?: any;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}
