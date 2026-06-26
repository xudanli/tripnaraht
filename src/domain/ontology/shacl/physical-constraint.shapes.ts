/**
 * SHACL-inspired 物理约束 shapes — 与 Place.ontologyRules JSONB 互操作（验证层，非 OWL 推理）。
 */

export interface ShaclShapeViolation {
  shapeId: string;
  path: string;
  message: string;
  severity: 'BLOCK' | 'WARN';
}

export interface PhysicalConstraintShape {
  id: string;
  targetClass?: string;
  path: string;
  /** 支持 minInclusive / maxInclusive / in / pattern */
  constraint: Record<string, unknown>;
  severity: 'BLOCK' | 'WARN';
  message: string;
}

export const DEFAULT_PHYSICAL_CONSTRAINT_SHAPES: readonly PhysicalConstraintShape[] = [
  {
    id: 'tripnara:shape/road-access',
    targetClass: 'Place',
    path: 'roadAccess.requires4x4',
    constraint: { datatype: 'boolean' },
    severity: 'BLOCK',
    message: 'roadAccess.requires4x4 must be boolean',
  },
  {
    id: 'tripnara:shape/seasonality-month',
    targetClass: 'Place',
    path: 'seasonality.blockedMonths',
    constraint: { minCount: 0, maxCount: 12, itemMinInclusive: 1, itemMaxInclusive: 12 },
    severity: 'WARN',
    message: 'seasonality.blockedMonths must be month numbers 1-12',
  },
  {
    id: 'tripnara:shape/opening-hours',
    targetClass: 'Place',
    path: 'openingHours.closeAt',
    constraint: { pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
    severity: 'WARN',
    message: 'openingHours.closeAt must be HH:mm',
  },
] as const;

function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object' || Array.isArray(acc)) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function validateShapeValue(shape: PhysicalConstraintShape, value: unknown): ShaclShapeViolation | null {
  const c = shape.constraint;

  if (c.datatype === 'boolean' && value !== undefined && !isBoolean(value)) {
    return { shapeId: shape.id, path: shape.path, message: shape.message, severity: shape.severity };
  }

  if (typeof c.pattern === 'string' && value !== undefined && typeof value === 'string') {
    const re = new RegExp(c.pattern);
    if (!re.test(value)) {
      return { shapeId: shape.id, path: shape.path, message: shape.message, severity: shape.severity };
    }
  }

  if (Array.isArray(value) && (c.itemMinInclusive != null || c.itemMaxInclusive != null)) {
    const min = Number(c.itemMinInclusive ?? -Infinity);
    const max = Number(c.itemMaxInclusive ?? Infinity);
    const bad = value.some((item) => typeof item !== 'number' || item < min || item > max);
    if (bad) {
      return { shapeId: shape.id, path: shape.path, message: shape.message, severity: shape.severity };
    }
  }

  if (typeof c.minCount === 'number' && Array.isArray(value) && value.length < c.minCount) {
    return { shapeId: shape.id, path: shape.path, message: shape.message, severity: shape.severity };
  }

  if (typeof c.maxCount === 'number' && Array.isArray(value) && value.length > c.maxCount) {
    return { shapeId: shape.id, path: shape.path, message: shape.message, severity: shape.severity };
  }

  return null;
}

/** 校验 Place.ontologyRules（或同类 JSONB）是否符合物理约束 shapes。 */
export function validateOntologyRulesAgainstShapes(
  rules: unknown,
  shapes: readonly PhysicalConstraintShape[] = DEFAULT_PHYSICAL_CONSTRAINT_SHAPES,
): ShaclShapeViolation[] {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return [];
  const doc = rules as Record<string, unknown>;
  const violations: ShaclShapeViolation[] = [];

  for (const shape of shapes) {
    const value = readPath(doc, shape.path);
    if (value === undefined) continue;
    const violation = validateShapeValue(shape, value);
    if (violation) violations.push(violation);
  }

  return violations;
}
