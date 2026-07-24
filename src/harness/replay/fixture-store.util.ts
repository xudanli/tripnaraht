import * as fs from 'fs';
import * as path from 'path';
import type { TravelContextSnapshot } from '../../travel-context/domain/travel-context.types';
import type { ProductionTravelContextTrace } from './production-trace.types';

const DEFAULT_REPLAY_FIXTURE_DIR = path.join(
  __dirname,
  '..',
  'evals',
  'fixtures',
  'contexts',
  'replay',
);

export function getReplayFixtureDir(customDir?: string): string {
  return customDir ?? DEFAULT_REPLAY_FIXTURE_DIR;
}

export function replaySnapshotFixturePath(fixtureId: string, baseDir?: string): string {
  const safe = fixtureId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getReplayFixtureDir(baseDir), `${safe}.snapshot.json`);
}

export function replayTraceFixturePath(fixtureId: string, baseDir?: string): string {
  const safe = fixtureId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getReplayFixtureDir(baseDir), `${safe}.trace.json`);
}

export function writeReplayFixtures(input: {
  fixtureId: string;
  snapshot: TravelContextSnapshot;
  trace: ProductionTravelContextTrace;
  baseDir?: string;
}): { snapshotPath: string; tracePath: string } {
  const dir = getReplayFixtureDir(input.baseDir);
  fs.mkdirSync(dir, { recursive: true });

  const snapshotPath = replaySnapshotFixturePath(input.fixtureId, dir);
  const tracePath = replayTraceFixturePath(input.fixtureId, dir);

  fs.writeFileSync(snapshotPath, JSON.stringify(input.snapshot, null, 2), 'utf8');
  fs.writeFileSync(tracePath, JSON.stringify(input.trace, null, 2), 'utf8');

  return { snapshotPath, tracePath };
}

export function readReplaySnapshotFixture(
  fixtureId: string,
  baseDir?: string,
): TravelContextSnapshot | null {
  const filePath = replaySnapshotFixturePath(fixtureId, baseDir);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as TravelContextSnapshot;
}

export function readReplayTraceFixture(
  fixtureId: string,
  baseDir?: string,
): ProductionTravelContextTrace | null {
  const filePath = replayTraceFixturePath(fixtureId, baseDir);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductionTravelContextTrace;
}
