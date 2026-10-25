/**
 * Permanent red line: Vector / Semantic RAG must never drive Gate HARD BLOCK.
 */

export type VectorEvidenceRole =
  | 'EXPLANATION'
  | 'EVIDENCE_DISCOVERY'
  | 'SOFT_HINT'
  | 'FORBIDDEN_HARD_BLOCK';

export class VectorHardBlockViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorHardBlockViolationError';
  }
}

/**
 * Assert a decision path is not using vector/RAG similarity as HARD BLOCK input.
 */
export function assertVectorMustNotHardBlock(input: {
  consumer: string;
  /** Explicit HARD BLOCK driven by vector similarity / RAG hit alone */
  hardBlockFromVector?: boolean;
  vectorSimilarityAsBlockThreshold?: number | null;
  proposedRole?: VectorEvidenceRole;
}): { role: VectorEvidenceRole; hardBlockEligible: false } {
  if (input.hardBlockFromVector === true) {
    throw new VectorHardBlockViolationError(
      `[${input.consumer}] Vector/RAG must never produce HARD BLOCK.`,
    );
  }
  if (
    input.vectorSimilarityAsBlockThreshold != null &&
    Number.isFinite(input.vectorSimilarityAsBlockThreshold)
  ) {
    throw new VectorHardBlockViolationError(
      `[${input.consumer}] Vector similarity must not be a HARD BLOCK threshold.`,
    );
  }
  if (input.proposedRole === 'FORBIDDEN_HARD_BLOCK') {
    throw new VectorHardBlockViolationError(
      `[${input.consumer}] proposedRole FORBIDDEN_HARD_BLOCK is not allowed.`,
    );
  }
  return {
    role: input.proposedRole ?? 'EVIDENCE_DISCOVERY',
    hardBlockEligible: false,
  };
}

/** Document / retrieval inspector fields — never expose "can BLOCK" */
export const SEMANTIC_HARD_BLOCK_POLICY = {
  hardBlockEligible: false as const,
  vectorRole: 'EVIDENCE_DISCOVERY' as const,
  note: 'Semantic/RAG is explanation & evidence discovery ONLY. Never HARD BLOCK.',
};
