import {
  GUIDE_PARSE_JOB_STATUS,
  GUIDE_TO_PLAN_SESSION_STATUS,
} from '../constants/guide-to-plan-status.constants';
import {
  assertCanGenerateSession,
  assertCanImportSession,
  assertCanParseSession,
  assertDraftReadySession,
  assertMutableSession,
  inferResumeRoute,
  mergeTravelContext,
} from './guide-session.util';

describe('guide-session.util', () => {
  it('mergeTravelContext preserves existing fields on partial patch', () => {
    const merged = mergeTravelContext(
      {
        startDate: '2026-08-01',
        endDate: '2026-08-07',
        travelers: { adults: 2 },
        transportMode: 'self_drive',
      },
      { preserveExperiences: ['冰河湖'] },
    );
    expect(merged.startDate).toBe('2026-08-01');
    expect(merged.preserveExperiences).toEqual(['冰河湖']);
  });

  it('assertMutableSession blocks abandoned and accepted', () => {
    expect(() => assertMutableSession(GUIDE_TO_PLAN_SESSION_STATUS.ABANDONED)).toThrow(
      /已放弃/,
    );
    expect(() => assertMutableSession(GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED)).toThrow(
      /已接受/,
    );
  });

  it('inferResumeRoute suggests parse_progress when parsing', () => {
    expect(
      inferResumeRoute({
        status: GUIDE_TO_PLAN_SESSION_STATUS.PARSING,
        requiresTravelContext: true,
        hasGuides: true,
        draftCandidateCount: 0,
      }),
    ).toBe('parse_progress');
  });

  it('inferResumeRoute suggests trip when tripId present', () => {
    expect(
      inferResumeRoute({
        status: GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED,
        requiresTravelContext: false,
        hasGuides: true,
        draftCandidateCount: 0,
        tripId: 'trip-1',
      }),
    ).toBe('trip');
  });

  it('assertCanImportSession blocks parsing and generating', () => {
    expect(() => assertCanImportSession(GUIDE_TO_PLAN_SESSION_STATUS.PARSING)).toThrow(
      /解析进行中/,
    );
    expect(() => assertCanImportSession(GUIDE_TO_PLAN_SESSION_STATUS.GENERATING)).toThrow(
      /草案生成中/,
    );
    expect(() =>
      assertCanImportSession(GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING),
    ).not.toThrow();
  });

  it('assertCanParseSession blocks generating', () => {
    expect(() => assertCanParseSession(GUIDE_TO_PLAN_SESSION_STATUS.GENERATING)).toThrow(
      /草案生成中/,
    );
    expect(() =>
      assertCanParseSession(GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY),
    ).not.toThrow();
  });

  it('assertDraftReadySession requires draft_ready', () => {
    expect(() =>
      assertDraftReadySession(GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT),
    ).toThrow(/请先生成草案/);
    expect(() =>
      assertDraftReadySession(GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY),
    ).not.toThrow();
  });

  it('assertCanGenerateSession blocks parsing and collecting', () => {
    expect(() => assertCanGenerateSession(GUIDE_TO_PLAN_SESSION_STATUS.PARSING)).toThrow(
      /解析进行中/,
    );
    expect(() => assertCanGenerateSession(GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING)).toThrow(
      /请先完成攻略解析/,
    );
    expect(() =>
      assertCanGenerateSession(GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT),
    ).not.toThrow();
    expect(() =>
      assertCanGenerateSession(GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY),
    ).not.toThrow();
  });

  it('inferResumeRoute suggests import after parse failed', () => {
    expect(
      inferResumeRoute({
        status: GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING,
        parseJobStatus: GUIDE_PARSE_JOB_STATUS.FAILED,
        requiresTravelContext: false,
        hasGuides: true,
        draftCandidateCount: 0,
      }),
    ).toBe('import');
  });
});
