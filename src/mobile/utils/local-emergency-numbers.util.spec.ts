import { projectLocalEmergencyNumbers } from './local-emergency-numbers.util';

describe('local-emergency-numbers.util', () => {
  it('projects Iceland numbers with display hint', () => {
    const dto = projectLocalEmergencyNumbers('IS', {
      police: '112',
      medical: '112',
    });
    expect(dto.countryCode).toBe('IS');
    expect(dto.primary).toBe('112');
    expect(dto.police).toBe('4441000');
    expect(dto.ambulance).toBe('112');
    expect(dto.displayHint).toContain('112');
  });

  it('falls back when country profile missing', () => {
    const dto = projectLocalEmergencyNumbers('XX', null);
    expect(dto.primary).toBe('112');
    expect(dto.countryCode).toBe('XX');
  });
});
