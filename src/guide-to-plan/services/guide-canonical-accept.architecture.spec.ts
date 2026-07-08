/**
 * Guide canonical accept must not call legacy full materialize (itinerary items via execute only).
 */
import * as fs from 'fs';
import * as path from 'path';

const ACCEPT_SERVICE = path.join(
  __dirname,
  '../../guide-to-plan/services/guide-canonical-accept.service.ts',
);

describe('Guide canonical accept architecture', () => {
  it('does not call materializeItineraryIntoTrip or full materialize', () => {
    const content = fs.readFileSync(ACCEPT_SERVICE, 'utf8');
    expect(content).not.toContain('materializeItineraryIntoTrip');
    expect(content).not.toMatch(/\.materialize\(/);
    expect(content).toContain('materializeShell');
    expect(content).toContain('evaluatePrebuiltCandidates');
    expect(content).toContain('executor.execute');
  });
});
