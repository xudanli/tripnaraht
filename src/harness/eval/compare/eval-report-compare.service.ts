import { Injectable } from '@nestjs/common';
import { compareCgusReplayReports, compareRunFingerprints, deriveComparisonSummary } from './eval-report-compare.util';

@Injectable()
export class EvalReportCompareService {
  compareRunFingerprints = compareRunFingerprints;
  deriveComparisonSummary = deriveComparisonSummary;
  compareCgusReplayReports(baseline: unknown, current: unknown) {
    return compareCgusReplayReports(baseline, current);
  }
}
