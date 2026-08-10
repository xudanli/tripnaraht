/**
 * UWC-1e Nest HTTP adapter — shared Web/iOS paths from UWC_1E_OPENAPI_FREEZE.
 * Global prefix `api` → `/api/uwc/v1/write/{preview|confirm|apply}`.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../auth/decorators/current-user.decorator';
import { UWC_1E_OPENAPI_FREEZE } from './client-write-protocol.openapi.freeze';
import { ClientWriteProtocolService } from './client-write-protocol.service';
import {
  Uwc1eApplyBodyDto,
  Uwc1eConfirmBodyDto,
  Uwc1ePreviewBodyDto,
} from './client-write-protocol.http.dto';
import type {
  Uwc1eApplyResponse,
  Uwc1eConfirmResponse,
  Uwc1ePreviewResponse,
  Uwc1eProtocolErrorCode,
  Uwc1eProtocolReject,
} from './client-write-protocol.types';
import type { ExpectedWriteVersion } from './expected-write-version';

function httpStatusForProtocolError(code: Uwc1eProtocolErrorCode): number {
  switch (code) {
    case 'MUST_REPREVIEW_AFTER_CONFLICT':
      return HttpStatus.CONFLICT;
    case 'BYPASS_FORBIDDEN':
      return HttpStatus.FORBIDDEN;
    case 'DRAFT_NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'DRAFT_EXPIRED':
      return HttpStatus.GONE;
    case 'EXCLUDED_CAPABILITY':
    case 'SLICE_NOT_IN_FIRST_BATCH':
      return HttpStatus.FORBIDDEN;
    default:
      return HttpStatus.BAD_REQUEST;
  }
}

function httpStatusForApplyOutcome(
  outcome: Uwc1eApplyResponse['outcome'],
): number {
  switch (outcome) {
    case 'CONFLICT':
      return HttpStatus.CONFLICT;
    case 'VERIFICATION_REQUIRED':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'REJECTED':
      return HttpStatus.FORBIDDEN;
    case 'APPLIED':
    case 'IDEMPOTENT_REPLAY':
    default:
      return HttpStatus.OK;
  }
}

@ApiTags('UWC-1e')
@Public()
@Controller('uwc/v1')
export class ClientWriteProtocolController {
  constructor(private readonly protocol: ClientWriteProtocolService) {}

  @Get('openapi-freeze')
  @ApiOperation({
    summary: 'Return frozen shared OpenAPI document (Web = iOS)',
  })
  openApiFreeze() {
    return UWC_1E_OPENAPI_FREEZE;
  }

  @Post('write/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview — draft only (no Apply pipeline)',
    operationId: 'uwc1ePreview',
  })
  async preview(
    @Body() body: Uwc1ePreviewBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ): Promise<Uwc1ePreviewResponse> {
    const result = await this.protocol.preview({
      schemaId: body.schemaId,
      protocolVersion: body.protocolVersion,
      stage: 'PREVIEW',
      productSurface: body.productSurface,
      slice: body.slice,
      tripId: body.tripId,
      actorId: body.actorId ?? user?.userId,
      intendedMutation: body.intendedMutation,
      expectedWriteVersion: body.expectedWriteVersion as ExpectedWriteVersion,
      observedHints: body.observedHints,
      requestId: body.requestId,
    });
    return this.unwrapOrThrow(result);
  }

  @Post('write/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm — explicit confirmation only (no Apply pipeline)',
    operationId: 'uwc1eConfirm',
  })
  async confirm(
    @Body() body: Uwc1eConfirmBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ): Promise<Uwc1eConfirmResponse> {
    const result = await this.protocol.confirm({
      schemaId: body.schemaId,
      protocolVersion: body.protocolVersion,
      stage: 'CONFIRM',
      draftId: body.draftId,
      explicitConfirm: true,
      productSurface: body.productSurface,
      actorId: body.actorId ?? user?.userId,
      requestId: body.requestId,
    });
    return this.unwrapOrThrow(result);
  }

  @Post('write/apply')
  @ApiOperation({
    summary:
      'Apply — Authority → Verification → Idempotency → OCC → Handler → Transaction → Audit',
    operationId: 'uwc1eApply',
  })
  async apply(
    @Body() body: Uwc1eApplyBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ): Promise<Uwc1eApplyResponse> {
    const result = await this.protocol.apply({
      schemaId: body.schemaId,
      protocolVersion: body.protocolVersion,
      stage: 'APPLY',
      draftId: body.draftId,
      confirmationId: body.confirmationId,
      idempotencyKey: body.idempotencyKey,
      productSurface: body.productSurface,
      actorId: body.actorId ?? user?.userId,
      requestId: body.requestId,
    });
    if ('errorCode' in result) {
      throw new HttpException(
        result,
        httpStatusForProtocolError(result.errorCode),
      );
    }
    const status = httpStatusForApplyOutcome(result.outcome);
    if (status !== HttpStatus.OK) {
      throw new HttpException(result, status);
    }
    return result;
  }

  private unwrapOrThrow<T extends object>(
    result: T | Uwc1eProtocolReject,
  ): T {
    if (result && typeof result === 'object' && 'errorCode' in result) {
      const reject = result as Uwc1eProtocolReject;
      throw new HttpException(
        reject,
        httpStatusForProtocolError(reject.errorCode),
      );
    }
    return result as T;
  }
}

/** Exported for contract tests — path alignment with freeze. */
export const UWC_1E_HTTP_ROUTE_PREFIX = 'uwc/v1' as const;
export const UWC_1E_HTTP_PATHS = {
  preview: 'write/preview',
  confirm: 'write/confirm',
  apply: 'write/apply',
  openapiFreeze: 'openapi-freeze',
} as const;
