import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AccommodationOverviewInclude =
  | 'stats'
  | 'nights'
  | 'reminders'
  | 'travel'
  | 'files';

export class AccommodationCrossDayInfoDto {
  @ApiProperty()
  isCrossDay!: boolean;

  @ApiProperty()
  crossDays!: number;

  @ApiProperty()
  isCheckoutItem!: boolean;

  @ApiProperty({ enum: ['checkin', 'checkout', 'normal'] })
  displayMode!: 'checkin' | 'checkout' | 'normal';

  @ApiProperty()
  timeLabels!: { start: string; end: string };
}

export class AccommodationPlaceSummaryDto {
  @ApiPropertyOptional()
  nameCN?: string | null;

  @ApiPropertyOptional()
  nameEN?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  address?: string | null;

  @ApiPropertyOptional()
  photoUrl?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  coordinates?: { lat: number; lng: number } | null;
}

export class AccommodationBookingDto {
  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional()
  confirmation?: string | null;

  @ApiPropertyOptional()
  url?: string | null;

  @ApiPropertyOptional()
  bookedAt?: string | null;
}

export class AccommodationBookingDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  mimeType?: string;

  @ApiPropertyOptional({ enum: ['note', 'trip_file', 'confirmation'] })
  source?: 'note' | 'trip_file' | 'confirmation';
}

export class AccommodationAlternativeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  placeId?: number | null;

  @ApiPropertyOptional()
  priceHint?: string | null;

  @ApiPropertyOptional()
  url?: string | null;
}

export class AccommodationTravelToDto {
  @ApiPropertyOptional()
  durationMinutes?: number | null;

  @ApiPropertyOptional()
  distanceMeters?: number | null;

  @ApiPropertyOptional()
  travelMode?: string | null;

  @ApiProperty()
  fromLabel!: string;

  @ApiProperty()
  isLongSegment!: boolean;
}

export class AccommodationNightCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tripDayId!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty()
  dayNumber!: number;

  @ApiProperty({ enum: ['checkin', 'checkout', 'normal'] })
  displayMode!: 'checkin' | 'checkout' | 'normal';

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  placeId?: number | null;

  @ApiPropertyOptional({ type: AccommodationPlaceSummaryDto })
  place?: AccommodationPlaceSummaryDto;

  @ApiProperty({ type: AccommodationBookingDto })
  booking!: AccommodationBookingDto;

  @ApiPropertyOptional()
  roomType?: string | null;

  @ApiPropertyOptional()
  roomCount?: number | null;

  @ApiProperty({ type: AccommodationCrossDayInfoDto })
  crossDayInfo!: AccommodationCrossDayInfoDto;

  @ApiPropertyOptional({ type: [AccommodationAlternativeDto] })
  alternatives?: AccommodationAlternativeDto[];

  @ApiProperty({ type: [AccommodationBookingDocumentDto] })
  bookingDocuments!: AccommodationBookingDocumentDto[];

  @ApiProperty({ type: [String] })
  linkedTripFileIds!: string[];

  @ApiPropertyOptional({ type: AccommodationTravelToDto })
  travelToAccommodation?: AccommodationTravelToDto;

  @ApiPropertyOptional()
  estimatedCost?: number | null;

  @ApiPropertyOptional()
  currency?: string | null;

  @ApiPropertyOptional()
  startTime?: string | null;

  @ApiPropertyOptional()
  endTime?: string | null;
}

export class AccommodationOverviewStatsDto {
  @ApiProperty()
  totalNights!: number;

  @ApiProperty()
  bookedCount!: number;

  @ApiProperty()
  needBookingCount!: number;

  @ApiProperty()
  missingDocumentCount!: number;

  @ApiProperty()
  checkoutDaysCount!: number;
}

export class AccommodationReminderDto {
  @ApiProperty({ enum: ['need_booking', 'missing_document', 'long_travel', 'checkout'] })
  type!: 'need_booking' | 'missing_document' | 'long_travel' | 'checkout';

  @ApiProperty({ enum: ['info', 'warning'] })
  severity!: 'info' | 'warning';

  @ApiProperty()
  itineraryItemId!: string;

  @ApiProperty()
  tripDayId!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;
}

export class AccommodationTravelSummaryDto {
  @ApiProperty()
  totalDistance!: number;

  @ApiProperty()
  totalDuration!: number;

  @ApiProperty()
  longSegmentCount!: number;
}

export class AccommodationOverviewResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty({ type: AccommodationOverviewStatsDto })
  stats!: AccommodationOverviewStatsDto;

  @ApiProperty({ type: [AccommodationNightCardDto] })
  nights!: AccommodationNightCardDto[];

  @ApiProperty({ type: [AccommodationReminderDto] })
  reminders!: AccommodationReminderDto[];

  @ApiPropertyOptional({ type: AccommodationTravelSummaryDto })
  travelSummary?: AccommodationTravelSummaryDto;

  @ApiProperty()
  generatedAt!: string;
}
