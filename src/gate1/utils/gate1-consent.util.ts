import {
  GATE1_CONSENT_TYPES,
  Gate1ConsentType,
} from '../constants/gate1.constants';

type ConsentRecord = {
  consentType: string | null;
  status: string;
  scope?: unknown;
};

function isLegacyHumanAssisted(record: ConsentRecord): boolean {
  if (record.status !== 'GRANTED') return false;
  if (record.consentType === 'LEGACY_BUNDLED' || record.consentType === null) {
    const scope = record.scope as { humanAssisted?: boolean } | null;
    return scope?.humanAssisted === true;
  }
  return false;
}

export function hasGrantedConsent(
  records: ConsentRecord[],
  type: Gate1ConsentType,
): boolean {
  const granted = records.filter((r) => r.status === 'GRANTED');
  if (granted.some((r) => r.consentType === type)) return true;
  if (type === 'BASE_SERVICE') {
    return granted.some(
      (r) =>
        r.consentType === 'BASE_SERVICE' ||
        r.consentType === 'LEGACY_BUNDLED' ||
        isLegacyHumanAssisted(r),
    );
  }
  if (type === 'HUMAN_ASSISTED') {
    return granted.some(
      (r) => r.consentType === 'HUMAN_ASSISTED' || isLegacyHumanAssisted(r),
    );
  }
  return granted.some((r) => r.consentType === type);
}

export function canSubmitPublicPreferences(records: ConsentRecord[]): boolean {
  return hasGrantedConsent(records, 'BASE_SERVICE') && hasGrantedConsent(records, 'HUMAN_ASSISTED');
}

export function canSubmitPrivateConstraints(records: ConsentRecord[]): boolean {
  return hasGrantedConsent(records, 'HUMAN_ASSISTED');
}

export function buildConsentStatus(records: ConsentRecord[]) {
  return GATE1_CONSENT_TYPES.map((type) => ({
    type,
    granted: hasGrantedConsent(records, type),
    required: type === 'BASE_SERVICE' || type === 'HUMAN_ASSISTED',
  }));
}
