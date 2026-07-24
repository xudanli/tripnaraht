/**
 * Generate Product Approval Package draft (does NOT auto-approve).
 *
 *   npm run lab:prepare-product-approval -- --date 2026-07-15
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import {
  M4_RA01_DEFAULT_OPERATIONS,
  M4_RA01_EXCLUDED_OPERATIONS,
  type AuthorityApprovalPackage,
} from './authority-package.types';
import { hashAuthorityPackage } from './authority-token';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function resolveDate(): string {
  if (argValue('--date')) return argValue('--date')!;
  try {
    return readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function main(): Promise<number> {
  const date = resolveDate();
  const dir = join(PLANNING_SIGNOFF_ROOT, date);
  if (!existsSync(join(dir, 'stability.json'))) {
    console.error(
      `FAIL: seal engineering first (missing ${dir}/stability.json). Run lab:seal-planning-signoff`,
    );
    return 1;
  }
  mkdirSync(dir, { recursive: true });

  const force = process.argv.includes('--force');
  const existingPath = join(dir, 'authority.json');
  if (existsSync(existingPath) && !force) {
    const existing = JSON.parse(
      readFileSync(existingPath, 'utf8'),
    ) as AuthorityApprovalPackage;
    if (existing.authorityScope && existing.status === 'APPROVED') {
      console.error('FAIL: authority.json already APPROVED; use --force to overwrite');
      return 1;
    }
  }

  const signoffId = `m4-ra01-${date}`;
  const pkg: AuthorityApprovalPackage = {
    schemaId: 'tripnara.planning_signoff.authority@v1',
    kind: 'authority',
    status: 'DRAFT',
    approved: false,
    signoffId,
    authorityScope: {
      operations: [...M4_RA01_DEFAULT_OPERATIONS],
      excludedOperations: [...M4_RA01_EXCLUDED_OPERATIONS],
      tripSelectionMode: 'selected_trips',
      destinations: ['IS'],
      maxRiskLevel: 'MEDIUM',
      requiresUserConfirmation: true,
      forbiddenBehaviors: [
        'high_risk_road_selection',
        'booked_activity_cancel',
        'booked_cross_day_move',
        'payment_or_irreversible_ops',
      ],
    },
    rollbackProvider: 'neptune-repair',
    evidenceArtifactRefs: {
      stability: 'stability.json',
      locality: 'locality.json',
      gateway: 'gateway.json',
      rollback: 'rollback.json',
    },
    accountability: {
      failureOwner: 'TBD-product-owner',
      escalation: 'TBD-oncall-decision-runtime',
      rollbackOwner: 'TBD-release-engineer',
    },
    detail:
      'DRAFT for product: answer accountability + flip status to APPROVED / approved:true',
    summary:
      'M4-RA-01 restricted scope (SHIFT/SWAP/SHORTEN/REROUTE, IS, selected_trips only)',
  };

  writeFileSync(existingPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const draftHash = hashAuthorityPackage(pkg);
  console.log(
    JSON.stringify(
      {
        written: existingPath.replace(`${process.cwd()}/`, ''),
        status: pkg.status,
        signoffId: pkg.signoffId,
        draftArtifactHash: draftHash,
        next: [
          'Product fills accountability.* and sets status=APPROVED, approved=true, approvedBy, approvedAt',
          'npm run lab:mint-authority-token',
          'npm run lab:rollback-drill -- --checklist',
          'Set OR_TOOLS_CANARY_STAGE=selected_trips + OR_TOOLS_AUTHORITATIVE_CANARY=1',
        ],
      },
      null,
      2,
    ),
  );
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
