// Recruiting Runtime Module
// 招募运行时模块

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecruitingAttributionService } from './services/recruiting-attribution.service';
import { RecruitingOutcomeService } from './services/recruiting-outcome.service';
import { RecruitingRuntimeService } from './services/recruiting-runtime.service';

@Module({
  imports: [PrismaModule],
  providers: [
    RecruitingAttributionService,
    RecruitingOutcomeService,
    RecruitingRuntimeService,
  ],
  exports: [
    RecruitingAttributionService,
    RecruitingOutcomeService,
    RecruitingRuntimeService,
  ],
})
export class RecruitingRuntimeModule {}
