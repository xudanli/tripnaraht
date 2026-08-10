/**
 * Expose application instance identity for M1 LB evidence (X-App-Instance-Id).
 */
import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { hostname } from 'os';

export function resolveAppInstanceId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = String(env.APP_INSTANCE_ID ?? '').trim();
  if (explicit) return explicit;
  return `host-${hostname()}`;
}

@Injectable()
export class AppInstanceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = resolveAppInstanceId();
    res.setHeader('X-App-Instance-Id', id);
    (req as Request & { appInstanceId?: string }).appInstanceId = id;
    next();
  }
}
