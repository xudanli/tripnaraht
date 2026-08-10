/**
 * Load Iceland drive runbook registry and individual runbook documents.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  IcelandDriveRunbook,
  IcelandDriveRunbookId,
  IcelandDriveRunbookRegistry,
} from './iceland-drive-runbook.types';

const IS_PACK_ROOT = 'data/destination-packs/is';

function readJson<T>(absolutePath: string): T {
  if (!existsSync(absolutePath)) {
    throw new Error(`Iceland runbook asset not found: ${absolutePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as T;
}

export function resolveIsRunbookAssetPath(
  packRelativePath: string,
  cwd: string = process.cwd(),
): string {
  return join(cwd, IS_PACK_ROOT, packRelativePath);
}

export function loadIcelandDriveRunbookRegistry(
  cwd: string = process.cwd(),
): IcelandDriveRunbookRegistry {
  return readJson<IcelandDriveRunbookRegistry>(
    resolveIsRunbookAssetPath('knowledge/runbooks/is-runbook-registry.json', cwd),
  );
}

export function loadIcelandDriveRunbook(
  runbookId: IcelandDriveRunbookId,
  cwd: string = process.cwd(),
): IcelandDriveRunbook {
  const registry = loadIcelandDriveRunbookRegistry(cwd);
  const entry = registry.runbooks.find((r) => r.runbookId === runbookId);
  if (!entry) {
    throw new Error(`Runbook not registered: ${runbookId}`);
  }
  const runbook = readJson<IcelandDriveRunbook>(
    resolveIsRunbookAssetPath(entry.path, cwd),
  );
  if (runbook.runbookId !== runbookId) {
    throw new Error(
      `Runbook id mismatch: registry ${runbookId} vs file ${runbook.runbookId}`,
    );
  }
  return runbook;
}

export function listActiveIcelandDriveRunbookIds(
  cwd: string = process.cwd(),
): IcelandDriveRunbookId[] {
  return loadIcelandDriveRunbookRegistry(cwd)
    .runbooks.filter((r) => r.status === 'ACTIVE')
    .map((r) => r.runbookId);
}

/** Match registry by event type (first ACTIVE hit). */
export function resolveRunbookIdForEventType(
  eventType: string,
  cwd: string = process.cwd(),
): IcelandDriveRunbookId | undefined {
  const registry = loadIcelandDriveRunbookRegistry(cwd);
  for (const entry of registry.runbooks) {
    if (entry.status !== 'ACTIVE') continue;
    const runbook = loadIcelandDriveRunbook(entry.runbookId, cwd);
    if (runbook.trigger.eventTypes.includes(eventType)) {
      return entry.runbookId;
    }
  }
  return undefined;
}
