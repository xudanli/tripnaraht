#!/usr/bin/env npx tsx
/**
 * Scan src/skills (all .skill.ts files) and regenerate skills-manifest.json
 * for admin catalog, skills-cli, and docs.
 *
 * Usage:
 *   npx tsx scripts/generate-skills-manifest.ts
 *   npm run skills:manifest
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILLS_ROOT = path.join(process.cwd(), 'src/skills');
const OUT_FILE = path.join(SKILLS_ROOT, 'generated/skills-manifest.json');

interface ManifestSkill {
  name: string;
  category: string;
  level: string;
  description: string;
  version: string;
  className: string;
  sourceFile: string;
  toolGroup?: string;
}

interface ManifestPayload {
  generatedAt: string;
  total: number;
  skills: ManifestSkill[];
}

function walkSkillFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.skill.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function extractBracedBlock(content: string, marker: string): string | null {
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = content.indexOf('{', idx + marker.length - 1);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(braceStart + 1, i);
      }
    }
  }
  return null;
}

function extractQuotedField(block: string, field: string): string | undefined {
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`);
  const m = block.match(re);
  return m?.[2]?.trim();
}

function parseSkillFile(absPath: string): ManifestSkill | null {
  const content = fs.readFileSync(absPath, 'utf8');
  const classMatch = content.match(/export\s+class\s+(\w+)/);
  if (!classMatch) {
    return null;
  }

  const metaInner =
    extractBracedBlock(content, 'metadata = {') ??
    extractBracedBlock(content, 'metadata= {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata = {') ??
    extractBracedBlock(content, 'metadata: SkillMetadata= {');
  if (!metaInner) {
    return null;
  }

  const name = extractQuotedField(metaInner, 'name');
  const category = extractQuotedField(metaInner, 'category');
  if (!name || !category) {
    return null;
  }

  const rel = path.relative(process.cwd(), absPath).split(path.sep).join('/');
  return {
    name,
    category,
    level: 'L1',
    description: extractQuotedField(metaInner, 'description') ?? '',
    version: extractQuotedField(metaInner, 'version') ?? '1.0.0',
    className: classMatch[1],
    sourceFile: rel,
    ...(extractQuotedField(metaInner, 'toolGroup')
      ? { toolGroup: extractQuotedField(metaInner, 'toolGroup') }
      : {}),
  };
}

function main(): void {
  const files = walkSkillFiles(SKILLS_ROOT).sort();
  const skills: ManifestSkill[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const row = parseSkillFile(file);
    if (row) {
      skills.push(row);
    } else {
      skipped.push(path.relative(process.cwd(), file));
    }
  }

  const byName = new Map<string, ManifestSkill>();
  const dupes: string[] = [];
  for (const s of skills) {
    if (byName.has(s.name)) {
      dupes.push(s.name);
    }
    byName.set(s.name, s);
  }
  const unique = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  const payload: ManifestPayload = {
    generatedAt: new Date().toISOString(),
    total: unique.length,
    skills: unique,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${unique.length} skills → ${path.relative(process.cwd(), OUT_FILE)}`);
  if (skipped.length) {
    console.warn(`Skipped ${skipped.length} files (no metadata block or export class):`);
    for (const s of skipped.slice(0, 15)) {
      console.warn(`  - ${s}`);
    }
    if (skipped.length > 15) {
      console.warn(`  ... and ${skipped.length - 15} more`);
    }
  }
  if (dupes.length) {
    console.warn(`Duplicate names overwritten: ${[...new Set(dupes)].join(', ')}`);
  }
}

main();
