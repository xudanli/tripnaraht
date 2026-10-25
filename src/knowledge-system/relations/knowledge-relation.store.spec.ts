import {
  persistProjectedKnowledgeRelations,
  relationToRow,
  rowToRelation,
} from './knowledge-relation.store';
import { inferCountryFromEntityId } from './infer-country-from-entity-id.util';
import type { KnowledgeRelation } from '../contracts/knowledge-relation.types';

describe('inferCountryFromEntityId', () => {
  it('reads ISO-2 from CPRE and colon ids', () => {
    expect(inferCountryFromEntityId('is.gullfoss')).toBe('IS');
    expect(inferCountryFromEntityId('segment:is:f208')).toBe('IS');
    expect(inferCountryFromEntityId('place:db:123')).toBeUndefined();
    expect(inferCountryFromEntityId('spatial-poi:abc')).toBeUndefined();
  });
});

describe('knowledge-relation store mapping', () => {
  it('round-trips projected relation fields', () => {
    const rel: KnowledgeRelation = {
      relationId: 'poi_alt:is.dyrholaey:is.reynisfjara:hard',
      type: 'ALTERNATIVE_TO',
      from: 'is.dyrholaey',
      to: 'is.reynisfjara',
      confidence: 0.9,
      source: 'poi_alternatives',
      sourceRef: 'iceland-poi-alternatives',
      country: 'IS',
      metadata: { reason: 'test' },
    };
    const row = relationToRow(rel);
    const back = rowToRelation({
      ...row,
      validFrom: null,
      validTo: null,
    });
    expect(back.relationId).toBe(rel.relationId);
    expect(back.from).toBe(rel.from);
    expect(back.to).toBe(rel.to);
    expect(back.country).toBe('IS');
    expect(back.type).toBe('ALTERNATIVE_TO');
  });

  it('does not treat manual as projected in persist filter contract', () => {
    const manual: KnowledgeRelation = {
      relationId: 'manual:a:b',
      type: 'NEAR',
      from: 'is.a',
      to: 'is.b',
      confidence: 1,
      source: 'manual',
    };
    expect(relationToRow(manual).source).toBe('manual');
  });

  it('persistProjectedKnowledgeRelations no-ops when DB is down', async () => {
    const r = await persistProjectedKnowledgeRelations(
      { isDbConnected: () => false } as never,
      [],
    );
    expect(r).toEqual({ upserted: 0, deleted: 0 });
  });
});
