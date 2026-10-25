import { DateTime } from 'luxon';

const ZONE = 'Asia/Shanghai';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  RECRUITING: '招募中',
  FORMING: '预成团',
  PLANNING: '规划中',
  TRAVELING: '旅行中',
  IN_PROGRESS: '旅行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  ACTIVITY: '活动',
  REST: '休息',
  MEAL_ANCHOR: '正餐',
  MEAL_FLOATING: '用餐',
  TRANSIT: '交通',
};

const PLACE_CATEGORY_LABEL: Record<string, string> = {
  ATTRACTION: '景点',
  RESTAURANT: '餐饮',
  SHOPPING: '购物',
  HOTEL: '住宿',
  TRANSIT_HUB: '交通枢纽',
  HOSPITAL: '医疗',
  SUPPLY: '补给',
  SERVICE: '服务',
};

const TRAVEL_MODE_LABEL: Record<string, string> = {
  driving: '驾车',
  DRIVING: '驾车',
  walking: '步行',
  WALKING: '步行',
  transit: '公共交通',
  TRANSIT: '公共交通',
  cycling: '骑行',
};

export interface TripPdfPlaceSource {
  nameCN?: string | null;
  nameEN?: string | null;
  address?: string | null;
  category?: string | null;
}

export interface TripPdfItemSource {
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  type?: string | null;
  note?: string | null;
  travelFromPreviousDuration?: number | null;
  travelMode?: string | null;
  estimatedCost?: number | null;
  currency?: string | null;
  bookingStatus?: string | null;
  place?: TripPdfPlaceSource | null;
}

export interface TripPdfDaySource {
  date: Date | string;
  items: TripPdfItemSource[];
}

export interface TripPdfSource {
  name?: string | null;
  destination?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status?: string | null;
  days: TripPdfDaySource[];
}

export interface TripPdfItemView {
  timeLabel: string;
  title: string;
  lines: string[];
}

export interface TripPdfDayView {
  heading: string;
  items: TripPdfItemView[];
  emptyLabel?: string;
}

export interface TripPdfDocument {
  title: string;
  filename: string;
  subtitle: string;
  metaLines: string[];
  days: TripPdfDayView[];
  emptyMessage?: string;
}

export function buildTripPdfDocument(source: TripPdfSource, now = new Date()): TripPdfDocument {
  const title = clean(source.name) || clean(source.destination) || '未命名行程';
  const destination = clean(source.destination);
  const start = formatDay(source.startDate);
  const end = formatDay(source.endDate);
  const status = STATUS_LABEL[source.status ?? ''] ?? (clean(source.status) || '未设置');
  const days = [...source.days]
    .sort((a, b) => toMillis(a.date) - toMillis(b.date))
    .map((day, index) => buildDay(day, index));

  const metaLines = [
    `目的地：${destination || '未填写'}`,
    `日期：${start} 至 ${end}`,
    `状态：${status}`,
    `天数：${days.length} 天`,
    `导出时间：${formatDateTime(now)}`,
  ];

  return {
    title,
    filename: `${safeFilename(title)}.pdf`,
    subtitle: destination && destination !== title ? destination : 'TripNara 行程单',
    metaLines,
    days,
    ...(days.length === 0 ? { emptyMessage: '这份行程还没有日程。' } : {}),
  };
}

function buildDay(day: TripPdfDaySource, index: number): TripPdfDayView {
  const items = [...day.items].sort((a, b) => itemSortKey(a) - itemSortKey(b)).map(buildItem);
  return {
    heading: `第 ${index + 1} 天 · ${formatDayWithWeekday(day.date)}`,
    items,
    ...(items.length === 0 ? { emptyLabel: '当日暂无安排' } : {}),
  };
}

function buildItem(item: TripPdfItemSource): TripPdfItemView {
  const placeName = clean(item.place?.nameCN) || clean(item.place?.nameEN);
  const typeLabel = ITEM_TYPE_LABEL[item.type ?? ''] ?? '安排';
  const title = placeName || firstLine(item.note) || typeLabel;
  const lines: string[] = [];

  const category = item.place?.category ? PLACE_CATEGORY_LABEL[item.place.category] : undefined;
  const detailBits = [typeLabel, category].filter((bit): bit is string => !!bit && bit !== title);
  if (detailBits.length) lines.push(detailBits.join(' · '));

  const address = clean(item.place?.address);
  if (address && address !== title) lines.push(address);

  const travel = formatTravel(item);
  if (travel) lines.push(travel);

  const cost = formatCost(item);
  if (cost) lines.push(cost);

  if (isBooked(item.bookingStatus)) lines.push('已预订');

  const note = clean(item.note);
  if (note && note !== title) lines.push(truncate(note, 240));

  return {
    timeLabel: formatTimeRange(item.startTime, item.endTime),
    title,
    lines,
  };
}

function formatTravel(item: TripPdfItemSource): string | undefined {
  const minutes = item.travelFromPreviousDuration;
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const mode = item.travelMode ? TRAVEL_MODE_LABEL[item.travelMode] ?? item.travelMode : undefined;
  const duration = formatDuration(minutes);
  return mode ? `距上一站 ${mode}约 ${duration}` : `距上一站约 ${duration}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} 小时 ${rest} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  return `${rest} 分钟`;
}

function formatCost(item: TripPdfItemSource): string | undefined {
  if (item.estimatedCost == null || !Number.isFinite(item.estimatedCost)) return undefined;
  const currency = clean(item.currency) || 'CNY';
  return `预估 ${currency} ${trimNumber(item.estimatedCost)}`;
}

function isBooked(status?: string | null): boolean {
  const value = (status ?? '').toUpperCase();
  return value === 'BOOKED' || value === 'CONFIRMED';
}

function formatTimeRange(start?: Date | string | null, end?: Date | string | null): string {
  const startLabel = formatClock(start);
  const endLabel = formatClock(end);
  if (startLabel && endLabel) return `${startLabel}-${endLabel}`;
  return startLabel || '时间待定';
}

function formatClock(value?: Date | string | null): string | undefined {
  const date = toDateTime(value);
  if (!date) return undefined;
  return date.toFormat('HH:mm');
}

function formatDay(value: Date | string): string {
  return toDateTime(value)?.toFormat('yyyy-MM-dd') ?? '日期待定';
}

function formatDayWithWeekday(value: Date | string): string {
  return toDateTime(value)?.setLocale('zh').toFormat('M月d日 cccc') ?? '日期待定';
}

function formatDateTime(value: Date): string {
  return DateTime.fromJSDate(value).setZone(ZONE).toFormat('yyyy-MM-dd HH:mm');
}

function toDateTime(value?: Date | string | null): DateTime | undefined {
  if (value == null || value === '') return undefined;
  const date = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(String(value));
  if (!date.isValid) return undefined;
  return date.setZone(ZONE);
}

function toMillis(value?: Date | string | null): number {
  return toDateTime(value)?.toMillis() ?? Number.POSITIVE_INFINITY;
}

function itemSortKey(item: TripPdfItemSource): number {
  return toMillis(item.startTime);
}

function clean(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function firstLine(value?: string | null): string {
  const text = clean(value);
  if (!text) return '';
  return text.split(/[。！？\n]/)[0]?.trim() || text;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function safeFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || '行程').slice(0, 80);
}
