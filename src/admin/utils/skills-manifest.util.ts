import * as fs from 'fs';
import * as path from 'path';

export interface SkillsManifestRow {
  name: string;
  category: string;
  level?: string;
  description: string;
  version: string;
  className?: string;
  sourceFile?: string;
}

export interface SkillsManifestPayload {
  generatedAt?: string;
  total?: number;
  skills: SkillsManifestRow[];
}

const MANIFEST_CANDIDATES = [
  path.join(process.cwd(), 'src/skills/generated/skills-manifest.json'),
  path.join(__dirname, '../../skills/generated/skills-manifest.json'),
];

export function loadSkillsManifest(): SkillsManifestPayload | null {
  for (const filePath of MANIFEST_CANDIDATES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as SkillsManifestPayload;
      if (Array.isArray(parsed.skills)) {
        return parsed;
      }
    } catch {
      // try next path
    }
  }
  return null;
}
