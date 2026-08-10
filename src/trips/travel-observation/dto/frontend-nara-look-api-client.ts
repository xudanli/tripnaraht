/**
 * NARA Look · iOS / Web reference API client (S1 Capture + S5 Result)
 * Copy to client: `NaraLookApiClient.swift` / `nara-look-client.ts`
 *
 * Hard rules:
 * - No Apply method
 * - Assessment GET: treat 409 as progress, not error toast
 * - writesPlanVersion must remain false
 * - Preview entry only via existing Decision / Repair / Arrange / Nav
 */

import type {
  NaraLookAppendMediaRequest,
  NaraLookAssessment,
  NaraLookAssessmentNotReady,
  NaraLookAssessmentStatus,
  NaraLookCaptureScreen,
  NaraLookCreateRequest,
  NaraLookCreateResponse,
  NaraLookDeletionReceipt,
  NaraLookFeedbackReceipt,
  NaraLookFeedbackRequest,
  NaraLookIntent,
  NaraLookPatchContextRequest,
  NaraLookPatchContextResult,
  NaraLookStatusResponse,
  NaraLookTripRole,
} from './frontend-nara-look-api.types';
import {
  ASSESSMENT_CTA,
  canCapture,
  canConfirmApply as evaluateConfirmApply,
  DRIVING_SAFETY_COPY,
  type DriverApplyGateInput,
} from '../cta-and-roles';
import {
  assertResultCtaSafe,
  buildResultViewModel,
  previewDeepLink,
  type NaraLookDecisionProblem,
  type NaraLookResultViewModel,
} from './frontend-nara-look-result';

export type NaraLookFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type NaraLookApiConfig = {
  /** e.g. https://host/api */
  baseUrl: string;
  getAuthToken?: () => string | undefined;
  fetchImpl?: NaraLookFetch;
};

export class NaraLookApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'NaraLookApiError';
  }
}

