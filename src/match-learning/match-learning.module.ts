import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MatchLearningController } from './match-learning.controller';
import { MatchLearningService } from './match-learning.service';
import { MatchLearningScheduler } from './match-learning.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [MatchLearningController],
  providers: [MatchLearningService, MatchLearningScheduler],
  exports: [MatchLearningService],
})
export class MatchLearningModule {}
