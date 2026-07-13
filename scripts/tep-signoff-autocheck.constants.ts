/** §0 automation row keys → checklist first-column match text */

export type SignoffCheckId =
  | 'tep-full'
  | 'pilot-ci'
  | 'cert-401-concurrent-mock'
  | 'cert-404-mock'
  | 'pg-writeback'
  | 'tep-repair-executions-table';

export interface SignoffCheckDefinition {
  id: SignoffCheckId;
  /** Substring matched against the markdown table row */
  rowMatch: string;
  description: string;
}

export const SIGNOFF_SECTION0_CHECKS: SignoffCheckDefinition[] = [
  {
    id: 'tep-full',
    rowMatch: 'TEP 全量',
    description: 'npm test -- src/trips/tep',
  },
  {
    id: 'pilot-ci',
    rowMatch: 'npm run tep:pilot-ci',
    description: 'Pilot CI smoke (seed 01–10 + HTTP + PG)',
  },
  {
    id: 'cert-401-concurrent-mock',
    rowMatch: 'IS-CERT-401-CONCURRENT mock',
    description: 'is-cert-writeback.integration.spec.ts concurrent case',
  },
  {
    id: 'cert-404-mock',
    rowMatch: 'IS-CERT-404 mock',
    description: 'is-cert-404.integration.spec.ts',
  },
  {
    id: 'pg-writeback',
    rowMatch: 'IS-CERT-401/402/403/401-CONCURRENT staging PG',
    description: 'is-cert-writeback-pg.e2e.spec.ts',
  },
  {
    id: 'tep-repair-executions-table',
    rowMatch: 'tep_repair_executions',
    description: 'Prisma introspection for tep_repair_executions table',
  },
];

export const SIGNOFF_CHECKLIST_PATH =
  'internal-docs/product/TEP-PHASE0-SIGNOFF-CHECKLIST.md';

export const SIGNOFF_EVIDENCE_DIR = 'artifacts/tep-signoff';
