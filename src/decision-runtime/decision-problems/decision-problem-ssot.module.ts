import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionProblemSsotStoreService } from './persistence/decision-problem-ssot.store';
import { DecisionProblemSynthesizerService } from './synthesizers/decision-problem-synthesizer.service';

@Module({
  imports: [PrismaModule],
  providers: [DecisionProblemSsotStoreService, DecisionProblemSynthesizerService],
  exports: [DecisionProblemSsotStoreService, DecisionProblemSynthesizerService],
})
export class DecisionProblemSsotModule {}
