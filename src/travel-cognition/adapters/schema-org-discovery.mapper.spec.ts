import { ontologyContextToSchemaOrgDiscovery } from './schema-org-discovery.mapper';

describe('schema-org-discovery.mapper', () => {
  it('maps ontology_context nouns to schema.org graph', () => {
    const payload = ontologyContextToSchemaOrgDiscovery({
      trip_id: 'trip-1',
      destination: { name: 'Iceland', country_code: 'IS' },
      flights: [{ flight_id: 'f1', flight_no: 'FI123' }],
      hotels: [{ hotel_id: 'h1', name: 'Hotel Reykjavik' }],
    });

    expect(payload['@context']).toBe('https://schema.org');
    expect(payload['@graph'].some((n) => n['@type'] === 'schema:Flight')).toBe(true);
    expect(payload['@graph'].some((n) => n['@type'] === 'schema:LodgingBusiness')).toBe(true);
    expect(payload['@graph'].some((n) => n['@type'] === 'schema:TouristTrip')).toBe(true);
  });
});
