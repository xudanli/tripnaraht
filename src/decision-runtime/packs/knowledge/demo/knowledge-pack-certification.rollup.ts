/**
 * Unified knowledge-pack certification rollup (Fuel + Runbook + Road/Weather + Demo).
 */

import { runFuelAssessmentCertification } from '../fuel/fuel-certification.harness';
import { runRunbookExecutionCertification } from '../runbooks/runbook-certification.harness';
import { runRoadWeatherCertification } from '../road-weather/road-weather-certification.harness';
import { runIcelandSelfDriveDemoCertification } from './demo-replay.harness';

export function runIcelandSelfDriveKnowledgePackCertification(
  cwd = process.cwd(),
): {
  schemaId: 'tripnara.iceland.self_drive_knowledge_pack.cert.report@v1';
  suites: Array<{
    name: string;
    total: number;
    passed: number;
    failed: number;
  }>;
  total: number;
  passed: number;
  failed: number;
} {
  const fuel = runFuelAssessmentCertification(cwd);
  const runbooks = runRunbookExecutionCertification(cwd);
  const roadWeather = runRoadWeatherCertification(cwd);
  const demo = runIcelandSelfDriveDemoCertification(cwd);

  const suites = [
    {
      name: 'fuel',
      total: fuel.total,
      passed: fuel.passed,
      failed: fuel.failed,
    },
    {
      name: 'runbooks',
      total: runbooks.total,
      passed: runbooks.passed,
      failed: runbooks.failed,
    },
    {
      name: 'roadWeather',
      total: roadWeather.total,
      passed: roadWeather.passed,
      failed: roadWeather.failed,
    },
    {
      name: 'demoReplay',
      total: demo.total,
      passed: demo.passed,
      failed: demo.failed,
    },
  ];

  const total = suites.reduce((s, x) => s + x.total, 0);
  const passed = suites.reduce((s, x) => s + x.passed, 0);

  return {
    schemaId: 'tripnara.iceland.self_drive_knowledge_pack.cert.report@v1',
    suites,
    total,
    passed,
    failed: total - passed,
  };
}
