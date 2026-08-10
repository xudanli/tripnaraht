import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { ObservationService } from './observation.service';
import type {
  AppendMediaInput,
  CreateObservationInput,
  ObservationIntent,
  ObservationSource,
  PatchObservationContextInput,
  SubmitLookFeedbackInput,
} from './observation.types';

/**
 * Plain body shapes. Prefer @Req().body over @Body() class DTOs —
 * global ValidationPipe({ whitelist: true }) strips undecorated class fields.
 */
interface CreateObservationBodyDto {
  intent: ObservationIntent;
  dayIndex?: number;
  capturedAt: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  heading?: number;
  mediaRefs?: string[];
  mediaIds?: string[];
  mediaRef?: string;
  images?: Array<string | { mediaRef?: string; id?: string; url?: string }>;
  question?: string;
  source?: ObservationSource;
  tripEndAt?: string;
  tripContext?: CreateObservationInput['tripContext'];
  ocrTextSeed?: string;
  groundingHints?: CreateObservationInput['groundingHints'];
  /** Phase 0: synthesize placeholder media when upload not wired */
  mockLocalMedia?: boolean;
}

interface AppendMediaBodyDto {
  mediaRefs?: string[];
  mediaIds?: string[];
  mediaRef?: string;
  images?: Array<string | { mediaRef?: string; id?: string; url?: string }>;
  capturedAt?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  heading?: number;
  reason: AppendMediaInput['reason'];
  ocrTextSeed?: string;
  groundingHints?: AppendMediaInput['groundingHints'];
}

interface PatchContextBodyDto {
  dayIndex?: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  heading?: number;
  confirmedIntent?: ObservationIntent;
  tripContext?: PatchObservationContextInput['tripContext'];
  groundingHints?: PatchObservationContextInput['groundingHints'];
  reassess?: boolean;
}

interface SubmitFeedbackBodyDto {
  assessmentId: string;
  assessmentRevision?: number;
  result: SubmitLookFeedbackInput['result'];
  userCorrection?: SubmitLookFeedbackInput['userCorrection'];
}

/**
 * NARA Look P0 — `/api/v1/trips/:tripId/observations`
 * No Apply endpoint (Q2).
 */
