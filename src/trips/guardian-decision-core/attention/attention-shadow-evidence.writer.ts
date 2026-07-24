/**
 * Slice 4 Shadow evidence writer — per-sample JSON under internal-docs/operations/evidence/attention-shadow/
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AttentionShadowEvidence,
  AttentionShadowStagingReplayEvidence,
} from '../contracts/attention-orchestration.types';

@Injectable()
export class AttentionShadowEvidenceWriter {
  private readonly logger = new Logger(AttentionShadowEvidenceWriter.name);

  private readonly evidenceDir = path.join(
    process.cwd(),
    'internal-docs/operations/evidence/attention-shadow',
  );

  write(evidence: AttentionShadowEvidence, opts?: { dryRun?: boolean }): string {
    const timestamp = evidence.runAt.replace(/[:.]/g, '-');
    const filename = `attention-shadow-${evidence.tripId}-${timestamp}.json`;
    const fullPath = path.join(this.evidenceDir, filename);

    if (opts?.dryRun) {
      return fullPath;
    }

    fs.mkdirSync(this.evidenceDir, { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    this.logger.log(`Attention shadow evidence written: ${fullPath}`);
    return fullPath;
  }

  writeStagingReplay(
    evidence: AttentionShadowStagingReplayEvidence,
    opts?: { dryRun?: boolean },
  ): string {
    const timestamp = evidence.runAt.replace(/[:.]/g, '-');
    const filename = `attention-shadow-staging-${evidence.scenarioId}-${evidence.tripId}-${timestamp}.json`;
    const fullPath = path.join(this.evidenceDir, filename);

    if (opts?.dryRun) {
      return fullPath;
    }

    fs.mkdirSync(this.evidenceDir, { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    this.logger.log(`Attention staging replay evidence written: ${fullPath}`);
    return fullPath;
  }
}

export function buildAttentionShadowEvidence(
  input: Omit<AttentionShadowEvidence, 'schemaId'>,
): AttentionShadowEvidence {
  return {
    schemaId: 'tripnara.attention_shadow_evidence@v1',
    ...input,
  };
}
