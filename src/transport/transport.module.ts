// src/transport/transport.module.ts
import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportDecisionService } from './transport-decision.service';
import { TransportRoutingService } from './transport-routing.service';
import { GoogleRoutesService } from './services/google-routes.service';
import { AmapRoutesService } from './services/amap-routes.service';
import { LocationDetectorService } from './services/location-detector.service';
import { SmartRoutesService } from './services/smart-routes.service';
import { RouteCacheService } from './services/route-cache.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [TransportController],
  providers: [
    TransportDecisionService,
    TransportRoutingService,
    GoogleRoutesService,
    AmapRoutesService,
    LocationDetectorService,
    SmartRoutesService,
    RouteCacheService,
  ],
  exports: [
    TransportDecisionService,
    TransportRoutingService,
    SmartRoutesService, // 导出智能路由服务
    RouteCacheService, // 导出路线缓存服务
  ],
})
export class TransportModule {}

