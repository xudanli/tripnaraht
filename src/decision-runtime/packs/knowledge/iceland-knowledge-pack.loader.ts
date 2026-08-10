/**
 * Load Iceland Self-Drive Knowledge Pack manifest from destination-packs/is.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { icelandSelfDriveKnowledgePackManifestSchema } from './iceland-knowledge-pack.schema';
import type { IcelandSelfDriveKnowledgePackManifest } from './iceland-knowledge.types';

export const IS_KNOWLEDGE_PACK_MANIFEST_RELATIVE =
  'data/destination-packs/is/knowledge-pack.manifest.json';

export function resolveIsKnowledgePackManifestPath(
  cwd: string = process.cwd(),
): string {
  return join(cwd, IS_KNOWLEDGE_PACK_MANIFEST_RELATIVE);
}

export function loadIcelandSelfDriveKnowledgePack(
  cwd: string = process.cwd(),
): IcelandSelfDriveKnowledgePackManifest {
  const path = resolveIsKnowledgePackManifestPath(cwd);
  if (!existsSync(path)) {
    throw new Error(`Iceland knowledge pack manifest not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return icelandSelfDriveKnowledgePackManifestSchema.parse(
    raw,
  ) as IcelandSelfDriveKnowledgePackManifest;
}

/** Resolve a PACK_FILE path against the IS destination pack root. */
export function resolvePackFileAbsolutePath(
  packRelativePath: string,
  cwd: string = process.cwd(),
): string {
  return join(cwd, 'data/destination-packs/is', packRelativePath);
}

/** Resolve a REPO_FILE path against repo root. */
export function resolveRepoFileAbsolutePath(
  repoRelativePath: string,
  cwd: string = process.cwd(),
): string {
  return join(cwd, repoRelativePath);
}