export class NaraLookAssessmentNotReadyError extends NaraLookApiError {
  constructor(readonly payload: NaraLookAssessmentNotReady) {
    super('OBSERVATION_ASSESSMENT_NOT_READY', 409, payload);
    this.name = 'NaraLookAssessmentNotReadyError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createNaraLookApiClient(config: NaraLookApiConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: T }> {
    const isForm =
      typeof FormData !== 'undefined' && init?.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (isForm) {
      delete headers['Content-Type'];
    }
    const token = config.getAuthToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as T) : ({} as T);
    return { status: res.status, body };
  }

  const observationsPath = (tripId: string) =>
    `/v1/trips/${encodeURIComponent(tripId)}/observations`;

  return {
    surface: 'ios' as const,

    /** Progressive permission: camera only when entering CAMERA */
    canOpenCamera(role: NaraLookTripRole, isDriving: boolean): boolean {
      if (isDriving) return false;
      return canCapture(role);
    },

    drivingBlockCopy() {
      return DRIVING_SAFETY_COPY;
    },

    canConfirmApply(input: DriverApplyGateInput): boolean {
      return evaluateConfirmApply(input);
    },

    create(
      tripId: string,
      body: NaraLookCreateRequest,
    ): Promise<NaraLookCreateResponse> {
      return request<NaraLookCreateResponse>(observationsPath(tripId), {
        method: 'POST',
        body: JSON.stringify(body),
      }).then(({ status, body: b }) => {
        if (status >= 400) {
          throw new NaraLookApiError('create failed', status, b);
        }
        return b;
      });
    },

    /**
     * Upload field photo → mediaRef for create / append.
     * multipart field name must be `file`.
     */
    uploadMedia(
      tripId: string,
      file: Blob | ArrayBuffer | Uint8Array,
      fileName = 'capture.jpg',
      mimeType = 'image/jpeg',
    ): Promise<{
      mediaId: string;
      mediaRef: string;
      mimeType: string;
      bytes: number;
      url?: string | null;
    }> {
      const form = new FormData();
      const blob =
        file instanceof Blob
          ? file
          : new Blob([file as BlobPart], { type: mimeType });
      form.append('file', blob, fileName);
      return request<{
        mediaId: string;
        mediaRef: string;
        mimeType: string;
        bytes: number;
        url?: string | null;
      }>(`/v1/trips/${encodeURIComponent(tripId)}/media`, {
        method: 'POST',
        body: form,
      }).then(({ status, body: b }) => {
        if (status >= 400) {
          throw new NaraLookApiError('uploadMedia failed', status, b);
        }
        return b;
      });
    },

    listObservations(
      tripId: string,
      query?: { limit?: number; cursor?: string; filter?: string },
    ): Promise<{
      items: Array<{
        observationId: string;
        intent: NaraLookIntent;
        filter: string;
        titleZh: string;
        summaryZh: string;
        capturedAt: string;
        placeLabelZh?: string;
        status: string;
        detailKind: string;
        thumbnailUrl?: string | null;
        writesPlanVersion: false;
      }>;
      nextCursor: string | null;
      limit: number;
    }> {
      const qs = new URLSearchParams();
      if (query?.limit != null) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      if (query?.filter) qs.set('filter', query.filter);
      const suffix = qs.toString() ? `?${qs}` : '';
      return request(`${observationsPath(tripId)}${suffix}`).then(
        ({ status, body }) => {
          if (status >= 400) {
            throw new NaraLookApiError('listObservations failed', status, body);
          }
          return body as never;
        },
      );
    },

    getStatus(
      tripId: string,
      observationId: string,
    ): Promise<NaraLookStatusResponse> {
      return request<NaraLookStatusResponse>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}`,
      ).then(({ status, body }) => {
        if (status >= 400) {
          throw new NaraLookApiError('getStatus failed', status, body);
        }
        return body;
      });
    },

    /**
     * Q6 — 409 is progress. Do not show error toast.
     */
    async getAssessment(
      tripId: string,
      observationId: string,
    ): Promise<NaraLookAssessment> {
      const { status, body } = await request<
        NaraLookAssessment | NaraLookAssessmentNotReady
      >(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}/assessment`,
      );
      if (status === 409) {
        throw new NaraLookAssessmentNotReadyError(
          body as NaraLookAssessmentNotReady,
        );
      }
      if (status === 422) {
        throw new NaraLookApiError('assessment terminal failure', status, body);
      }
      if (status >= 400) {
        throw new NaraLookApiError('getAssessment failed', status, body);
      }
      const assessment = body as NaraLookAssessment;
      if (assessment.writesPlanVersion !== false) {
        throw new NaraLookApiError(
          'invariant: writesPlanVersion must be false',
          status,
          body,
        );
      }
      return assessment;
    },

    /**
     * Poll status + assessment until COMPLETED or terminal.
     * Honors retryAfterMs from 409.
     */
    async waitForAssessment(
      tripId: string,
      observationId: string,
      opts?: {
        maxWaitMs?: number;
        onProgress?: (p: {
          status: string;
          stage?: string;
          retryAfterMs?: number;
        }) => void;
        sleepFn?: (ms: number) => Promise<void>;
      },
    ): Promise<NaraLookAssessment> {
      const maxWaitMs = opts?.maxWaitMs ?? 60_000;
      const sleepFn = opts?.sleepFn ?? sleep;
      const started = Date.now();

      while (Date.now() - started < maxWaitMs) {
        const st = await this.getStatus(tripId, observationId);
        opts?.onProgress?.({
          status: st.status,
          stage: st.progress?.stage,
        });

        if (st.status === 'COMPLETED') {
          return this.getAssessment(tripId, observationId);
        }

        const terminal = [
          'UPLOAD_FAILED',
          'IMAGE_INVALID',
          'CONTEXT_MISSING',
          'MODEL_FAILED',
          'ASSESSMENT_FAILED',
          'CANCELLED',
        ];
        if (terminal.includes(st.status)) {
          // Will 422
          return this.getAssessment(tripId, observationId);
        }

        try {
          return await this.getAssessment(tripId, observationId);
        } catch (e) {
          if (e instanceof NaraLookAssessmentNotReadyError) {
            opts?.onProgress?.({
              status: e.payload.status,
              stage: e.payload.progress.stage,
              retryAfterMs: e.payload.retryAfterMs,
            });
            await sleepFn(e.payload.retryAfterMs);
            continue;
          }
          throw e;
        }
      }
      throw new NaraLookApiError('waitForAssessment timeout', 408);
    },

    appendMedia(
      tripId: string,
      observationId: string,
      body: NaraLookAppendMediaRequest,
    ): Promise<NaraLookCreateResponse> {
      return request<NaraLookCreateResponse>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}/media`,
        { method: 'POST', body: JSON.stringify(body) },
      ).then(({ status, body: b }) => {
        if (status >= 400) {
          throw new NaraLookApiError('appendMedia failed', status, b);
        }
        return b;
      });
    },

    /** RealityOS §16.5 — patch context / optional reassess (e.g. enable GPS retry) */
    patchContext(
      tripId: string,
      observationId: string,
      body: NaraLookPatchContextRequest,
    ): Promise<NaraLookPatchContextResult> {
      return request<NaraLookPatchContextResult>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}/context`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ).then(({ status, body: b }) => {
        if (status >= 400) {
          throw new NaraLookApiError('patchContext failed', status, b);
        }
        if (b.writesPlanVersion !== false) {
          throw new NaraLookApiError(
            'invariant: patchContext.writesPlanVersion must be false',
            status,
            b,
          );
        }
        return b;
      });
    },

    /** RealityOS §16.7 — assessment feedback; never Apply */
    submitFeedback(
      tripId: string,
      observationId: string,
      body: NaraLookFeedbackRequest,
    ): Promise<NaraLookFeedbackReceipt> {
      return request<NaraLookFeedbackReceipt>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}/assessment/feedback`,
        { method: 'POST', body: JSON.stringify(body) },
      ).then(({ status, body: b }) => {
        if (status >= 400) {
          throw new NaraLookApiError('submitFeedback failed', status, b);
        }
        if (b.writesPlanVersion !== false) {
          throw new NaraLookApiError(
            'invariant: feedback.writesPlanVersion must be false',
            status,
            b,
          );
        }
        return b;
      });
    },

    deleteObservation(
      tripId: string,
      observationId: string,
    ): Promise<NaraLookDeletionReceipt> {
      return request<NaraLookDeletionReceipt>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}`,
        { method: 'DELETE' },
      ).then(({ status, body }) => {
        if (status >= 400) {
          throw new NaraLookApiError('delete failed', status, body);
        }
        return body;
      });
    },

    /**
     * S4/S5 — linked Look DecisionProblem (Preview only).
     * 404 when observation has no trip-impacting problem.
     */
    getDecisionProblem(
      tripId: string,
      observationId: string,
    ): Promise<NaraLookDecisionProblem> {
      return request<NaraLookDecisionProblem>(
        `${observationsPath(tripId)}/${encodeURIComponent(observationId)}/decision-problem`,
      ).then(({ status, body }) => {
        if (status >= 400) {
          throw new NaraLookApiError('getDecisionProblem failed', status, body);
        }
        if (body.writesPlanVersion !== false) {
          throw new NaraLookApiError(
            'invariant: DecisionProblem.writesPlanVersion must be false',
            status,
            body,
          );
        }
        return body;
      });
    },

    /**
     * S5 — RESULT card + evidence sheet + Preview entry (no Apply).
     * Optionally fetches linked DecisionProblem when assessment has one.
     */
    async buildResult(
      tripId: string,
      assessment: NaraLookAssessment,
      opts?: {
        locale?: 'zh' | 'en';
        role?: NaraLookTripRole;
        applyGate?: Omit<DriverApplyGateInput, 'role'>;
        fetchProblem?: boolean;
      },
    ): Promise<NaraLookResultViewModel> {
      let problem: NaraLookDecisionProblem | undefined;
      const shouldFetch =
        opts?.fetchProblem !== false &&
        !!assessment.decisionProblem?.linkedDecisionProblemId;
      if (shouldFetch) {
        try {
          problem = await this.getDecisionProblem(
            tripId,
            assessment.observationId,
          );
        } catch {
          problem = undefined;
        }
      }
      const vm = buildResultViewModel({
        assessment,
        problem,
        locale: opts?.locale,
        role: opts?.role,
        applyGate: opts?.applyGate,
      });
      assertResultCtaSafe(vm);
      return vm;
    },

    /** Deep link into existing Preview surfaces — never Look Apply */
    previewLink(tripId: string, vm: NaraLookResultViewModel): string | undefined {
      if (!vm.previewEntry) return undefined;
      return previewDeepLink(vm.previewEntry, tripId);
    },

    /**
     * Intentionally absent: Apply belongs to Decision / UWC Confirm — never Look.
     * TypeScript will error if callers invent `apply`.
     */
    // apply() { forbidden }

    resolveCta(
      status: NaraLookAssessmentStatus,
      locale: 'zh' | 'en' = 'zh',
      variant?: 'NO_GPS' | 'CONFLICTING' | 'RETRY',
    ): { primary: string; secondary: string } {
      const key = variant ?? status;
      const pair = ASSESSMENT_CTA[key];
      return pair[locale];
    },

    analyzingProgressCopy(
      stage: string | undefined,
      locale: 'zh' | 'en' = 'zh',
    ): string {
      const mapZh: Record<string, string> = {
        UPLOADING_MEDIA: '正在上传',
        EXTRACTING_SCENE: '正在识别现场',
        MATCHING_LOCATION: '正在匹配当前位置',
        CHECKING_VEHICLE_ROAD_FIT: '正在核对车辆与道路要求',
        CHECKING_TRIP_IMPACT: '正在检查行程影响',
        FINALIZING: '正在生成结论',
      };
      const mapEn: Record<string, string> = {
        UPLOADING_MEDIA: 'Uploading',
        EXTRACTING_SCENE: 'Recognizing the scene',
        MATCHING_LOCATION: 'Matching your location',
        CHECKING_VEHICLE_ROAD_FIT: 'Checking vehicle and road fit',
        CHECKING_TRIP_IMPACT: 'Checking trip impact',
        FINALIZING: 'Finalizing',
      };
      const table = locale === 'zh' ? mapZh : mapEn;
      return (
        (stage && table[stage]) ||
        (locale === 'zh' ? '正在识别现场' : 'Recognizing the scene')
      );
    },
  };
}

