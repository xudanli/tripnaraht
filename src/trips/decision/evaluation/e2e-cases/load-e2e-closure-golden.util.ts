/**
 * 加载 e2e golden JSON：兼容 Jest（src）、Nest dist（dist/src 与 dist/trips assets）。
 */
import fs from 'fs';
import path from 'path';

export function resolveE2eClosureGoldenPath(filename: string): string {
  const candidates = [
    path.join(__dirname, filename),
    path.join(process.cwd(), 'src/trips/decision/evaluation/e2e-cases', filename),
    path.join(process.cwd(), 'dist/trips/decision/evaluation/e2e-cases', filename),
    path.join(process.cwd(), 'dist/src/trips/decision/evaluation/e2e-cases', filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `e2e closure golden not found: ${filename} (tried ${candidates.join(', ')})`,
  );
}

export function loadE2eClosureGolden(filename: string): Record<string, unknown> {
  const goldenPath = resolveE2eClosureGoldenPath(filename);
  return JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as Record<string, unknown>;
}
