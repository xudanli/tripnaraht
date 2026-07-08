import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CanonicalPoiResolutionController } from './canonical-poi-resolution.controller';
import { CanonicalPoiResolutionService } from './services/canonical-poi-resolution.service';
import { PoiAliasRegistryService } from './services/poi-alias-registry.service';
import { PoiAliasSeedService } from './services/poi-alias-seed.service';
import { PoiAliasLearningService } from './services/poi-alias-learning.service';
import { CpreEntityResolutionBridge } from './adapters/cpre-entity-resolution.bridge';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CanonicalPoiResolutionController],
  providers: [
    PoiAliasSeedService,
    PoiAliasRegistryService,
    CanonicalPoiResolutionService,
    PoiAliasLearningService,
    CpreEntityResolutionBridge,
  ],
  exports: [
    CanonicalPoiResolutionService,
    PoiAliasRegistryService,
    PoiAliasLearningService,
    CpreEntityResolutionBridge,
  ],
})
export class CanonicalPoiResolutionModule {}
