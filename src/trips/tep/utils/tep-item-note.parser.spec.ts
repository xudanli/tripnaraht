import { parseTepItemNote, tepNoteToMetadata } from './tep-item-note.parser';

describe('tep-item-note.parser', () => {
  it('parses _tep namespace without clobbering userNote', () => {
    const note = JSON.stringify({
      _tep: {
        schemaVersion: '1.0',
        importance: 'OPTIONAL',
        flexibility: 'REMOVABLE',
        routeSegmentId: 'segment:trip:leg1',
      },
      userNote: '黑沙滩停留',
    });

    const parsed = parseTepItemNote(note);
    expect(parsed.tep.importance).toBe('OPTIONAL');
    expect(parsed.tep.routeSegmentId).toBe('segment:trip:leg1');
    expect(parsed.userNote).toBe('黑沙滩停留');
    expect(parsed.degraded).toBe(false);
  });

  it('degrades gracefully on invalid JSON', () => {
    const parsed = parseTepItemNote('{not json');
    expect(parsed.degraded).toBe(true);
    expect(parsed.userNote).toBe('{not json');
  });

  it('maps legacy flat keys for backward compatibility', () => {
    const meta = tepNoteToMetadata(
      JSON.stringify({ tepImportance: 'MANDATORY', tepFlexibility: 'MOVABLE' }),
    );
    expect(meta.tepImportance).toBe('MANDATORY');
    expect(meta.tepFlexibility).toBe('MOVABLE');
  });
});
