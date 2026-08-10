/**
 * Typed client for Iceland Initial Plan Preview + Confirm + Apply HTTP.
 * Apply writes Iceland PlanVersion (not OR-Tools; not arrange shadow).
 */

import type {
  ApplyProposalRequest,
  ApplyProposalResponse,
  ConfirmProposalRequest,
  ConfirmProposalResponse,
  CreateProposalResponse,
  CreateTripShellRequest,
  CreateTripShellResponse,
  InitialPlanPreviewResponse,
} from '../types/iceland-trip-shell-preview.types';

export type IcelandPreviewClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | Promise<string | undefined>;
  ownerId?: string;
  fetchImpl?: typeof fetch;
};

export class IcelandInitialPlanPreviewClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: IcelandPreviewClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async createTripShell(
    body: CreateTripShellRequest,
  ): Promise<CreateTripShellResponse> {
    return this.request('POST', '/api/iceland-self-drive/trips', { body });
  }

  async createProposal(
    tripId: string,
    idempotencyKey: string,
  ): Promise<CreateProposalResponse> {
    return this.request(
      'POST',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals`,
      { idempotencyKey },
    );
  }

  async getProposal(
    tripId: string,
    proposalId: string,
  ): Promise<InitialPlanPreviewResponse> {
    return this.request(
      'GET',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals/${encodeURIComponent(proposalId)}`,
    );
  }

  /** Full contrast report — calibration only; never gate Confirm/Apply. */
  async getShadowVsPlatformContrast(
    tripId: string,
    proposalId: string,
  ): Promise<unknown> {
    return this.request(
      'GET',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals/${encodeURIComponent(proposalId)}/shadow-vs-platform`,
    );
  }

  async getCurrentProposal(tripId: string): Promise<InitialPlanPreviewResponse> {
    return this.request(
      'GET',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals/current`,
    );
  }

  async confirmProposal(
    tripId: string,
    proposalId: string,
    body: ConfirmProposalRequest,
  ): Promise<ConfirmProposalResponse> {
    return this.request(
      'POST',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals/${encodeURIComponent(proposalId)}/confirm`,
      { body },
    );
  }

  /** Apply Contract — only after Confirm; writes Iceland PlanVersion */
  async applyProposal(
    tripId: string,
    proposalId: string,
    body: ApplyProposalRequest = {},
  ): Promise<ApplyProposalResponse> {
    return this.request(
      'POST',
      `/api/iceland-self-drive/trips/${encodeURIComponent(tripId)}/initial-plan/proposals/${encodeURIComponent(proposalId)}/apply`,
      { body },
    );
  }

  async createShellAndLoadPreview(input: {
    shell: CreateTripShellRequest;
    idempotencyKey?: string;
  }): Promise<{
    shell: CreateTripShellResponse;
    created: CreateProposalResponse;
    preview: InitialPlanPreviewResponse;
  }> {
    const shell = await this.createTripShell(input.shell);
    const key =
      input.idempotencyKey ??
      `initial-plan-${shell.tripId}-${shell.contextHash}`;
    const created = await this.createProposal(shell.tripId, key);
    const preview = await this.getProposal(shell.tripId, created.proposalId);
    return { shell, created, preview };
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const token = this.opts.getAccessToken
      ? await this.opts.getAccessToken()
      : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (this.opts.ownerId) headers['x-owner-id'] = this.opts.ownerId;
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text();
      }
      throw new IcelandPreviewHttpError(res.status, detail);
    }
    return (await res.json()) as T;
  }
}

export class IcelandPreviewHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(`Iceland Preview HTTP ${status}`);
    this.name = 'IcelandPreviewHttpError';
  }
}

export function previewUiFlags(preview: InitialPlanPreviewResponse): {
  showTimeline: boolean;
  showConfirmCta: boolean;
  showApplyCta: boolean;
  showBlockedPanel: boolean;
  showConfirmationsPanel: boolean;
  showConfirmedBadge: boolean;
  showAppliedBadge: boolean;
  /** Dev/ops only — never drives CTA visibility */
  showCalibrationDriftBadge: boolean;
  bannerTitle: string;
  bannerBody: string;
} {
  const cal = preview.calibration?.shadowVsPlatform;
  const gateway = cal?.platform.gateway;
  const gatewayDrift =
    gateway != null &&
    gateway.gateCompareSkipped !== true &&
    gateway.gateAlignedWithShadow === false;
  return {
    showTimeline: preview.capabilities.canPreview && preview.days.length > 0,
    showConfirmCta: preview.capabilities.canConfirm === true,
    showApplyCta: preview.capabilities.canApply === true,
    showBlockedPanel:
      preview.status === 'BLOCKED' || preview.blockingIssues.length > 0,
    showConfirmationsPanel: preview.confirmations.length > 0,
    showConfirmedBadge: preview.status === 'CONFIRMED',
    showAppliedBadge: preview.status === 'APPLIED',
    /** Peer Confirm drift, or Gateway INFEASIBLE drift — not UNVERIFIED completeness. */
    showCalibrationDriftBadge:
      cal != null && (cal.gateAligned === false || gatewayDrift),
    bannerTitle: preview.productCopy.title,
    bannerBody: preview.productCopy.body,
  };
}

export function buildConfirmAckPayload(
  preview: InitialPlanPreviewResponse,
  note?: string,
): ConfirmProposalRequest {
  return {
    acknowledgedConfirmationIds: preview.confirmations
      .filter((c) => c.blockingApply)
      .map((c) => c.confirmationId),
    note,
  };
}

export function formatDayClock(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
