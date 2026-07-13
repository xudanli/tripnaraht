import { parseVedurObservationXml, windMsToKmh } from './vedur-raw-xml.util';

describe('vedur-raw-xml.util', () => {
  it('parses Vedur station XML', () => {
    const xml = `
      <observations>
        <station id="1">
          <name>Reykjavik</name>
          <time>2026-07-10 12:00:00</time>
          <T>6.4</T>
          <F>12</F>
          <FG>26.5</FG>
        </station>
      </observations>`;
    const obs = parseVedurObservationXml(xml, '1');
    expect(obs.stationId).toBe('1');
    expect(obs.windSpeedMs).toBe(12);
    expect(obs.windGustMs).toBe(26.5);
    expect(windMsToKmh(12)).toBe(43.2);
  });
});
