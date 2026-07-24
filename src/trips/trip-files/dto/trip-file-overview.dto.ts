import type { TripFileStatsResponse } from './trip-file.dto';

export type TripFileOverviewSource =
  | 'trip_file'
  | 'itinerary_booking'
  | 'itinerary_link'
  | 'itinerary_pending';

export type TripFileOverviewStatus =
  | 'UPLOADED'
  | 'PENDING'
  | 'EXPIRED'
  | 'REFERENCE'
  | 'LINK';

export interface TripFileOverviewItem {
  id: string;
  source: TripFileOverviewSource;
  category: string;
  status: TripFileOverviewStatus | string;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number;
  description?: string | null;
  expiresAt?: string | null;
  itineraryItemId?: string | null;
  tripDayId?: string | null;
  tripDayDate?: string | null;
  itemType?: string | null;
  placeName?: string | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  downloadUrl?: string | null;
  uploadedByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  linkedTripFileIds?: string[];
}

export interface TripFileOverviewSources {
  tripFileCount: number;
  itineraryDocumentCount: number;
  itineraryPendingCount: number;
  itineraryLinkCount: number;
}

export interface TripFileOverviewQuery {
  category?: string;
  status?: string;
  source?: TripFileOverviewSource | string;
  limit?: number;
  offset?: number;
  /** 默认 true；false 时隐藏行程项推导的待补充占位 */
  includePending?: boolean;
}

export interface TripFileOverviewResponse {
  tripId: string;
  stats: TripFileStatsResponse;
  items: TripFileOverviewItem[];
  total: number;
  limit: number;
  offset: number;
  sources: TripFileOverviewSources;
  generatedAt: string;
}
