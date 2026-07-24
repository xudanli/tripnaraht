import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResearchEventInput {
  eventName: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

@Injectable()
export class ResearchSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async appendEvents(sessionId: string, userId: string, events: ResearchEventInput[]) {
    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      return { accepted: 0, sessionId };
    }

    if (events.length === 0) {
      return { accepted: 0, sessionId };
    }

    await this.prisma.researchEvent.createMany({
      data: events.map((e) => ({
        sessionId,
        eventName: e.eventName,
        payload: (e.payload ?? {}) as Prisma.InputJsonValue,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
      })),
    });

    return { accepted: events.length, sessionId };
  }
}
