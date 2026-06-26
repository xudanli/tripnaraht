import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { bumpTripRevisionMetadata } from '../trip-constraint-solver/utils/trip-revision.util';

/**
 * Bumps authoritative trip revision in metadata.revision after itinerary mutations.
 */
@Injectable()
export class TripRevisionBumpService {
  constructor(private readonly prisma: PrismaService) {}

  async bump(tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return 0;

    const meta = bumpTripRevisionMetadata(trip.metadata);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: meta as object,
        updatedAt: new Date(),
      },
    });
    return typeof meta.revision === 'number' ? meta.revision : 0;
  }
}
