// src/knowledge-base/knowledge-base.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PlacesModule } from '../places/places.module';
import { LoaderService } from './services/loader.service';
import { ChunkingService } from './services/chunking.service';
import { IndexingService } from './services/indexing.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlacesModule), // 使用forwardRef避免循环依赖（PlacesModule -> RagModule -> KnowledgeBaseModule）
    ConfigModule,
  ],
  providers: [LoaderService, ChunkingService, IndexingService],
  exports: [LoaderService, ChunkingService, IndexingService],
})
export class KnowledgeBaseModule {}
