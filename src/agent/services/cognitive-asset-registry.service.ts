import { Injectable, Logger } from '@nestjs/common';
import type {
  CognitiveArtifact,
  CognitiveArtifactType,
  CognitiveAssetTransfer,
} from '../contracts/cognitive-artifact.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Global cognitive asset registry — artifact identity + provenance + utility (CEL substrate).
 */
@Injectable()
export class CognitiveAssetRegistryService {
  private readonly logger = new Logger(CognitiveAssetRegistryService.name);
  private readonly artifacts = new Map<string, CognitiveArtifact>();
  private readonly transfers: CognitiveAssetTransfer[] = [];

  register(params: {
    type: CognitiveArtifactType;
    value: unknown;
    provenance: ReplayProvenance;
    utilityScore: number;
    sourcePolicyId?: string;
    artifactId?: string;
  }): string {
    const now = Date.now();
    const artifactId = params.artifactId ?? newId('ca');
    const a: CognitiveArtifact = {
      artifactId,
      type: params.type,
      value: params.value,
      provenance: params.provenance,
      utilityScore: params.utilityScore,
      sourcePolicyId: params.sourcePolicyId,
      borrowedByPolicyIds: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.artifacts.set(artifactId, a);
    return artifactId;
  }

  get(artifactId: string): CognitiveArtifact | undefined {
    return this.artifacts.get(artifactId);
  }

  updateArtifact(artifactId: string, patch: Partial<CognitiveArtifact>): void {
    const cur = this.artifacts.get(artifactId);
    if (!cur) throw new Error(`COGNITIVE_ARTIFACT_UNKNOWN:${artifactId}`);
    this.artifacts.set(artifactId, {
      ...cur,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  patchUtility(artifactId: string, utilityScore: number): void {
    this.updateArtifact(artifactId, { utilityScore });
  }

  recordBorrow(artifactId: string, borrowerPolicyId: string): void {
    const cur = this.artifacts.get(artifactId);
    if (!cur) throw new Error(`COGNITIVE_ARTIFACT_UNKNOWN:${artifactId}`);
    const borrowers = new Set(cur.borrowedByPolicyIds ?? []);
    borrowers.add(borrowerPolicyId);
    this.updateArtifact(artifactId, {
      borrowedByPolicyIds: [...borrowers],
      usageCount: (cur.usageCount ?? 0) + 1,
    });
  }

  listByType(type: CognitiveArtifactType): CognitiveArtifact[] {
    return [...this.artifacts.values()].filter((a) => a.type === type);
  }

  listAll(): CognitiveArtifact[] {
    return [...this.artifacts.values()];
  }

  appendTransfer(row: Omit<CognitiveAssetTransfer, 'transferId'> & { transferId?: string }): string {
    const transferId = row.transferId ?? newId('xfer');
    const full: CognitiveAssetTransfer = {
      transferId,
      artifactId: row.artifactId,
      fromPolicyId: row.fromPolicyId,
      toPolicyId: row.toPolicyId,
      transferredAt: row.transferredAt,
      utilityDelta: row.utilityDelta,
    };
    this.transfers.push(full);
    this.logger.debug(`Cognitive transfer ${transferId} artifact=${row.artifactId} → ${row.toPolicyId}`);
    return transferId;
  }

  recentTransfers(limit = 50): CognitiveAssetTransfer[] {
    return this.transfers.slice(-limit);
  }

  /** @internal tests */
  _clearForTests(): void {
    this.artifacts.clear();
    this.transfers.length = 0;
  }
}
