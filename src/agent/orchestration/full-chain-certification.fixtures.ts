import type {
  FullChainCertExpectedStatus,
  FullChainCertFixtureId,
} from './full-chain-certification.constants';
import { FULL_CHAIN_CERT_STAGE_ORDER } from './full-chain-certification.constants';

export type FullChainCertFixture = {
  id: FullChainCertFixtureId;
  label: string;
  /** stubbed node visit order (subset of cert stages) */
  stages: string[];
  expectedStatus: FullChainCertExpectedStatus;
  /** gate probes used by contract spec */
  probes: {
    hallucinationHardFact?: boolean;
    flawedForbidSafety?: boolean;
    r2rForbidFull?: boolean;
    r2rScopes?: string[];
    planGenEmpty?: boolean;
  };
};

export const FULL_CHAIN_CERT_FIXTURES: FullChainCertFixture[] = [
  {
    id: 'happy_path_ok',
    label: 'Happy path RESEARCH→…→hallucination → OK',
    stages: [...FULL_CHAIN_CERT_STAGE_ORDER],
    expectedStatus: 'OK',
    probes: {},
  },
  {
    id: 'hallucination_hard_fact_failed',
    label: 'Hard fact conflict blocks DONE',
    stages: [...FULL_CHAIN_CERT_STAGE_ORDER],
    expectedStatus: 'FAILED',
    probes: { hallucinationHardFact: true },
  },
  {
    id: 'flawed_forbid_need_confirmation',
    label: 'HARD SAFETY forbids flawed draft → NEED_CONFIRMATION',
    stages: FULL_CHAIN_CERT_STAGE_ORDER.filter((s) => s !== 'hallucination'),
    expectedStatus: 'NEED_CONFIRMATION',
    probes: { flawedForbidSafety: true },
  },
  {
    id: 'r2r_scoped_partial',
    label: 'RETURN_TO_RESEARCH carries scoped forbid_full',
    stages: ['research', 'poi_selection', 'gate_eval', 'plan_gen', 'verify', 'research'],
    expectedStatus: 'OK',
    probes: {
      r2rForbidFull: true,
      r2rScopes: ['destination', 'common'],
    },
  },
  {
    id: 'plan_gen_empty_need_more_info',
    label: 'Empty PLAN_GEN → NEED_MORE_INFO',
    stages: ['research', 'poi_selection', 'gate_eval', 'context_build', 'plan_gen'],
    expectedStatus: 'NEED_MORE_INFO',
    probes: { planGenEmpty: true },
  },
];
