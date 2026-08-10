/**
 * Emit Iceland Wind Pilot metrics report (JSON + Markdown) for review boards.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/emit-iceland-wind-pilot-report.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  buildIcelandWindPilotCaseRegistry,
  buildIcelandWindPilotShowcaseCase,
  buildWindPilotMetricsReport,
  renderWindPilotReportMarkdown,
} from '../src/travel-causal-decision';

const outDir = join(__dirname, '../evidence/pilot/iceland-wind');
mkdirSync(outDir, { recursive: true });

const cases = [...buildIcelandWindPilotCaseRegistry(), buildIcelandWindPilotShowcaseCase()];
const report = buildWindPilotMetricsReport(cases);
const md = renderWindPilotReportMarkdown(report);

writeFileSync(join(outDir, 'metrics-report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, 'metrics-report.md'), md);

// eslint-disable-next-line no-console
console.log(
  `Wrote ${outDir}/metrics-report.{json,md} — suite ${report.ok ? 'PASS' : 'FAIL'} (${report.suite.caseCount} cases)`,
);
