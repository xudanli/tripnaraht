/**
 * P0 — write entry registry + direct mutation policy tests.
 */

import { BadRequestException } from '@nestjs/common';
import {
  WRITE_ENTRY_REGISTRY,
  getWriteEntryById,
  listWriteEntriesByDisposition,
} from './write-entry-registry';
import {
  assertP0WriteEntryAllowed,
  isP0DirectPlanMutationEnforced,
} from './p0-direct-plan-mutation.policy';

describe('WRITE_ENTRY_REGISTRY', () => {
  it('covers required object kinds', () => {
    const kinds = new Set(WRITE_ENTRY_REGISTRY.flatMap((e) => e.objects));
    for (const k of [
      'Trip',
      'TripDay',
      'ItineraryItem',
      'HotelAnchor',
      'TripStatus',
      'BookingStatus',
      'PlanVersion',
    ]) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });

  it('marks itinerary-items CRUD as ADMIN_ONLY', () => {
    expect(getWriteEntryById('itinerary-items.crud')?.disposition).toBe('ADMIN_ONLY');
    expect(getWriteEntryById('itinerary-items.booking-status')?.disposition).toBe(
      'ADMIN_ONLY',
    );
  });

  it('marks P0 high-risk bypasses with closing dispositions', () => {
    expect(getWriteEntryById('attraction.auto-arrange.direct')?.disposition).toBe(
      'PROPOSAL_ONLY',
    );
    expect(getWriteEntryById('contextual-recommendations.commit')?.disposition).toBe(
      'ADMIN_ONLY',
    );
    expect(getWriteEntryById('trips.schedule.put')?.disposition).toBe('ADMIN_ONLY');
    expect(getWriteEntryById('guide.legacy.accept')?.disposition).toBe('LEGACY_CLOSED');
  });

  it('lists formal chain entries', () => {
    const formal = listWriteEntriesByDisposition('FORMAL_CHAIN');
    expect(formal.some((e) => e.id === 'rfc001.execute')).toBe(true);
    expect(formal.some((e) => e.id === 'iceland.initial-plan.apply')).toBe(true);
    expect(formal.every((e) => e.usesGuard)).toBe(true);
  });
});

describe('assertP0WriteEntryAllowed', () => {
  const prevPolicy = process.env.P0_DIRECT_PLAN_MUTATION_POLICY;
  const prevChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
  const prevBypass = process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS;
  const prevLegacy = process.env.GUIDE_LEGACY_ACCEPT;

  afterEach(() => {
    if (prevPolicy === undefined) delete process.env.P0_DIRECT_PLAN_MUTATION_POLICY;
    else process.env.P0_DIRECT_PLAN_MUTATION_POLICY = prevPolicy;
    if (prevChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prevChain;
    if (prevBypass === undefined) delete process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS;
    else process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS = prevBypass;
    if (prevLegacy === undefined) delete process.env.GUIDE_LEGACY_ACCEPT;
    else process.env.GUIDE_LEGACY_ACCEPT = prevLegacy;
  });

  it('no-ops when policy OFF', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'OFF';
    expect(isP0DirectPlanMutationEnforced()).toBe(false);
    expect(() =>
      assertP0WriteEntryAllowed({ entryId: 'trips.schedule.put' }),
    ).not.toThrow();
  });

  it('blocks ADMIN_ONLY without admin when ENFORCE', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    delete process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS;
    expect(() =>
      assertP0WriteEntryAllowed({ entryId: 'trips.schedule.put', roles: [] }),
    ).toThrow(BadRequestException);
  });

  it('allows ADMIN_ONLY for ADMIN role', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    expect(() =>
      assertP0WriteEntryAllowed({
        entryId: 'contextual-recommendations.commit',
        roles: ['ADMIN'],
      }),
    ).not.toThrow();
  });

  it('blocks PROPOSAL_ONLY even for ADMIN unless env bypass', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    delete process.env.P0_DIRECT_PLAN_MUTATION_ADMIN_BYPASS;
    expect(() =>
      assertP0WriteEntryAllowed({
        entryId: 'attraction.auto-arrange.direct',
        roles: ['ADMIN'],
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks guide legacy by default', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    delete process.env.GUIDE_LEGACY_ACCEPT;
    expect(() =>
      assertP0WriteEntryAllowed({ entryId: 'guide.legacy.accept' }),
    ).toThrow(BadRequestException);
  });

  it('allows ADMIN_ONLY when hasWriteAuthority', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    expect(() =>
      assertP0WriteEntryAllowed({
        entryId: 'itinerary-items.crud',
        hasWriteAuthority: true,
      }),
    ).not.toThrow();
  });

  it('allows formal chain and metadata without authority', () => {
    process.env.P0_DIRECT_PLAN_MUTATION_POLICY = 'ENFORCE';
    expect(() =>
      assertP0WriteEntryAllowed({ entryId: 'rfc001.execute' }),
    ).not.toThrow();
    expect(() =>
      assertP0WriteEntryAllowed({ entryId: 'trips.create' }),
    ).not.toThrow();
  });
});
