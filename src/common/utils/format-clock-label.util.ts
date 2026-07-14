import { DateTime } from 'luxon';

/** 行程墙钟默认时区（冰岛全年 UTC；作为 display 默认口径） */
export const DEFAULT_TRIP_DISPLAY_TIMEZONE = 'Atlantic/Reykjavik';

export type FormatClockLabelOptions = {
  /** 转成该时区墙钟；缺省保留字串自身 offset（setZone） */
  timezone?: string;
  /** 空值文案；默认「待确认」 */
  emptyLabel?: string;
};

/**
 * 用户可见时刻：ISO / Date / HH:mm → HH:mm。
 * 契约：结构化字段继续用 ISO；中文 title/description/label/summary 只允许本函数产物。
 */
export function formatClockLabel(
  value: string | Date | undefined | null,
  options?: FormatClockLabelOptions,
): string {
  const empty = options?.emptyLabel ?? '待确认';
  if (value == null) return empty;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return empty;
    let dt = DateTime.fromJSDate(value, { zone: 'utc' });
    if (options?.timezone) dt = dt.setZone(options.timezone);
    return dt.isValid ? dt.toFormat('HH:mm') : empty;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return empty;

  const plain = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (plain) {
    return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  }

  let dt = DateTime.fromISO(trimmed, { setZone: true });
  if (dt.isValid) {
    if (options?.timezone) dt = dt.setZone(options.timezone);
    return dt.toFormat('HH:mm');
  }

  const isoMatch = /T(\d{2}:\d{2})/.exec(trimmed);
  if (isoMatch) return isoMatch[1];

  return trimmed;
}

/** 可选标签：空值返回 undefined（给 *Label 双字段契约用） */
export function formatClockLabelOptional(
  value: string | Date | undefined | null,
  options?: FormatClockLabelOptions,
): string | undefined {
  if (value == null || (typeof value === 'string' && !value.trim())) return undefined;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  const label = formatClockLabel(value, { ...options, emptyLabel: '' });
  return label || undefined;
}

/** 从 ISO/钟点解析 0–23 小时；失败返回 undefined */
export function parseClockHour(
  value: string | Date | undefined | null,
  options?: FormatClockLabelOptions,
): number | undefined {
  const label = formatClockLabelOptional(value, options);
  if (!label) return undefined;
  const hour = Number(label.slice(0, 2));
  return Number.isFinite(hour) ? hour : undefined;
}
