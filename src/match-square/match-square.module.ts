import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentityGovernanceModule } from '../identity-governance/identity-governance.module';
import { MatchSquareController } from './match-square.controller';
import { MatchSquareService } from './services/match-square.service';
import { RecruitingRuntimeModule } from './recruiting-runtime.module';
import { CalibrationLoopService } from './services/calibration-loop.service';
import { CalibrationController } from './controllers/calibration.controller';

@Module({
  imports: [PrismaModule, RecruitingRuntimeModule, IdentityGovernanceModule],
  controllers: [MatchSquareController, CalibrationController],
  providers: [MatchSquareService, CalibrationLoopService],
  exports: [MatchSquareService, CalibrationLoopService],
})
export class MatchSquareModule {}
