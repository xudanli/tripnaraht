/**
 * RFC-002 — marks internal RFC-001 endpoints deprecated; points to Unified API.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export const RFC001_INTERNAL_SUCCESSOR = '/api/trips/:tripId/decision-center';

@Injectable()
export class Rfc001InternalDeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const response = http.getResponse<{ setHeader: (k: string, v: string) => void }>();
    const request = http.getRequest<{ params?: { tripId?: string } }>();
    const tripId = request.params?.tripId;

    response.setHeader('Deprecation', 'true');
    response.setHeader('X-API-Deprecated-Since', 'RFC-002-Phase-1');
    if (tripId) {
      response.setHeader(
        'Link',
        `</api/trips/${tripId}/decision-center>; rel="successor-version"`,
      );
    }

    return next.handle().pipe(
      map((body) => {
        if (body == null || typeof body !== 'object') return body;
        return {
          ...body,
          _deprecated: {
            message: 'Use Unified Decision API (RFC-002)',
            successor: tripId
              ? `/api/trips/${tripId}/decision-center`
              : RFC001_INTERNAL_SUCCESSOR,
            migrationDoc: 'docs/rfc/RFC-002_GLOBAL_DECISION_RUNTIME.md',
          },
        };
      }),
    );
  }
}
