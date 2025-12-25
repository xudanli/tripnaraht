// src/route-directions/route-directions.module.ts
import { Module } from '@nestjs/common';
import { RouteDirectionsController } from './route-directions.controller';
import { RouteDirectionsService } from './route-directions.service';
import { RouteDirectionSelectorService } from './services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from './services/route-direction-poi-generator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RouteDirectionsController],
  providers: [
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
  ],
  exports: [
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
  ],
})
export class RouteDirectionsModule {}

