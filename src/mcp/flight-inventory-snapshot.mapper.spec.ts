import {
  enrichSampleOffersFromLines,
  mapAmadeusOffersToSampleCards,
  parseFlightMcpToolResultToSampleOffers,
  sanitizeFlightInventoryLinesForUi,
} from './flight-inventory-snapshot.mapper';
import type { AmadeusDirectFlightOffer } from './amadeus-direct.service';

describe('flight-inventory-snapshot.mapper', () => {
  it('mapAmadeusOffersToSampleCards maps price and segments', () => {
    const o: AmadeusDirectFlightOffer = {
      oneWay: true,
      price: { currency: 'EUR', grandTotal: '399.00' },
      itineraries: [
        {
          duration: 'PT14H30M',
          segments: [
            {
              departure: { iataCode: 'PEK', at: '2026-06-01T08:00:00' },
              arrival: { iataCode: 'KEF', at: '2026-06-01T18:30:00' },
              carrierCode: 'CA',
              number: '123',
            },
          ],
        },
      ],
      travelerPricings: [
        {
          fareDetailsBySegment: [{ cabin: 'ECONOMY' }],
        },
      ],
    };
    const cards = mapAmadeusOffersToSampleCards([o], 3);
    expect(cards).toHaveLength(1);
    expect(cards[0].currency).toBe('EUR');
    expect(cards[0].price_total).toBe('399.00');
    expect(cards[0].segments?.[0]?.departure_airport).toBe('PEK');
    expect(cards[0].segments?.[0]?.flight_number).toBe('CA123');
    expect(cards[0].segments?.[0]?.cabin).toBe('ECONOMY');
  });

  it('parseFlightMcpToolResultToSampleOffers parses Kiwi-like JSON', () => {
    const raw = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: [
              {
                flyFrom: 'PEK',
                flyTo: 'KEF',
                price: 450,
                currency: 'EUR',
                duration: '14h',
                local_departure: '2026-06-01 08:00',
                local_arrival: '2026-06-01 22:00',
              },
            ],
          }),
        },
      ],
    };
    const cards = parseFlightMcpToolResultToSampleOffers(raw, 3);
    expect(cards).toHaveLength(1);
    expect(cards[0].price_total).toBe('450');
    expect(cards[0].segments?.[0]?.departure_airport).toBe('PEK');
  });

  it('enrichSampleOffersFromLines fills from sample_lines when structured empty', () => {
    const merged = enrichSampleOffersFromLines([], ['[1] EUR 100 · 14h · PEK→KEF'], 5);
    expect(merged).toHaveLength(1);
    expect(merged[0].summary_line).toContain('PEK');
  });

  it('sanitizeFlightInventoryLinesForUi collapses HTTP/connection noise to one zh line', () => {
    const out = sanitizeFlightInventoryLinesForUi([
      'Error: HTTP 404',
      '    at fetch (node:internal)',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('404');
    expect(out[0]).toContain('FLIGHT_MCP_URL');
  });

  it('sanitizeFlightInventoryLinesForUi leaves normal offer lines unchanged', () => {
    const lines = ['[1] EUR 399 · PEK→KEF'];
    expect(sanitizeFlightInventoryLinesForUi(lines)).toEqual(lines);
  });

  it('parseFlightMcpToolResultToSampleOffers accepts root JSON array', () => {
    const raw = {
      content: [{ type: 'text', text: '[{"flyFrom":"HEL","flyTo":"PEK","price":200,"currency":"EUR"}]' }],
    };
    const cards = parseFlightMcpToolResultToSampleOffers(raw, 5);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].price_total).toBe('200');
  });
});
