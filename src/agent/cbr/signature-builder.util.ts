import type { ConversionSignature } from './local-case-store.service';

export class SignatureBuilder {
  static buildConversionSignature(input: {
    conflict_type: ConversionSignature['conflict_type'];
    primary_violation_type?: string;
    region_id?: string | null;
    /** ISO date string */
    start_date?: string | null;
    month?: number | null;
  }): ConversionSignature {
    const month =
      typeof input.month === 'number' && Number.isFinite(input.month) && input.month >= 1 && input.month <= 12
        ? input.month
        : (() => {
            const d = input.start_date ? new Date(String(input.start_date)) : null;
            const m = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : undefined;
            return typeof m === 'number' && Number.isFinite(m) && m >= 1 && m <= 12 ? m : undefined;
          })();
    const region_id = input.region_id ? String(input.region_id) : undefined;
    const primary_violation_type = input.primary_violation_type ? String(input.primary_violation_type) : undefined;
    return {
      conflict_type: input.conflict_type,
      ...(primary_violation_type ? { primary_violation_type } : {}),
      ...(region_id ? { region_id } : {}),
      ...(typeof month === 'number' ? { month } : {}),
    };
  }
}

