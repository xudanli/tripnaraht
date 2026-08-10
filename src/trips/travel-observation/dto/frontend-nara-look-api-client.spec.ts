import {
  createNaraLookApiClient,
  NaraLookAssessmentNotReadyError,
  nextCaptureScreen,
  sceneGuidance,
} from './frontend-nara-look-api-client';
import type {
  NaraLookAssessment,
  NaraLookAssessmentNotReady,
  NaraLookCreateResponse,
  NaraLookStatusResponse,
} from './frontend-nara-look-api.types';

describe('frontend-nara-look-api-client (S1 Capture Mock)', () => {
  it('nextCaptureScreen walks scene → camera → confirm → analyzing → result', () => {
    let s = nextCaptureScreen({
      current: 'SCENE_SELECT',
      event: 'SELECT_INTENT',
    });
    expect(s).toBe('CAMERA');
    s = nextCaptureScreen({ current: s, event: 'CAPTURED' });
    expect(s).toBe('CONFIRM');
    s = nextCaptureScreen({ current: s, event: 'SUBMIT' });
    expect(s).toBe('ANALYZING');
    s = nextCaptureScreen({ current: s, event: 'ASSESSMENT_READY' });
    expect(s).toBe('RESULT');
  });

  it('driving detection forces DRIVING_BLOCK', () => {
    expect(
      nextCaptureScreen({ current: 'CAMERA', event: 'DRIVING_DETECTED' }),
    ).toBe('DRIVING_BLOCK');
  });

  it('sceneGuidance returns frozen zh copy', () => {
    expect(sceneGuidance('CHECK_ROAD', 'zh')).toContain('道路标志');
    expect(sceneGuidance('CHECK_VEHICLE', 'en')).toMatch(/badge/i);
    expect(sceneGuidance('CHECK_RENTAL_HANDOVER', 'zh')).toContain('仪表盘');
    expect(sceneGuidance('CHECK_RENTAL_HANDOVER', 'en')).toMatch(/dashboard/i);
  });

  it('getAssessment treats 409 as NaraLookAssessmentNotReadyError (no toast path)', async () => {
    const notReady: NaraLookAssessmentNotReady = {
      code: 'OBSERVATION_ASSESSMENT_NOT_READY',
      observationId: 'obs_1',
      status: 'ASSESSING',
      progress: { stage: 'CHECKING_TRIP_IMPACT' },
      retryAfterMs: 50,
    };

    const client = createNaraLookApiClient({
      baseUrl: 'http://test/api',
      fetchImpl: async () =>
        new Response(JSON.stringify(notReady), { status: 409 }),
    });

    await expect(client.getAssessment('trip_1', 'obs_1')).rejects.toBeInstanceOf(
      NaraLookAssessmentNotReadyError,
    );
  });

  it('waitForAssessment polls 409 then returns assessment', async () => {
    let assessmentCalls = 0;
    const create: NaraLookCreateResponse = {
      observationId: 'obs_1',
      status: 'ASSESSING',
      captureRevision: 1,
    };
    const statusAssessing: NaraLookStatusResponse = {
      observationId: 'obs_1',
      status: 'ASSESSING',
      progress: { stage: 'CHECKING_TRIP_IMPACT' },
      captureRevision: 1,
      channel: 'LOOK_FIELD',
    };
    const statusDone: NaraLookStatusResponse = {
      ...statusAssessing,
      status: 'COMPLETED',
      progress: { stage: 'FINALIZING' },
    };
    const assessment: NaraLookAssessment = {
      assessmentId: 'a1',
      observationId: 'obs_1',
      assessmentRevision: 1,
      summary: {
        whatHappened: 'x',
        impact: 'y',
        recommendation: 'z',
      },
      status: 'INFO',
      evidenceIds: ['e1'],
      actions: [{ type: 'ACKNOWLEDGE', label: '我知道了' }],
      verificationStatus: 'INSUFFICIENT',
      writesPlanVersion: false,
      authority: 'VISUAL_ONLY',
      contextHash: 'lch_client_test',
    };
    const notReady: NaraLookAssessmentNotReady = {
      code: 'OBSERVATION_ASSESSMENT_NOT_READY',
      observationId: 'obs_1',
      status: 'ASSESSING',
      progress: { stage: 'CHECKING_TRIP_IMPACT' },
      retryAfterMs: 1,
    };

    let statusCalls = 0;
    const client = createNaraLookApiClient({
      baseUrl: 'http://test/api',
      fetchImpl: async (url, init) => {
        const u = String(url);
        if (init?.method === 'POST' && !u.includes('/media')) {
          return new Response(JSON.stringify(create), { status: 202 });
        }
        if (u.endsWith('/assessment')) {
          assessmentCalls += 1;
          if (assessmentCalls === 1) {
            return new Response(JSON.stringify(notReady), { status: 409 });
          }
          return new Response(JSON.stringify(assessment), { status: 200 });
        }
        // GET status
        statusCalls += 1;
        const body = statusCalls === 1 ? statusAssessing : statusDone;
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });

    const progress: string[] = [];
    const result = await client.waitForAssessment('trip_1', 'obs_1', {
      sleepFn: async () => undefined,
      onProgress: (p) => progress.push(`${p.status}:${p.stage ?? ''}`),
    });

    expect(result.writesPlanVersion).toBe(false);
    expect(result.status).toBe('INFO');
    expect(progress.length).toBeGreaterThan(0);
  });

  it('resolveCta maps EXECUTION_BLOCK and NO_GPS', () => {
    const client = createNaraLookApiClient({ baseUrl: 'http://test/api' });
    expect(client.resolveCta('EXECUTION_BLOCK', 'zh').primary).toBe('查看安全方案');
    expect(client.resolveCta('INFO', 'zh', 'NO_GPS').primary).toBe(
      '开启定位后重试',
    );
  });

  it('Advisor cannot open camera; driving blocks camera', () => {
    const client = createNaraLookApiClient({ baseUrl: 'http://test/api' });
    expect(client.canOpenCamera('ADVISOR', false)).toBe(false);
    expect(client.canOpenCamera('ORGANIZER', true)).toBe(false);
    expect(client.canOpenCamera('MEMBER', false)).toBe(true);
  });

  it('client surface has no apply method', () => {
    const client = createNaraLookApiClient({ baseUrl: 'http://test/api' });
    expect('apply' in client).toBe(false);
    expect(typeof (client as { apply?: unknown }).apply).toBe('undefined');
  });
});
