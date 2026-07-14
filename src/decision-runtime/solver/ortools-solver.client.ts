/**
 * HTTP client for Python OR-Tools solver sidecar.
 * @see ADR-008-OR-Tools-Candidate-Provider.md
 */

import { Injectable, Logger } from '@nestjs/common';
import type { SolverProblem } from './contracts/solver-problem';
import type { SolverResponse } from './contracts/solver-response';
import {
  resolveOrToolsSolverBaseUrl,
  resolveOrToolsSolverTimeoutMs,
} from './ortools-solver.config';

@Injectable()
export class OrToolsSolverClient {
  private readonly logger = new Logger(OrToolsSolverClient.name);

  isConfigured(): boolean {
    return resolveOrToolsSolverBaseUrl() != null;
  }

  async health(): Promise<{ ok: boolean; version?: string } | null> {
    const base = resolveOrToolsSolverBaseUrl();
    if (!base) return null;
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(resolveOrToolsSolverTimeoutMs()),
      });
      if (!res.ok) return { ok: false };
      const body = (await res.json()) as { ok?: boolean; version?: string };
      return { ok: body.ok === true, version: body.version };
    } catch (err) {
      this.logger.warn(
        `OR-Tools health failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ok: false };
    }
  }

  async solve(problem: SolverProblem): Promise<SolverResponse | null> {
    const base = resolveOrToolsSolverBaseUrl();
    if (!base) {
      this.logger.debug('OR_TOOLS_SOLVER_URL unset — skip solve');
      return null;
    }

    const url = `${base}/v1/solve`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(problem),
        signal: AbortSignal.timeout(resolveOrToolsSolverTimeoutMs()),
      });
      if (!res.ok) {
        this.logger.warn(`OR-Tools solve HTTP ${res.status} requestId=${problem.requestId}`);
        return null;
      }
      const body = (await res.json()) as SolverResponse;
      if (body.schemaId !== 'tripnara.solver_response@v1') {
        this.logger.warn(`unexpected solver schemaId=${String(body.schemaId)}`);
      }
      if (body.solverMeta?.nativeCpSat === true && body.solverMeta.engine === 'OR_TOOLS_ROUTING') {
        this.logger.error(
          'nativeCpSat=true with ROUTING engine — rejecting as contract violation (ADR-008)',
        );
        return null;
      }
      return body;
    } catch (err) {
      this.logger.warn(
        `OR-Tools solve failed requestId=${problem.requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
