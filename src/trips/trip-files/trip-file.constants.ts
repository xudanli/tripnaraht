export const TRIP_FILE_CATEGORIES = [
  {
    id: 'booking',
    title: '预订凭证',
    description: '机票、酒店、活动预订确认',
  },
  {
    id: 'travel',
    title: '出行资料',
    description: '行程单、交通票、地图',
  },
  {
    id: 'insurance',
    title: '保险',
    description: '旅行保险单及理赔资料',
  },
  {
    id: 'receipts',
    title: '收据',
    description: '消费收据与报销凭证',
  },
  {
    id: 'visa',
    title: '签证',
    description: '签证、护照复印件',
  },
  {
    id: 'team',
    title: '团队共享',
    description: '团队内共享文件',
  },
] as const;

export type TripFileCategoryId = (typeof TRIP_FILE_CATEGORIES)[number]['id'];

export const TRIP_FILE_CATEGORY_IDS = TRIP_FILE_CATEGORIES.map((c) => c.id);

export const TRIP_FILE_STATUSES = ['UPLOADED', 'PENDING', 'EXPIRED'] as const;
export type TripFileStatus = (typeof TRIP_FILE_STATUSES)[number];

export const DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
export const EXPIRING_SOON_DAYS = 30;
export const MAX_TRIP_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_TRIP_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
] as const;
