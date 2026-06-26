import {
  assertProfessionalCertTransition,
  PROFESSIONAL_CERT_VALIDITY_YEARS,
} from './constants/professional-certification.constants';
import { mapCollaboratorRoleToProjectRoles } from './utils/project-membership.util';

import {
  assertAgencyCertTransition,
  AGENCY_CERT_VALIDITY_YEARS,
} from './constants/agency-certification.constants';

describe('agency-certification.constants', () => {
  it('allows agency submission flow', () => {
    expect(() => assertAgencyCertTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    expect(() => assertAgencyCertTransition('UNDER_REVIEW', 'VERIFIED')).not.toThrow();
  });

  it('uses two-year validity constant', () => {
    expect(AGENCY_CERT_VALIDITY_YEARS).toBe(2);
  });
});

describe('project-membership.util', () => {
  it('maps OWNER to organizer and payer', () => {
    expect(mapCollaboratorRoleToProjectRoles('OWNER')).toEqual(['organizer', 'payer']);
  });

  it('maps member roles to participant', () => {
    expect(mapCollaboratorRoleToProjectRoles('member')).toEqual(['participant']);
  });
});

describe('professional-certification.constants', () => {
  it('allows draft submission flow', () => {
    expect(() => assertProfessionalCertTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    expect(() => assertProfessionalCertTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertProfessionalCertTransition('UNDER_REVIEW', 'VERIFIED')).not.toThrow();
  });

  it('blocks invalid transitions', () => {
    expect(() => assertProfessionalCertTransition('NOT_STARTED', 'VERIFIED')).toThrow();
  });

  it('uses one-year validity constant', () => {
    expect(PROFESSIONAL_CERT_VALIDITY_YEARS).toBe(1);
  });
});
