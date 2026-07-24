// src/trips/iceland/market-preference/load-iceland-market-preference-matrix.ts

import * as fs from 'fs';
import * as path from 'path';
import type { IcelandMarketPreferenceMatrixV1 } from './iceland-market-preference.types';

const MATRIX_REL_PATH = path.join('data', 'country-packs', 'IS', 'market-preference-matrix.v1.json');

let cached: IcelandMarketPreferenceMatrixV1 | null = null;

export function getIcelandMarketPreferenceMatrixPath(): string {
  return path.join(process.cwd(), MATRIX_REL_PATH);
}

export function loadIcelandMarketPreferenceMatrix(): IcelandMarketPreferenceMatrixV1 {
  if (cached) return cached;
  const filePath = getIcelandMarketPreferenceMatrixPath();
  const raw = fs.readFileSync(filePath, 'utf8');
  cached = JSON.parse(raw) as IcelandMarketPreferenceMatrixV1;
  return cached;
}

/** 测试或热重载时清空缓存 */
export function clearIcelandMarketPreferenceMatrixCache(): void {
  cached = null;
}
