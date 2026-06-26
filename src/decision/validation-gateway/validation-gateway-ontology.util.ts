import type { ConstraintViolationItem, VerificationIssue } from '../kernel/decision-state.types';

export function ontologyViolationToVerificationIssue(v: ConstraintViolationItem): VerificationIssue {
  const isHard = v.severity === 'HARD';
  return {
    code: mapOntologyConstraintToCode(v.constraint ?? v.type),
    class: isHard ? 'CONFLICT' : 'ADVISORY',
    message: v.detail ?? v.constraint ?? v.type,
    source: 'ROUTE_FEASIBILITY',
    at: new Date().toISOString(),
    entityRef: v.constraint ? { type: 'OTHER', id: v.constraint } : undefined,
    confidence01: isHard ? 0.92 : 0.75,
  };
}

function mapOntologyConstraintToCode(constraint: string): VerificationIssue['code'] {
  if (constraint.includes('budget')) return 'ROUTE_INFEASIBLE';
  if (constraint.includes('flight')) return 'TIME_WINDOW_BREACH';
  if (constraint.includes('hotel')) return 'TIME_WINDOW_BREACH';
  return 'UNKNOWN';
}

export function physicalViolationToVerificationIssue(v: {
  code: string;
  severity: string;
  detail?: string;
  constraint?: string;
}): VerificationIssue {
  const block = v.severity === 'BLOCK';
  return {
    code: block ? 'ROUTE_INFEASIBLE' : 'UNKNOWN',
    class: block ? 'CONFLICT' : 'ADVISORY',
    message: v.detail ?? v.code,
    source: 'ROUTE_FEASIBILITY',
    at: new Date().toISOString(),
    entityRef: v.constraint ? { type: 'OTHER', id: v.constraint } : undefined,
    confidence01: block ? 0.95 : 0.7,
  };
}
