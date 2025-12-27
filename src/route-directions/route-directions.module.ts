// src/route-directions/route-directions.module.ts
import { Module } from '@nestjs/common';
import { RouteDirectionsController } from './route-directions.controller';
import { RouteDirectionsService } from './route-directions.service';
import { RouteDirectionSelectorService } from './services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from './services/route-direction-poi-generator.service';
import { RouteDirectionObservabilityService } from './services/route-direction-observability.service';
import { RouteDirectionCacheService } from './services/route-direction-cache.service';
import { RouteDirectionCardService } from './services/route-direction-card.service';
import { RouteDirectionExplainerService } from './services/route-direction-explainer.service';
import { PackKPIAcceptanceService } from './services/pack-kpi-acceptance.service';
import { CompliancePluginService } from './plugins/compliance-plugin.service';
import { TransportPluginService } from './plugins/transport-plugin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { POIModule } from '../poi/poi.module';
import { MemoryModule } from '../agent/memory/memory.module';

@Module({
  imports: [PrismaModule, RedisModule, POIModule, MemoryModule],
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
    PackKPIAcceptanceService,
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
    PackKPIAcceptanceService,
  ],
})
export class RouteDirectionsModule {}

