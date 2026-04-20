import { Injectable } from '@nestjs/common';
import type { Chunk, KBFileData } from '../interfaces/knowledge-base.interface';

/** Nest 注入 token：可替换为 LLM / 规则抽取等实现 */
export const INDEXING_EXTRACTION_MIDDLEWARE = Symbol('INDEXING_EXTRACTION_MIDDLEWARE');

/**
 * 索引管线中的「抽取 / 富化」钩子：在 **分块之后、向量化之前** 执行，
 * 便于对 `content`、`metadata`、`keywords` 等做自动处理；修改会进入 embedding 与入库。
 */
export interface IndexingExtractionMiddleware {
  run(ctx: IndexingExtractionContext): Promise<void> | void;
}

export type IndexingExtractionContext = {
  file: KBFileData;
  fileId: string;
  fileCategory: string;
  /** 当前 chunk，可原地修改 */
  chunk: Chunk;
  chunkIndex: number;
  totalChunks: number;
};

@Injectable()
export class NoopIndexingExtractionMiddleware implements IndexingExtractionMiddleware {
  async run(): Promise<void> {}
}
