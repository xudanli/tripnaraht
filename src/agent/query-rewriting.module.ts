import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RedisModule } from '../redis/redis.module';
import { PlacesEmbeddingModule } from '../places/places-embedding.module';
import { QueryRewritingService } from './services/query-rewriting.service';
import { QueryRewritingDictionaryService } from './services/query-rewriting-dictionary.service';
import { QueryRewriteMetricsService } from './services/query-rewrite-metrics.service';
import { StaticEntityResolutionCacheService } from './services/static-entity-resolution-cache.service';
import { RedisEntityResolutionProvider } from './providers/redis-entity-resolution.provider';
import { VectorEntityResolutionProvider } from './providers/vector-entity-resolution.provider';

@Module({
  imports: [LlmModule, RedisModule, PlacesEmbeddingModule],
  providers: [
    VectorEntityResolutionProvider,
    RedisEntityResolutionProvider,
    StaticEntityResolutionCacheService,
    {
      provide: QueryRewritingDictionaryService,
      useFactory: (redisEr: RedisEntityResolutionProvider) =>
        new QueryRewritingDictionaryService(redisEr),
      inject: [RedisEntityResolutionProvider],
    },
    QueryRewriteMetricsService,
    QueryRewritingService,
  ],
  exports: [
    VectorEntityResolutionProvider,
    RedisEntityResolutionProvider,
    StaticEntityResolutionCacheService,
    QueryRewritingDictionaryService,
    QueryRewriteMetricsService,
    QueryRewritingService,
  ],
})
export class QueryRewritingModule {}
