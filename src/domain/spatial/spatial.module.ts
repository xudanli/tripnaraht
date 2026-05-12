import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SpatialGraphService } from './spatial-graph.service';
import { PhysicalActionPlanEnricherService } from './physical-action-plan-enricher.service';

@Module({
  imports: [PrismaModule],
  providers: [SpatialGraphService, PhysicalActionPlanEnricherService],
  exports: [SpatialGraphService, PhysicalActionPlanEnricherService],
})
export class SpatialModule {}
