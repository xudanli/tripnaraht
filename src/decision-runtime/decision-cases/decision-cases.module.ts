import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionCaseStoreService } from './persistence/decision-case.store';
import { DecisionCaseService } from './services/decision-case.service';
import { DecisionCaseApplyWritebackService } from './services/decision-case-apply-writeback.service';

@Module({
  imports: [PrismaModule],
  providers: [
    DecisionCaseStoreService,
    DecisionCaseService,
    DecisionCaseApplyWritebackService,
  ],
  exports: [
    DecisionCaseStoreService,
    DecisionCaseService,
    DecisionCaseApplyWritebackService,
  ],
})
export class DecisionCasesModule {}
