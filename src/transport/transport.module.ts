// src/transport/transport.module.ts
import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportDecisionService } from './transport-decision.service';
import { TransportRoutingService } from './transport-routing.service';
import { GoogleRoutesService } from './services/google-routes.service';
import { RouteCacheService } from './services/route-cache.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TransportController],
  providers: [
    TransportDecisionService,
    TransportRoutingService,
    GoogleRoutesService,
    RouteCacheService,
  ],
  exports: [TransportDecisionService, TransportRoutingService],
})
export class TransportModule {}

