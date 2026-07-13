import {
  EMERGENCY_SOS_TYPES,
  isEmergencySosType,
  mapLegacySosStatus,
  resolveEmergencySosType,
} from './emergency-sos.dto';

describe('emergency-sos.dto', () => {
  it('accepts canonical sos types', () => {
    for (const t of EMERGENCY_SOS_TYPES) {
      expect(isEmergencySosType(t)).toBe(true);
      expect(resolveEmergencySosType(t)).toBe(t);
    }
  });

  it('defaults missing type to other', () => {
    expect(resolveEmergencySosType(undefined)).toBe('other');
    expect(resolveEmergencySosType('')).toBe('other');
  });

  it('maps legacy storage status to public status', () => {
    expect(mapLegacySosStatus('SENT')).toBe('open');
    expect(mapLegacySosStatus('ACKNOWLEDGED')).toBe('acknowledged');
    expect(mapLegacySosStatus('IN_PROGRESS')).toBe('acknowledged');
    expect(mapLegacySosStatus('RESOLVED')).toBe('resolved');
  });
});
