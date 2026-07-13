import { projectActiveSosRead, extractActiveSosRecord } from './sos-active.util';

describe('sos-active.util', () => {
  const openRecord = {
    lastEmergencySOS: {
      sosId: 'sos-1',
      type: 'medical',
      userId: 'user-a',
      message: 'help',
      sentAt: '2026-07-08T12:00:00.000Z',
      status: 'SENT',
      coordinates: { latitude: 64.66, longitude: -20.91 },
    },
  };

  it('projects active SOS read model', () => {
    const dto = projectActiveSosRead(openRecord);
    expect(dto.active).toBe(true);
    expect(dto.sos?.sosId).toBe('sos-1');
    expect(dto.sos?.status).toBe('open');
    expect(dto.sos?.location).toEqual({ lat: 64.66, lng: -20.91 });
  });

  it('returns inactive when SOS resolved', () => {
    const dto = projectActiveSosRead({
      lastEmergencySOS: { ...openRecord.lastEmergencySOS, status: 'RESOLVED' },
    });
    expect(dto.active).toBe(false);
    expect(extractActiveSosRecord({
      lastEmergencySOS: { ...openRecord.lastEmergencySOS, status: 'RESOLVED' },
    })).toBeNull();
  });
});
