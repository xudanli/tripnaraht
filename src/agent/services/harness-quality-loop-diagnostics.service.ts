import { Injectable } from '@nestjs/common';
import { COUNTRY_DECISION_CLOSURE_FIXTURES } from '../../trips/decision/evaluation/e2e-cases/registry';
import {
  buildHarnessQualityLoopSnapshot,
  type HarnessQualityLoopSnapshotV1,
} from '../../harness/eval/quality/harness-quality-loop.util';

@Injectable()
export class HarnessQualityLoopDiagnosticsService {
  buildSnapshot(): HarnessQualityLoopSnapshotV1 {
    return buildHarnessQualityLoopSnapshot({
      decisionClosureFixtureCount: COUNTRY_DECISION_CLOSURE_FIXTURES.length,
    });
  }
}
