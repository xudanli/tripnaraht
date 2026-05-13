import { ResearchMemberRegistry } from './research-member.registry';
import { HotelResearchMember } from './hotel-research.member';
import { FlightResearchMember } from './flight-research.member';
import { TransportResearchMember } from './transport-research.member';
import { DestinationResearchMember } from './destination-research.member';
import { ComplianceResearchMember } from './compliance-research.member';

describe('ResearchMemberRegistry', () => {
  const destination = { memberId: 'DestinationResearchMember' } as DestinationResearchMember;
  const hotel = { memberId: 'HotelResearchMember' } as HotelResearchMember;
  const flight = { memberId: 'FlightResearchMember' } as FlightResearchMember;
  const transport = { memberId: 'TransportResearchMember' } as TransportResearchMember;
  const compliance = { memberId: 'ComplianceResearchMember' } as ComplianceResearchMember;
  const registry = new ResearchMemberRegistry(destination, hotel, flight, transport, compliance);

  it('memberIdsForScopes returns ids in fixed domain order (not input order)', () => {
    expect(registry.memberIdsForScopes(['flight', 'hotel'])).toEqual([
      'HotelResearchMember',
      'FlightResearchMember',
    ]);
    expect(registry.memberIdsForScopes(['destination', 'flight'])).toEqual([
      'DestinationResearchMember',
      'FlightResearchMember',
    ]);
    expect(registry.memberIdsForScopes(['compliance', 'hotel'])).toEqual([
      'DestinationResearchMember',
      'HotelResearchMember',
      'ComplianceResearchMember',
    ]);
    expect(registry.memberIdsForScopes(undefined)).toEqual([]);
  });

  it('membersForScopes returns instances', () => {
    expect(registry.membersForScopes(['hotel'])).toEqual([hotel]);
    expect(registry.membersForScopes(['hotel', 'flight'])).toEqual([hotel, flight]);
  });

  it('buildTopologyPlan parallelizes hotel+flight and sequences transport', () => {
    expect(registry.buildTopologyPlan(['flight', 'hotel', 'transport'])).toEqual({
      parallel: [
        { id: 'HotelResearchMember', kind: 'hotel' },
        { id: 'FlightResearchMember', kind: 'flight' },
      ],
      sequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
    });
    expect(registry.buildTopologyPlan(['transport'])).toEqual({
      parallel: [],
      sequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
    });
  });

  it('normalizeScopesForTopology filters unknown strings', () => {
    expect(ResearchMemberRegistry.normalizeScopesForTopology(['hotel', 'bogus', 'flight'])).toEqual(['hotel', 'flight']);
  });

  it('buildTopologyPlanForResearchExecution: full with trip ends with compliance sequential', () => {
    expect(
      registry.buildTopologyPlanForResearchExecution({
        effectiveMode: 'full',
        scopesForTopology: [],
        hasTrip: true,
      }),
    ).toEqual({
      preParallelSequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
      parallel: [{ id: 'DestinationResearchMember', kind: 'destination' }],
      sequential: [{ id: 'ComplianceResearchMember', kind: 'compliance' }],
    });
  });

  it('buildTopologyPlanForResearchExecution: transport_only', () => {
    expect(
      registry.buildTopologyPlanForResearchExecution({
        effectiveMode: 'transport_only',
        scopesForTopology: [],
        hasTrip: true,
      }),
    ).toEqual({
      parallel: [],
      sequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
    });
  });

  it('buildTopologyPlanForResearchExecution: no trip yields empty plan', () => {
    expect(
      registry.buildTopologyPlanForResearchExecution({
        effectiveMode: 'full',
        scopesForTopology: [],
        hasTrip: false,
      }),
    ).toEqual({ parallel: [], sequential: [] });
  });

  it('buildTopologyPlan puts destination first when destination or compliance is scoped', () => {
    expect(registry.buildTopologyPlan(['destination', 'flight', 'hotel', 'transport'])).toEqual({
      parallel: [
        { id: 'DestinationResearchMember', kind: 'destination' },
        { id: 'HotelResearchMember', kind: 'hotel' },
        { id: 'FlightResearchMember', kind: 'flight' },
      ],
      sequential: [{ id: 'TransportResearchMember', kind: 'transport' }],
    });
    expect(registry.buildTopologyPlan(['compliance', 'transport'])).toEqual({
      parallel: [{ id: 'DestinationResearchMember', kind: 'destination' }],
      sequential: [
        { id: 'TransportResearchMember', kind: 'transport' },
        { id: 'ComplianceResearchMember', kind: 'compliance' },
      ],
    });
  });
});
