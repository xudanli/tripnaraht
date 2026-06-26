/**
 * Narrative Theme Service — intake / select / regenerate / persist
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  encodeTravelStoryform,
  storyformFromThemeMetadata,
  defaultReflectionMode,
} from '../encoders/travel-dna.encoder';
import { NarrativeThemeGeneratorService } from './narrative-theme-generator.service';
import type {
  GenerateCandidatesResult,
  NarrativeIntakeInput,
  NarrativePendingSession,
  ThemeCandidate,
  TravelStoryform,
  TripNarrativeThemeMetadata,
} from '../types/travel-storyform.types';
import {
  buildNarrativeThemeClearedEnvelope,
  buildNarrativeThemeSelectedEnvelope,
} from '../events/narrative-theme-event.builder';

const MAX_REGENERATE = 3;
const CANDIDATE_TTL_MS = 60 * 60 * 1000;

type TripMetadata = Record<string, unknown>;

@Injectable()
export class NarrativeThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: NarrativeThemeGeneratorService,
    private readonly travelEventPersistence: TravelEventPersistenceService,
  ) {}

  async generateCandidates(
    tripId: string,
    intake: NarrativeIntakeInput,
    options?: { locale?: string; requestId?: string },
  ): Promise<GenerateCandidatesResult> {
    const trip = await this.requireTrip(tripId);
    const tripDays = this.computeTripDays(trip.startDate, trip.endDate);

    const storyform = encodeTravelStoryform({
      intake,
      trip: { destination: trip.destination, tripDays },
    });

    const candidates = await this.generator.generate(storyform, {
      locale: options?.locale,
      seed: 0,
    });

    return this.persistPendingSession(tripId, intake, candidates, 0);
  }

  async regenerateCandidates(
    tripId: string,
    generationRequestId: string,
  ): Promise<GenerateCandidatesResult> {
    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);
    const pending = this.readPending(metadata);

    if (!pending || pending.generationRequestId !== generationRequestId) {
      throw new BadRequestException({
        code: 'NARRATIVE_THEME_NOT_FOUND',
        message: 'No matching theme generation session',
      });
    }

    this.assertSessionValid(pending);

    if (pending.regenerateCount >= MAX_REGENERATE) {
      throw new HttpException(
        {
          code: 'NARRATIVE_REGENERATE_LIMIT',
          message: `Maximum ${MAX_REGENERATE} regenerations reached`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const tripDays = this.computeTripDays(trip.startDate, trip.endDate);
    const nextCount = pending.regenerateCount + 1;
    const storyform = encodeTravelStoryform({
      intake: pending.intakeSnapshot,
      trip: { destination: trip.destination, tripDays },
      meta: { regenerateCount: nextCount },
    });

    const candidates = await this.generator.generate(storyform, {
      seed: nextCount,
    });

    return this.persistPendingSession(
      tripId,
      pending.intakeSnapshot,
      candidates,
      nextCount,
    );
  }

  async selectTheme(
    tripId: string,
    themeId: string,
    generationRequestId: string,
    userId?: string,
    requestId?: string,
  ): Promise<TripNarrativeThemeMetadata> {
    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);
    const pending = this.readPending(metadata);

    if (!pending || pending.generationRequestId !== generationRequestId) {
      throw new BadRequestException({
        code: 'NARRATIVE_THEME_NOT_FOUND',
        message: 'Theme session not found for this generationRequestId',
      });
    }

    this.assertSessionValid(pending);

    const candidate = pending.candidates.find((c) => c.id === themeId);
    if (!candidate) {
      throw new BadRequestException({
        code: 'NARRATIVE_THEME_NOT_FOUND',
        message: 'themeId does not match recent candidates',
      });
    }

    const theme: TripNarrativeThemeMetadata = {
      schemaVersion: 1,
      selectedThemeId: candidate.id,
      title: candidate.title,
      tagline: candidate.tagline,
      arcTemplate: candidate.arcTemplate,
      reflectionMode: defaultReflectionMode(candidate.arcTemplate),
      intakeSnapshot: pending.intakeSnapshot,
      selectedAt: new Date().toISOString(),
      generationRequestId,
      regenerateCount: pending.regenerateCount,
    };

    const nextMetadata: TripMetadata = {
      ...metadata,
      narrativeTheme: theme,
    };
    delete nextMetadata._narrativePending;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: nextMetadata as object },
    });

    await this.travelEventPersistence.persist(
      buildNarrativeThemeSelectedEnvelope({ tripId, theme, userId, requestId }),
    );

    return theme;
  }

  /** quick-plan / bootstrap：跳过 pending session，直接写入已选主题 */
  async applyThemeDirect(
    tripId: string,
    candidate: ThemeCandidate,
    intake: NarrativeIntakeInput,
    options?: {
      generationRequestId?: string;
      regenerateCount?: number;
      userId?: string;
      requestId?: string;
    },
  ): Promise<TripNarrativeThemeMetadata> {
    const trip = await this.requireTrip(tripId);

    const theme: TripNarrativeThemeMetadata = {
      schemaVersion: 1,
      selectedThemeId: candidate.id,
      title: candidate.title,
      tagline: candidate.tagline,
      arcTemplate: candidate.arcTemplate,
      reflectionMode: defaultReflectionMode(candidate.arcTemplate),
      intakeSnapshot: intake,
      selectedAt: new Date().toISOString(),
      generationRequestId: options?.generationRequestId,
      regenerateCount: options?.regenerateCount ?? 0,
    };

    const metadata = this.readMetadata(trip.metadata);
    delete metadata._narrativePending;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          narrativeTheme: theme,
        } as object,
      },
    });

    await this.travelEventPersistence.persist(
      buildNarrativeThemeSelectedEnvelope({
        tripId,
        theme,
        userId: options?.userId,
        requestId: options?.requestId,
      }),
    );

    return theme;
  }

  async getTheme(tripId: string): Promise<TravelStoryform | null> {
    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);
    const theme = metadata.narrativeTheme as TripNarrativeThemeMetadata | undefined;
    if (!theme) {
      return null;
    }

    const tripDays = this.computeTripDays(trip.startDate, trip.endDate);
    return storyformFromThemeMetadata(theme, {
      destination: trip.destination,
      tripDays,
    });
  }

  async getThemeMetadata(
    tripId: string,
  ): Promise<TripNarrativeThemeMetadata | null> {
    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);
    return (metadata.narrativeTheme as TripNarrativeThemeMetadata | undefined) ?? null;
  }

  async clearTheme(
    tripId: string,
    userId?: string,
    requestId?: string,
  ): Promise<void> {
    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);

    if (!metadata.narrativeTheme && !metadata._narrativePending) {
      return;
    }

    const nextMetadata: TripMetadata = { ...metadata };
    delete nextMetadata.narrativeTheme;
    delete nextMetadata._narrativePending;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: nextMetadata as object },
    });

    await this.travelEventPersistence.persist(
      buildNarrativeThemeClearedEnvelope({ tripId, userId, requestId }),
    );
  }

  private async persistPendingSession(
    tripId: string,
    intake: NarrativeIntakeInput,
    candidates: ThemeCandidate[],
    regenerateCount: number,
  ): Promise<GenerateCandidatesResult> {
    const generationRequestId = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + CANDIDATE_TTL_MS).toISOString();

    const session: NarrativePendingSession = {
      generationRequestId,
      candidates,
      intakeSnapshot: intake,
      regenerateCount,
      expiresAt,
      createdAt: new Date(now).toISOString(),
    };

    const trip = await this.requireTrip(tripId);
    const metadata = this.readMetadata(trip.metadata);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          _narrativePending: session,
        } as object,
      },
    });

    return {
      candidates,
      generationRequestId,
      regenerateCount,
      expiresAt,
    };
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: `Trip ${tripId} not found`,
      });
    }
    return trip;
  }

  private readMetadata(raw: unknown): TripMetadata {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { ...(raw as TripMetadata) };
    }
    return {};
  }

  private readPending(metadata: TripMetadata): NarrativePendingSession | undefined {
    const pending = metadata._narrativePending;
    if (!pending || typeof pending !== 'object') {
      return undefined;
    }
    return pending as NarrativePendingSession;
  }

  private assertSessionValid(pending: NarrativePendingSession): void {
    if (Date.parse(pending.expiresAt) < Date.now()) {
      throw new BadRequestException({
        code: 'NARRATIVE_GENERATION_EXPIRED',
        message: 'Theme candidates have expired; submit intake again',
      });
    }
  }

  private computeTripDays(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)) + 1);
  }
}
