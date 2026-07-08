/**
 * Artifact persistence — write files before advancing DB state.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export function hashJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function getBenchmarkArtifactRoot(): string {
  return process.env.BENCHMARK_ARTIFACT_ROOT ?? path.join(process.cwd(), 'artifacts/task-e1-benchmark');
}

export function instanceArtifactDir(
  benchmarkRunId: string,
  instanceId: string,
): string {
  return path.join(
    getBenchmarkArtifactRoot(),
    benchmarkRunId,
    'instances',
    instanceId.replace(/[^a-zA-Z0-9._-]+/g, '_'),
  );
}

export async function writeArtifact(
  dir: string,
  filename: string,
  payload: unknown,
): Promise<{ path: string; hash: string }> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const body = stableJson(payload);
  await fs.writeFile(filePath, body);
  return { path: filePath, hash: createHash('sha256').update(body).digest('hex') };
}

export async function readArtifact<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function hashArtifactFile(filePath: string): Promise<string | undefined> {
  try {
    const body = await fs.readFile(filePath, 'utf8');
    return createHash('sha256').update(body).digest('hex');
  } catch {
    return undefined;
  }
}

export async function artifactExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
