import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NegotiationRegretReader } from '../utils/negotiation-regret.application';

/**
 * Derives “regret” signals from append-only revision history (latest ROLLBACK → parent’s alternative_id).
 */
@Injectable()
export class ItineraryRevisionRegretService implements NegotiationRegretReader {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Latest ROLLBACK row stores the superseded head’s `alternative_id` on the ROLLBACK record itself;
   * falls back to parent revision lookup for older rows.
   */
  async getAlternativeIdSupersededByLatestRollback(tripId: string): Promise<string | null> {
    const id = String(tripId ?? '').trim();
    if (!id || !this.prisma) return null;

    const rb = await this.prisma.itineraryRevision.findFirst({
      where: { tripId: id, kind: 'ROLLBACK' },
      orderBy: { createdAt: 'desc' },
    });
    if (!rb) return null;

    const direct = rb.alternativeId;
    if (direct != null && String(direct).trim() !== '') {
      return String(direct).trim();
    }

    if (!rb.parentRevisionId) return null;

    const parent = await this.prisma.itineraryRevision.findUnique({
      where: { id: rb.parentRevisionId },
    });
    const alt = parent?.alternativeId;
    return alt != null && String(alt).trim() !== '' ? String(alt).trim() : null;
  }
}
