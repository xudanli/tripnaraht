/**
 * Experience Fulfillment — PRD V1.0 Round 1 领域协议
 *
 * 体验原子、Candidate / Verification / Repair Contract、金测场景夹具。
 */

export * from './types/experience-atom.types';
export * from './types/experience-intent.types';
export * from './types/trip-context.types';
export * from './types/poi-attribute.types';
export * from './types/candidate-contract.types';
export * from './types/verification-result.types';
export * from './types/experience-fulfillment-state.types';

export * from './config/mvp-experience-atoms.config';

export * from './schemas/experience-fulfillment.schemas';

export * from './validators/contract.validators';

export * from './services/experience-intent.compiler';
export * from './services/experience-understanding.util';
export * from './services/experience-fulfillment.orchestrator';

export * from './bridges/verification-result.bridge';
export * from './bridges/repair-contract.builder';

export * from './types/experience-explanation.types';
export * from './types/experience-outcome.types';
export * from './types/itinerary-presentation.types';

export * from './utils/experience-explanation.util';
export * from './utils/experience-outcome.util';
export * from './utils/repair-preserve-guard.util';
export * from './utils/draft-slot-candidate.util';
export * from './utils/itinerary-presentation.util';
export * from './utils/why-recommend-blocks.util';

export * from './fixtures/golden-scenarios.fixture';
