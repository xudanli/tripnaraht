import { Module } from '@nestjs/common';
import { HarnessModule } from '../harness.module';
import { EvalFingerprintService } from './fingerprint/eval-fingerprint.service';
import { EvalSuiteLoader } from './suite/eval-suite.loader';
import { EvalReportCompareService } from './compare/eval-report-compare.service';
import { L1SmokeGateService } from './compare/l1-smoke-gate.service';

@Module({
  imports: [HarnessModule],
  providers: [
    EvalFingerprintService,
    EvalSuiteLoader,
    EvalReportCompareService,
    L1SmokeGateService,
  ],
  exports: [
    EvalFingerprintService,
    EvalSuiteLoader,
    EvalReportCompareService,
    L1SmokeGateService,
  ],
})
export class HarnessEvalModule {}