export type NaraLookApiClient = ReturnType<typeof createNaraLookApiClient>;

/** Capture Mock navigation helper for SwiftUI previews / unit tests */
export function nextCaptureScreen(input: {
  current: NaraLookCaptureScreen;
  event:
    | 'SELECT_INTENT'
    | 'OPEN_CAMERA'
    | 'CAPTURED'
    | 'SUBMIT'
    | 'ASSESSMENT_READY'
    | 'RECAPTURE'
    | 'OPEN_EVIDENCE'
    | 'OPEN_PREVIEW'
    | 'DRIVING_DETECTED'
    | 'PERMISSION_DENIED_CAMERA'
    | 'PERMISSION_DENIED_LOCATION'
    | 'BACK';
  intent?: NaraLookIntent;
}): NaraLookCaptureScreen {
  const { current, event } = input;
  if (event === 'DRIVING_DETECTED') return 'DRIVING_BLOCK';
  if (event === 'PERMISSION_DENIED_CAMERA') return 'PERMISSION_CAMERA';
  if (event === 'PERMISSION_DENIED_LOCATION') return 'PERMISSION_LOCATION';

  switch (current) {
    case 'SCENE_SELECT':
      if (event === 'SELECT_INTENT' || event === 'OPEN_CAMERA') return 'CAMERA';
      return current;
    case 'CAMERA':
      if (event === 'CAPTURED') return 'CONFIRM';
      if (event === 'BACK') return 'SCENE_SELECT';
      return current;
    case 'CONFIRM':
      if (event === 'SUBMIT') return 'ANALYZING';
      if (event === 'BACK') return 'CAMERA';
      return current;
    case 'ANALYZING':
      if (event === 'ASSESSMENT_READY') return 'RESULT';
      return current;
    case 'RESULT':
      if (event === 'RECAPTURE') return 'RECAPTURE_SHEET';
      if (event === 'OPEN_EVIDENCE') return 'EVIDENCE_SHEET';
      if (event === 'OPEN_PREVIEW') return 'RESULT'; // Preview leaves Look stack
      return current;
    case 'RECAPTURE_SHEET':
      if (event === 'OPEN_CAMERA') return 'CAMERA';
      if (event === 'BACK') return 'RESULT';
      return current;
    case 'EVIDENCE_SHEET':
      if (event === 'BACK') return 'RESULT';
      return current;
    case 'DRIVING_BLOCK':
      if (event === 'BACK') return 'SCENE_SELECT';
      return current;
    default:
      return current;
  }
}

