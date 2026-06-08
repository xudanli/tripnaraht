import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OdysseyIntakeModule } from '../odyssey-intake/odyssey-intake.module';
import { ReputationOsController } from './reputation-os.controller';
import { ReputationOsService } from './reputation-os.service';
import { ReputationOsScheduler } from './reputation-os.scheduler';

@Module({
  imports: [PrismaModule, OdysseyIntakeModule],
  controllers: [ReputationOsController],
  providers: [ReputationOsService, ReputationOsScheduler],
  exports: [ReputationOsService],
})
export class ReputationOsModule {}
