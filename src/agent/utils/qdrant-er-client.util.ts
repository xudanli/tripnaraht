/**
 * Qdrant REST 客户端 — Entity Resolution 集合管理（Week 3.1）。
 */

export const ER_QDRANT_COLLECTION = 'tripnara_er_entities';

const QDRANT_URL_FALLBACKS = [
  'http://127.0.0.1:6333',
  'http://localhost:6333',
] as const;

/** 解析可用 Qdrant URL：优先 env，再试本机 fallback */
export async function resolveQdrantBaseUrl(
  configured?: string,
): Promise<string | undefined> {
  const candidates = [
    configured?.trim(),
    ...QDRANT_URL_FALLBACKS,
  ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

  for (const url of candidates) {
    const client = new QdrantErClient(url);
    if (await client.healthCheck()) return url;
  }
  return undefined;
}

export interface ErQdrantPointPayload {
  standard_name: string;
  kind: 'destination' | 'poi';
  entity_id: string;
  parent_destination?: string;
}

export interface ErQdrantUpsertPoint {
  id: number;
  vector: number[];
  payload: ErQdrantPointPayload;
}

export class QdrantErClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.url('/collections'), { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async collectionExists(): Promise<boolean> {
    const res = await fetch(this.url(`/collections/${ER_QDRANT_COLLECTION}`), {
      method: 'GET',
    });
    return res.ok;
  }

  async createCollection(vectorSize: number): Promise<void> {
    const res = await fetch(this.url(`/collections/${ER_QDRANT_COLLECTION}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Qdrant create collection failed HTTP ${res.status}: ${body}`);
    }
  }

  async deleteCollection(): Promise<void> {
    const res = await fetch(this.url(`/collections/${ER_QDRANT_COLLECTION}`), {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Qdrant delete collection failed HTTP ${res.status}: ${body}`);
    }
  }

  async upsertPoints(points: ErQdrantUpsertPoint[]): Promise<void> {
    const res = await fetch(
      this.url(`/collections/${ER_QDRANT_COLLECTION}/points?wait=true`),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Qdrant upsert failed HTTP ${res.status}: ${body}`);
    }
  }

  async getCollectionInfo(): Promise<{ points_count?: number; vector_size?: number }> {
    const res = await fetch(this.url(`/collections/${ER_QDRANT_COLLECTION}`), {
      method: 'GET',
    });
    if (!res.ok) {
      throw new Error(`Qdrant get collection HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      result?: {
        points_count?: number;
        config?: { params?: { vectors?: { size?: number } } };
      };
    };
    return {
      points_count: body.result?.points_count,
      vector_size: body.result?.config?.params?.vectors?.size,
    };
  }
}
