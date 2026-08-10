import type { GagnaveitaFaerdRecord } from './gagnaveita-faerd.mapper';
import {
  listRoadIdsInGagnaveitaPayload,
  mapGagnaveitaPayloadToRoadStatusForId,
  resolveRoadIdFromGagnaveitaRecord,
} from './gagnaveita-faerd.mapper';
import { mapGagnaveitaPayloadToRoadStatus } from './gagnaveita-collector-parse.util';
import { readFileSync } from 'fs';
import { join } from 'path';

function record(
  partial: Partial<GagnaveitaFaerdRecord> & {
    FulltNafnButs: string;
    AstandYfirbord: string;
  },
): GagnaveitaFaerdRecord {
  return {
    IdButur: partial.IdButur ?? 1,
    DagsSkrad: '2026-07-01T00:00:00',
    StuttNafnButs: partial.StuttNafnButs ?? partial.FulltNafnButs,
    FulltNafnButs: partial.FulltNafnButs,
    DagsButurBreyttist: '2026-07-01T00:00:00',
    AstandYfirbord: partial.AstandYfirbord,
    AstandVidbotaruppl: null,
    AstandLysing: 'x',
    AstandLysingEn: 'x',
    FrkvAudkenni: null,
    FrkvLysing: null,
    FrkvLysingEn: null,
    AsthunAudkenni: null,
    AsthunLysing: null,
    AsthunLysingEn: null,
    Snjomokstursregla:
      partial.Snjomokstursregla !== undefined ? partial.Snjomokstursregla : null,
    DagsKeyrtUt: '2026-07-01T12:00:00',
  };
}

describe('gagnaveita multi-road mapping', () => {
  const payload = [
    record({
      IdButur: 1,
      FulltNafnButs: 'Fjallabaksleið nyrðri / F208',
      AstandYfirbord: 'FAERT_FJALLABILUM',
    }),
    record({
      IdButur: 2,
      FulltNafnButs: 'Kjalvegur / F35',
      AstandYfirbord: 'GREIDFAERT',
    }),
    record({
      IdButur: 3,
      FulltNafnButs: 'Sprengisandsleið / F26',
      AstandYfirbord: 'LOKAD',
    }),
  ];

  it('resolves road ids from Gagnaveita names', () => {
    expect(resolveRoadIdFromGagnaveitaRecord(payload[0]!)).toBe('F208');
    expect(resolveRoadIdFromGagnaveitaRecord(payload[1]!)).toBe('F35');
    expect(resolveRoadIdFromGagnaveitaRecord(payload[2]!)).toBe('F26');
  });

  it('maps F35 and F26 independently (not F208-only)', () => {
    const f35 = mapGagnaveitaPayloadToRoadStatus(payload, 'F35');
    const f26 = mapGagnaveitaPayloadToRoadStatusForId(payload, 'F26');
    expect(f35?.currentStatus).toBe('open');
    expect(f26?.currentStatus).toBe('closed');
    expect(mapGagnaveitaPayloadToRoadStatus(payload, 'F910')).toBeNull();
  });

  it('prefers Herðubreiðarlind as F910 over generic Öskjuleið', () => {
    expect(
      resolveRoadIdFromGagnaveitaRecord(
        record({
          FulltNafnButs: 'Öskjuleið að Herðubreiðarlindum',
          AstandYfirbord: 'LOKAD',
        }),
      ),
    ).toBe('F910');
  });

  it('resolves Icelandic corridor names from live fixture snapshot', () => {
    const fixturePath = join(
      process.cwd(),
      'scripts/fixtures/gagnaveita-faerd2017_1-live-2026-07-10.json',
    );
    const records = JSON.parse(readFileSync(fixturePath, 'utf8')) as GagnaveitaFaerdRecord[];
    const ids = listRoadIdsInGagnaveitaPayload(records);
    expect(ids).toEqual(
      expect.arrayContaining(['F208', 'F26', 'F35', 'F210', 'F249', 'F910']),
    );
    expect(mapGagnaveitaPayloadToRoadStatusForId(records, 'F208')).toBeTruthy();
    expect(mapGagnaveitaPayloadToRoadStatusForId(records, 'F35')).toBeTruthy();
  });

  it('maps Snjomokstursregla into RoadStatus.plow (range, not point ETA)', () => {
    const payload = [
      record({
        IdButur: 10,
        FulltNafnButs: 'Fjallabaksleið nyrðri / F208',
        AstandYfirbord: 'GREIDFAERT',
        Snjomokstursregla: '5X',
      }),
      record({
        IdButur: 11,
        FulltNafnButs: 'Fjallabaksleið nyrðri / F208',
        AstandYfirbord: 'GREIDFAERT',
        Snjomokstursregla: 'EKKI_MOKAD',
      }),
    ];
    const status = mapGagnaveitaPayloadToRoadStatus(payload, 'F208');
    expect(status?.plow?.serviceBand).toBe('NOT_PLOWED');
    expect(status?.plow?.ruleCode).toBe('EKKI_MOKAD');
    expect(status?.plow?.delayRangeMin).toBeUndefined();
  });
});
