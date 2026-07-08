import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlanObjectsController } from './controllers/plan-objects.controller';
import { PlanObjectProjectionService } from './services/plan-object-projection.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanObjectsController],
  providers: [PlanObjectProjectionService],
  exports: [PlanObjectProjectionService],
})
export class PlanObjectsModule {}
