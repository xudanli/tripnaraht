/**
 * Entity Resolution Qdrant seeding 用轻量 Embedding 客户端（BGE-M3 via Python AI Service）。
 */

import axios, { type AxiosInstance } from 'axios';
import https from 'https';

export class ErQdrantEmbeddingClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://101.37.240.9:18001') {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
      proxy: false,
      httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.http.post('/api/v1/embeddings', {
      texts: [text],
      model: 'bge-m3',
      return_sparse: false,
    });

    const embeddings = response.data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length === 0) {
      throw new Error('Python AI Service 返回格式错误');
    }

    const first = embeddings[0];
    return Array.isArray(first) ? first : (first.dense ?? first);
  }

  async generateEmbeddingsBatch(
    texts: string[],
    batchSize = 8,
    onProgress?: (done: number, total: number) => void,
  ): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.http.post('/api/v1/embeddings', {
        texts: batch,
        model: 'bge-m3',
        return_sparse: false,
      });

      const embeddings = response.data?.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
        throw new Error(`Embedding batch 返回数量不匹配: expected ${batch.length}`);
      }

      for (const item of embeddings) {
        results.push(Array.isArray(item) ? item : (item.dense ?? item));
      }

      onProgress?.(Math.min(i + batchSize, texts.length), texts.length);
    }

    return results;
  }
}
