import fs from 'fs';
import path from 'path';
import type { E2ECase } from '../../e2e-case.types';

function loadCaseJson(filename: string): E2ECase {
  const p = path.join(__dirname, filename);
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as E2ECase;
}

export const icelandGoldenRingRoadEngineDsoCase: E2ECase = loadCaseJson(
  'golden-iceland-ring-road-2026q3-001.engine-dso.json',
);

export const icelandGoldenHighlandsRepairEngineDsoCase: E2ECase = loadCaseJson(
  'golden-iceland-highlands-2026q3-002.engine-dso.json',
);

