/**
 * P-ECO-Closure-10 — Existential computational identity & continuity (terminal audit layer).
 */

export type { ExistentialIdentity } from './existential-identity.types';
export type { InvariantOntology } from './invariant-ontology';
export {
  buildInvariantOntology,
  invariantOntologyIntegrityScore,
} from './invariant-ontology';
export { buildSemanticContinuity, type SemanticContinuity } from './semantic-continuity';
export { evaluateMutationEnvelope, type MutationEnvelopeAudit } from './mutation-envelope';
export type { ExistentialAssessment } from './existential-assessment.types';
export {
  buildP10EcoClosureAugmentation,
  type P10EcoClosureAugmentation,
} from './build-p10-eco-closure';
