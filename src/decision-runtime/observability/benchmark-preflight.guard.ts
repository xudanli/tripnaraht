/**
 * Restricts benchmark preflight / runtime-diagnostics to non-production or token-gated staging.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class BenchmarkPreflightGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const allowed =
      process.env.NODE_ENV !== 'production' || process.env.RUNTIME_DIAGNOSTICS_ENABLED === '1';

    if (!allowed) {
      throw new NotFoundException('Not found');
    }

    const requiredToken = process.env.BENCHMARK_PREFLIGHT_TOKEN?.trim();
    if (process.env.NODE_ENV === 'production' && requiredToken) {
      const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
      const provided = req.headers['x-benchmark-preflight-token']?.trim();
      if (provided !== requiredToken) {
        throw new ForbiddenException('Invalid benchmark preflight token');
      }
    }

    return true;
  }
}
