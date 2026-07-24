/** 目的地当地紧急号码投影 */

export interface LocalEmergencyNumbersDto {
  countryCode: string;
  primary: string;
  police?: string;
  ambulance?: string;
  fire?: string;
  displayHint?: string;
}

const COUNTRY_DISPLAY_HINTS: Record<string, string> = {
  IS: '冰岛统一紧急号码 112',
  CN: '中国大陆报警 110，急救 120，火警 119',
  US: '美国统一紧急号码 911',
  JP: '日本报警 110，急救/火警 119',
  GB: '英国统一紧急号码 999',
};

export function projectLocalEmergencyNumbers(
  countryCode: string,
  emergency?: Record<string, unknown> | null,
): LocalEmergencyNumbersDto {
  const code = countryCode.toUpperCase();
  const police = pickString(emergency, ['police', 'policePhone']);
  const ambulance = pickString(emergency, ['ambulance', 'medical']);
  const fire = pickString(emergency, ['fire']);
  const unified = pickString(emergency, ['unified', 'primary', 'general']);

  const primary = unified ?? ambulance ?? police ?? defaultPrimary(code);
  const resolvedAmbulance = ambulance ?? primary;

  if (code === 'IS') {
    return {
      countryCode: code,
      primary: '112',
      police: police && police !== '112' ? police : '4441000',
      ambulance: resolvedAmbulance === '112' ? '112' : resolvedAmbulance,
      fire: fire ?? '112',
      displayHint: COUNTRY_DISPLAY_HINTS.IS,
    };
  }

  const resolvedPolice = police ?? primary;

  return {
    countryCode: code,
    primary,
    police: resolvedPolice,
    ambulance: resolvedAmbulance,
    fire: fire ?? primary,
    displayHint: COUNTRY_DISPLAY_HINTS[code] ?? `当地紧急号码 ${primary}`,
  };
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }
  return undefined;
}

function defaultPrimary(countryCode: string): string {
  if (countryCode === 'US') return '911';
  if (countryCode === 'CN') return '110';
  return '112';
}
