import { ICELAND_F_ROAD_POLICY_SOURCE } from './iceland-f-road-policy.util';
import { PHYSICAL_VALIDATOR_VERSION } from './physical-validator.constants';

/** Admin read-only card status — DB/Road.is rows override this fallback when present. */
export type StaticPhysicalPolicyStatus = 'ACTIVE_FALLBACK';

export interface StaticPhysicalPolicyView {
  id: string;
  title: string;
  segment_types: string[];
  timezone: 'UTC';
  /** Approximate summer corridor used by isIcelandHighlandFRoadSeasonallyClosed inverse window */
  open_window_utc: {
    inclusive_from: string;
    inclusive_to: string;
    description: string;
  };
  policy_source_key: string;
  evidence_marker: string;
  official_guidance_url: string;
  status: StaticPhysicalPolicyStatus;
  precedence_note: string;
}

export interface StaticPhysicalPoliciesEnvelope {
  physical_validator_version: string;
  policies: StaticPhysicalPolicyView[];
}

export function listStaticPhysicalPolicies(): StaticPhysicalPolicyView[] {
  return [
    {
      id: 'ICELAND_HIGHLAND_DEFAULT',
      title: 'Iceland highland F-road seasonal policy (calendar fallback)',
      segment_types: ['F_ROAD'],
      timezone: 'UTC',
      open_window_utc: {
        inclusive_from: '06-20',
        inclusive_to: '10-14',
        description:
          'UTC calendar proxy: access evaluated as open Jun 20–Oct 14 inclusive; outside → SEGMENT_SEASONALLY_CLOSED when DB does not already match a closure window.',
      },
      policy_source_key: ICELAND_F_ROAD_POLICY_SOURCE,
      evidence_marker: `policy:${ICELAND_F_ROAD_POLICY_SOURCE}`,
      official_guidance_url: 'https://www.road.is/',
      status: 'ACTIVE_FALLBACK',
      precedence_note:
        'spatial_domain_segment.seasonal_closures (from Road.is sync or manual entry) overrides this fallback when enter_at falls inside a stored window.',
    },
  ];
}

export function getStaticPhysicalPoliciesEnvelope(): StaticPhysicalPoliciesEnvelope {
  return {
    physical_validator_version: PHYSICAL_VALIDATOR_VERSION,
    policies: listStaticPhysicalPolicies(),
  };
}
