/**
 * 统一加载 CN / IS 经典线按日骨架（文件形状略有差异）。
 */
import * as fs from 'fs';
import * as path from 'path';

export type ClassicDayStop = {
  day: number;
  from: string;
  to: string;
  driveKmHint?: number;
  overnight?: string;
  highlights?: string[];
  notesCN?: string;
};

export type ClassicDaySkeletonVariant = {
  id: string;
  days: number;
  labelCN: string;
  labelEN?: string;
  stops: ClassicDayStop[];
};

type SkeletonEntry = {
  defaultVariantId?: string;
  variants: ClassicDaySkeletonVariant[];
};

type FileShape = {
  skeletons?: Record<string, SkeletonEntry>;
  routes?: Record<string, SkeletonEntry>;
};

const fileCache = new Map<string, FileShape>();

function loadFile(relPath: string): FileShape {
  if (fileCache.has(relPath)) return fileCache.get(relPath)!;
  const filePath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(filePath)) {
    const empty: FileShape = {};
    fileCache.set(relPath, empty);
    return empty;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
  fileCache.set(relPath, parsed);
  return parsed;
}

function entriesOf(file: FileShape): Record<string, SkeletonEntry> {
  return file.skeletons ?? file.routes ?? {};
}

function countrySkeletonPath(countryCode: string): string | null {
  const cc = countryCode.trim().toUpperCase();
  if (cc === 'CN' || cc === 'CHN' || cc === 'CHINA') {
    return 'data/country-packs/CN/classic-self-drive-day-skeletons.v1.json';
  }
  if (cc === 'IS' || cc === 'ICELAND') {
    return 'data/country-packs/IS/classic-self-drive-day-skeletons.v1.json';
  }
  return null;
}

export function listClassicDaySkeletonVariants(input: {
  countryCode: string;
  corridorId: string;
}): ClassicDaySkeletonVariant[] {
  const rel = countrySkeletonPath(input.countryCode);
  if (!rel) return [];
  const entry = entriesOf(loadFile(rel))[input.corridorId];
  return entry?.variants?.length ? entry.variants.slice() : [];
}

export function pickClassicDaySkeletonVariant(input: {
  countryCode: string;
  corridorId: string;
  preferredDays?: number | null;
}): ClassicDaySkeletonVariant | null {
  const rel = countrySkeletonPath(input.countryCode);
  if (!rel) return null;
  const file = loadFile(rel);
  const entry = entriesOf(file)[input.corridorId];
  const variants = entry?.variants?.length ? entry.variants : [];
  if (!variants.length) return null;

  if (input.preferredDays != null) {
    let best = variants[0];
    let bestDiff = Math.abs(best.days - input.preferredDays);
    for (const v of variants) {
      const d = Math.abs(v.days - input.preferredDays);
      if (d < bestDiff) {
        best = v;
        bestDiff = d;
      }
    }
    return best;
  }

  const def = entry?.defaultVariantId
    ? variants.find((v) => v.id === entry.defaultVariantId)
    : null;
  return def ?? variants[0];
}

export function clearClassicDaySkeletonCache(): void {
  fileCache.clear();
}
