import { ExtractedDocumentFields, FitDocumentType } from '../constants/project-fit-document.constants';

const DATE_PATTERN = /\b(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/;
const ID_NUMBER_PATTERN = /\b([A-Z0-9]{6,20})\b/;
const PASSPORT_PATTERN = /\b([A-Z]\d{7,8}|[EG]\d{8}|\d{9})\b/i;

const QUALIFICATION_KEYWORDS: Record<string, string[]> = {
  FIRST_AID: ['急救', 'first aid', 'cpr', '心肺复苏'],
  MOUNTAINEERING: ['登山', 'mountaineering', '高山'],
  DIVING: ['潜水', 'diving', 'padi', 'aow'],
  GUIDE_LICENSE: ['导游证', 'guide license', '领队证'],
};

export function parseDocumentFields(
  documentType: FitDocumentType,
  lines: string[],
): ExtractedDocumentFields {
  const text = lines.join('\n');
  const fields: ExtractedDocumentFields = { rawLines: lines };

  const dateMatch = text.match(DATE_PATTERN);
  if (dateMatch) {
    fields.expiryDate = normalizeDateToken(dateMatch[1]);
  }

  if (documentType === 'PASSPORT') {
    const passportMatch = text.match(PASSPORT_PATTERN);
    if (passportMatch) fields.documentNumber = passportMatch[1].toUpperCase();
  } else if (documentType === 'ID_CARD') {
    const idMatch = text.match(/\b(\d{17}[\dXx]|\d{15})\b/);
    if (idMatch) fields.documentNumber = idMatch[1].toUpperCase();
  } else {
    const generic = text.match(ID_NUMBER_PATTERN);
    if (generic) fields.documentNumber = generic[1];
  }

  const nameLine = lines.find((line) => /姓名|name/i.test(line));
  if (nameLine) {
    fields.fullName = nameLine.replace(/.*[:：]\s*/, '').trim() || undefined;
  }

  if (documentType === 'QUALIFICATION_CERT') {
    const qualificationTypes: string[] = [];
    const lower = text.toLowerCase();
    for (const [type, keywords] of Object.entries(QUALIFICATION_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()) || text.includes(kw))) {
        qualificationTypes.push(type);
      }
    }
    if (qualificationTypes.length) fields.qualificationTypes = qualificationTypes;
  }

  return fields;
}

function normalizeDateToken(raw: string): string {
  const digits = raw.replace(/[年月日]/g, '-').replace(/[./]/g, '-').replace(/-+/g, '-');
  const parts = digits.split('-').filter(Boolean);
  if (parts.length >= 3) {
    const [a, b, c] = parts;
    if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  return raw;
}

export function mergeQualificationsFromDocuments(
  existing: string[] | undefined,
  extracted: ExtractedDocumentFields[],
): string[] {
  const merged = new Set(existing ?? []);
  for (const doc of extracted) {
    for (const type of doc.qualificationTypes ?? []) {
      merged.add(type);
    }
  }
  return [...merged];
}
