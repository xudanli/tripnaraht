import { TRIP_FILE_CATEGORY_IDS, TRIP_FILE_STATUSES } from '../trip-file.constants';

export interface TripFileListQuery {
  category?: string;
  limit?: number;
  offset?: number;
  status?: string;
}

export interface TripFileItemDto {
  id: string;
  tripId: string;
  category: string;
  status: string;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number;
  title: string | null;
  description: string | null;
  expiresAt: string | null;
  itineraryItemId: string | null;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripFileListResponse {
  items: TripFileItemDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface TripFileCategoryStats {
  id: string;
  title: string;
  description: string;
  count: number;
}

export interface TripFileStatsResponse {
  totalCount: number;
  uploadedCount: number;
  pendingCount: number;
  expiringSoonCount: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  categories: TripFileCategoryStats[];
}

export interface TripFileDownloadResponse {
  fileId: string;
  fileName: string;
  mimeType: string | null;
  downloadUrl: string;
  expiresAt: string;
}

export interface CreateTripFilePendingDto {
  category: string;
  title?: string;
  description?: string;
  expiresAt?: string;
  itineraryItemId?: string;
}

export function isValidTripFileCategory(category: string): boolean {
  return (TRIP_FILE_CATEGORY_IDS as readonly string[]).includes(category);
}

export function isValidTripFileStatus(status: string): boolean {
  return (TRIP_FILE_STATUSES as readonly string[]).includes(status);
}
