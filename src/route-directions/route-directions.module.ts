// src/route-directions/route-directions.module.ts
import { Module } from '@nestjs/common';
import { RouteDirectionsController } from './route-directions.controller';
import { RouteDirectionsService } from './route-directions.service';
import { RouteDirectionSelectorService } from './services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from './services/route-direction-poi-generator.service';
import { RouteDirectionObservabilityService } from './services/route-direction-observability.service';
import { RouteDirectionCacheService } from './services/route-direction-cache.service';
import { RouteDirectionCardService } from './services/route-direction-card.service';
import { CompliancePluginService } from './plugins/compliance-plugin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [RouteDirectionsController],
  providers: [
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
    RouteDirectionObservabilityService,
    RouteDirectionCacheService,
    RouteDirectionCardService,
    CompliancePluginService,
    TransportPluginService,
    RouteDirectionExplainerService,
  ],
  exports: [
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
    RouteDirectionObservabilityService,
    RouteDirectionCacheService,
    RouteDirectionCardService,
    CompliancePluginService,
    TransportPluginService,
    RouteDirectionExplainerService,
  ],
})
export class RouteDirectionsModule {}

