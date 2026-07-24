import { HttpException, HttpStatus } from '@nestjs/common';
import type { RevisionConflictDetails } from './travel-context-intent.types';

export class TravelContextRevisionConflictException extends HttpException {
  constructor(details: RevisionConflictDetails) {
    super(
      {
        code: 'REVISION_CONFLICT',
        message: `Context has moved to revision ${details.currentRevision}`,
        details,
      },
      HttpStatus.CONFLICT,
    );
  }
}