@ApiTags('nara-look-observations')
@Public()
@Controller('v1/trips/:tripId/observations')
export class ObservationController {
  constructor(private readonly observations: ObservationService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create field observation (NARA Look)' })
  @ApiParam({ name: 'tripId' })
  async create(
    @Param('tripId') tripId: string,
    @Req() req: Request,
  ) {
    try {
      const body = (req.body ?? {}) as CreateObservationBodyDto;
      let mediaRefs = normalizeMediaRefs(body);
      if (
        mediaRefs.length === 0 &&
        (body.mockLocalMedia === true || !!body.ocrTextSeed)
      ) {
        mediaRefs = [`local_mock_${Date.now().toString(36)}`];
      }
      const event = await this.observations.create(tripId, {
        intent: body.intent,
        dayIndex: body.dayIndex,
        capturedAt: body.capturedAt,
        location: body.location,
        heading: body.heading,
        mediaRefs,
        question: body.question,
        source: body.source,
        tripEndAt: body.tripEndAt,
        tripContext: body.tripContext,
        ocrTextSeed: body.ocrTextSeed,
        groundingHints: body.groundingHints,
      });
      return {
        observationId: event.observationId,
        status: event.status,
        captureRevision: event.captureRevision,
      };
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Get()
  @ApiOperation({
    summary:
      'List observations (home recent + history). Query: limit, cursor, filter',
  })
  @ApiParam({ name: 'tripId' })
  list(
    @Param('tripId') tripId: string,
    @Req() req: Request,
  ) {
    try {
      const q = req.query ?? {};
      const limitRaw = Number(q.limit);
      return this.observations.list(tripId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        cursor: typeof q.cursor === 'string' ? q.cursor : undefined,
        filter: typeof q.filter === 'string' ? q.filter : undefined,
      });
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Get(':observationId')
  @ApiOperation({ summary: 'Get observation status' })
  get(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
  ) {
    try {
      const event = this.observations.get(tripId, observationId);
      return {
        observationId: event.observationId,
        status: event.status,
        progress: event.progressStage
          ? { stage: event.progressStage }
          : undefined,
        verificationStatus: event.verificationStatus,
        captureRevision: event.captureRevision,
        channel: event.channel,
      };
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Get(':observationId/assessment')
  @ApiOperation({ summary: 'Get assessment (409 until COMPLETED)' })
  getAssessment(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
  ) {
    try {
      return this.observations.getAssessment(tripId, observationId);
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Post(':observationId/assessment/feedback')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit assessment feedback (RealityOS §16.7; never Apply / PlanVersion)',
  })
  submitFeedback(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
    @Body() body: SubmitFeedbackBodyDto,
  ) {
    try {
      return this.observations.submitFeedback(tripId, observationId, {
        assessmentId: body.assessmentId,
        assessmentRevision: body.assessmentRevision,
        result: body.result,
        userCorrection: body.userCorrection,
      });
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Patch(':observationId/context')
  @ApiOperation({
    summary:
      'Patch observation context / reassess (RealityOS §16.5; no PlanVersion write)',
  })
  async patchContext(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
    @Body() body: PatchContextBodyDto,
  ) {
    try {
      return await this.observations.patchContext(tripId, observationId, {
        dayIndex: body.dayIndex,
        location: body.location,
        heading: body.heading,
        confirmedIntent: body.confirmedIntent,
        tripContext: body.tripContext,
        groundingHints: body.groundingHints,
        reassess: body.reassess,
      });
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Get(':observationId/decision-problem')
  @ApiOperation({
    summary: 'Get linked Look DecisionProblem (S4; Preview only, no Apply)',
  })
  getDecisionProblem(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
  ) {
    try {
      // ensure observation belongs to trip
      this.observations.get(tripId, observationId);
      const problem = this.observations.getLinkedDecisionProblem(observationId);
      if (!problem) {
        throw new NotFoundException(
          `No DecisionProblem for observation ${observationId}`,
        );
      }
      return problem;
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Get(':observationId/evidence-package')
  @ApiOperation({
    summary:
      'Get rental EvidencePackage (P0-B; liabilityAssigned/autoSent always false; PDF P0.5)',
  })
  getEvidencePackage(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
  ) {
    try {
      return this.observations.getEvidencePackage(tripId, observationId);
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Post(':observationId/media')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Append media / recapture (same observationId)' })
  async appendMedia(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
    @Req() req: Request,
  ) {
    try {
      const body = (req.body ?? {}) as AppendMediaBodyDto;
      const event = await this.observations.appendMedia(tripId, observationId, {
        mediaRefs: normalizeMediaRefs(body),
        capturedAt: body.capturedAt,
        location: body.location,
        heading: body.heading,
        reason: body.reason,
        ocrTextSeed: body.ocrTextSeed,
        groundingHints: body.groundingHints,
      });
      return {
        observationId: event.observationId,
        status: event.status,
        captureRevision: event.captureRevision,
      };
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  @Delete(':observationId')
  @ApiOperation({ summary: 'Delete observation media (immediate revoke)' })
  delete(
    @Param('tripId') tripId: string,
    @Param('observationId') observationId: string,
  ) {
    try {
      return this.observations.delete(tripId, observationId);
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  private toHttp(e: unknown): HttpException {
    if (
      e instanceof ConflictException ||
      e instanceof UnprocessableEntityException ||
      e instanceof NotFoundException ||
      e instanceof HttpException
    ) {
      return e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return new HttpException(
      { code: 'INTERNAL_ERROR', message },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

function normalizeMediaRefs(body: {
  mediaRefs?: string[];
  mediaIds?: string[];
  mediaRef?: string;
  images?: Array<string | { mediaRef?: string; id?: string; url?: string }>;
}): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  if (Array.isArray(body.mediaRefs)) body.mediaRefs.forEach(push);
  if (Array.isArray(body.mediaIds)) body.mediaIds.forEach(push);
  push(body.mediaRef);
  if (Array.isArray(body.images)) {
    for (const img of body.images) {
      if (typeof img === 'string') push(img);
      else if (img && typeof img === 'object') {
        push(img.mediaRef ?? img.id ?? img.url);
      }
    }
  }
  return [...new Set(out)];
}