/** Scene guidance copy (Q8 capture) */
export function sceneGuidance(
  intent: NaraLookIntent,
  locale: 'zh' | 'en' = 'zh',
): string {
  if (locale === 'en') {
    switch (intent) {
      case 'CHECK_ROAD':
        return 'Capture the road sign and the road ahead.';
      case 'CHECK_VEHICLE':
        return 'Capture the whole vehicle and the model badge.';
      case 'CHECK_ACTIVITY_ENTRY':
        return 'Capture the entrance sign or a clear landmark.';
      case 'CHECK_PARKING':
        return 'Capture the full parking sign including any supplementary plates.';
      case 'CHECK_RENTAL_HANDOVER':
        return 'Capture all required angles: four corners, both sides, front, rear, and dashboard.';
    }
  }
  switch (intent) {
    case 'CHECK_ROAD':
      return '请同时拍到道路标志和前方道路。';
    case 'CHECK_VEHICLE':
      return '请拍摄车辆整体和车型标识。';
    case 'CHECK_ACTIVITY_ENTRY':
      return '请拍摄入口招牌或周围明显标识。';
    case 'CHECK_PARKING':
      return '请拍摄完整停车牌及下方附加说明。';
    case 'CHECK_RENTAL_HANDOVER':
      return '请按引导拍摄四角、左右侧面、前后与仪表盘。';
  }
}
