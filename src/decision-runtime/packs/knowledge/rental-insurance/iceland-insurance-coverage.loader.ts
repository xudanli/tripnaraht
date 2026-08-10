import { readFileSync } from 'fs';
import { join } from 'path';
import type { InsuranceCoverageMatrixFile } from './iceland-rental-insurance.types';

let cached: InsuranceCoverageMatrixFile | undefined;

export function loadIcelandInsuranceCoverageMatrix(
  cwd = process.cwd(),
): InsuranceCoverageMatrixFile {
  if (cached) return cached;
  const path = join(
    cwd,
    'data/destination-packs/is/knowledge/rental-insurance/is-insurance-coverage-matrix.json',
  );
  cached = JSON.parse(readFileSync(path, 'utf8')) as InsuranceCoverageMatrixFile;
  return cached;
}

export function clearIcelandInsuranceCoverageMatrixCache(): void {
  cached = undefined;
}
