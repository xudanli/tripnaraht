import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTripPdfDocument, type TripPdfSource } from './build-trip-pdf-document';
import { renderTripPdf } from './render-trip-pdf';

export interface TripPdfFile {
  filename: string;
  buffer: Buffer;
}

@Injectable()
export class TripPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async exportPdf(tripId: string, userId: string): Promise<TripPdfFile> {
    const id = tripId?.trim();
    if (!id) {
      throw new NotFoundException('行程不存在');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        TripCollaborator: { select: { userId: true } },
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              include: {
                Place: {
                  select: {
                    nameCN: true,
                    nameEN: true,
                    address: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${id} 不存在`);
    }
    if (!canReadTripPdf(trip, userId)) {
      throw new ForbiddenException('无权导出该行程，需要为行程成员');
    }

    const document = buildTripPdfDocument(toPdfSource(trip));
    const buffer = await renderTripPdf(document);
    return { filename: document.filename, buffer };
  }
}

export function canReadTripPdf(
  trip: { metadata: unknown; TripCollaborator: Array<{ userId: string }> },
  userId: string,
): boolean {
  if (userId === 'anonymous-dev-user') return true;
  if (trip.TripCollaborator.some((collaborator) => collaborator.userId === userId)) return true;
  const metadataUserId = (trip.metadata as { userId?: string } | null)?.userId;
  return metadataUserId === userId;
}

function toPdfSource(trip: {
  name: string | null;
  destination: string;
  startDate: Date;
  endDate: Date;
  status: string | null;
  TripDay: Array<{
    date: Date;
    ItineraryItem: Array<{
      startTime: Date | null;
      endTime: Date | null;
      type: string;
      note: string | null;
      travelFromPreviousDuration: number | null;
      travelMode: string | null;
      estimatedCost: number | null;
      currency: string | null;
      bookingStatus: string | null;
      Place: {
        nameCN: string | null;
        nameEN: string | null;
        address: string | null;
        category: string;
      } | null;
    }>;
  }>;
}): TripPdfSource {
  return {
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    days: trip.TripDay.map((day) => ({
      date: day.date,
      items: day.ItineraryItem.map((item) => ({
        startTime: item.startTime,
        endTime: item.endTime,
        type: item.type,
        note: item.note,
        travelFromPreviousDuration: item.travelFromPreviousDuration,
        travelMode: item.travelMode,
        estimatedCost: item.estimatedCost,
        currency: item.currency,
        bookingStatus: item.bookingStatus,
        place: item.Place
          ? {
              nameCN: item.Place.nameCN,
              nameEN: item.Place.nameEN,
              address: item.Place.address,
              category: item.Place.category,
            }
          : null,
      })),
    })),
  };
}
