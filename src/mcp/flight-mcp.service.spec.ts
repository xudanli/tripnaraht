import { formatFlightMcpToolResultToLines, isFlightMcpToolResultFailure } from './flight-mcp.service';

describe('formatFlightMcpToolResultToLines', () => {
  it('parses JSON array of flight-like rows', () => {
    const raw = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            flights: [
              { price: 299, currency: 'EUR', duration: '14h', flyFrom: 'PEK', flyTo: 'KEF' },
            ],
          }),
        },
      ],
    };
    const lines = formatFlightMcpToolResultToLines(raw);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/EUR.*299|299.*EUR/);
  });

  it('falls back to truncated raw text when not JSON', () => {
    const raw = { content: [{ type: 'text', text: 'not-json-but-useful' }] };
    const lines = formatFlightMcpToolResultToLines(raw);
    expect(lines[0]).toContain('not-json');
  });
});

describe('isFlightMcpToolResultFailure', () => {
  it('detects isError flag', () => {
    expect(isFlightMcpToolResultFailure({ isError: true, content: [] })).toBe(true);
  });

  it('detects HTTP 404 in MCP text', () => {
    expect(
      isFlightMcpToolResultFailure({
        content: [{ type: 'text', text: 'Error POSTing to endpoint (HTTP 404)' }],
      }),
    ).toBe(true);
  });

  it('returns false for successful JSON flights array', () => {
    const raw = {
      content: [{ type: 'text', text: JSON.stringify({ data: [{ price: 1, flyFrom: 'A', flyTo: 'B' }] }) }],
    };
    expect(isFlightMcpToolResultFailure(raw)).toBe(false);
  });
});
