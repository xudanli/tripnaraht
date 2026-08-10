import {
  assembleSelfDriveReadinessReport,
  countByStatus,
  formatStatusSummaryZh,
  projectSelfDriveCategoryDetail,
  resolveAggregateStatus,
  withRemaining,
} from './assemble-self-drive-readiness.util';
import type { SelfDriveReadinessFactInput } from '../types/self-drive-readiness.types';

function baseInput(
  overrides: Partial<SelfDriveReadinessFactInput> = {},
): SelfDriveReadinessFactInput {
  return {
    tripId: 'trip-1',
    contextVersion: 1,
    generatedAt: '2026-07-19T12:00:00Z',
    isSelfDrive: true,
    countryCode: 'IS',
    productLine: 'iceland_self_drive',
    tripSummary: {
      title: '冰岛南岸 9 天自驾',
      coverImageUrl: null,
      dateRangeLabelZh: '2月10日 - 2月18日',
      startDate: '2027-02-10',
      endDate: '2027-02-18',
      travelerCount: 4,
      travelerLabelZh: '4 人同行',
      routeLabelZh: '雷克雅未克往返',
      distanceSummaryZh: null,
    },
    overallScore: 78,
    overallState: 'NEAR_READY',
    overallDisplayLabelZh: '尚未就绪',
    driving: {
      licenseConfirmed: true,
      idpOrTranslationConfirmed: true,
      primaryDriverAge: 18,
      rentalMinAge: 20,
      additionalDriversRegistered: true,
      driverCount: 1,
      hasChildren: false,
      childSeatPrepared: null,
    },
    rental: {
      hasRentalOrder: true,
      vehicleModelConfirmed: true,
      pickupDropoffConfirmed: true,
      winterTiresRequired: true,
      winterTiresConfirmed: true,
      insuranceConfirmed: true,
      emergencyPhone: null,
    },
    anchors: {
      expectedNightCount: 8,
      bookedNightCount: 6,
      needBookingNightCount: 2,
      activityTotal: 2,
      activityBooked: 2,
      meetingTimeConfirmed: true,
      checkinTimeConfirmed: true,
      nightSelfCheckinConfirmed: true,
    },
    complianceReads: {
      speed_limit: '2026-07-01T00:00:00Z',
      lights_always_on: '2026-07-01T00:00:00Z',
      no_handheld_phone: '2026-07-01T00:00:00Z',
      no_offroad: '2026-07-01T00:00:00Z',
      single_lane_bridge: '2026-07-01T00:00:00Z',
      dui_rule: '2026-07-01T00:00:00Z',
      roadside_parking: '2026-07-01T00:00:00Z',
      accident_handling: '2026-07-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('assembleSelfDriveReadinessReport', () => {
  it('returns fixed 4 categories in order', () => {
    const report = assembleSelfDriveReadinessReport(baseInput());
    expect(report.categories).toHaveLength(4);
    expect(report.categories.map((c) => c.code)).toEqual([
      'DRIVING_ELIGIBILITY',
      'VEHICLE_RENTAL',
      'ITINERARY_ANCHORS',
      'COMPLIANCE_KNOWLEDGE',
    ]);
  });

  it('marks underage driver as MUST_RESOLVE and criticalAlerts', () => {
    const report = assembleSelfDriveReadinessReport(baseInput());
    const age = report.categoryItems!.DRIVING_ELIGIBILITY.find(
      (i) => i.type === 'PRIMARY_DRIVER_AGE',
    );
    expect(age?.status).toBe('MUST_RESOLVE');
    expect(report.counts.mustResolve).toBeGreaterThanOrEqual(1);
    expect(report.criticalAlerts.length).toBeGreaterThanOrEqual(1);
    expect(report.criticalAlerts[0].itemId).toBe('primary_driver_age');
    expect(report.mustResolveSummaryZh).toBe(
      `${report.counts.mustResolve} 项必须解决`,
    );
    expect(report.score).toBeLessThanOrEqual(79);
    expect(report.state).toBe('BLOCKED');
  });

  it('keeps mustResolve / remaining / summary consistent', () => {
    const report = assembleSelfDriveReadinessReport(baseInput());
    expect(report.counts.remaining).toBe(
      report.counts.toPrepare +
        report.counts.toConfirm +
        report.counts.mustResolve +
        report.counts.blocked,
    );
    expect(report.headlineZh).toContain(`${report.counts.remaining}`);
  });

  it('projects category detail with matching statusSummaryZh', () => {
    const report = assembleSelfDriveReadinessReport(baseInput());
    const detail = projectSelfDriveCategoryDetail(report, 'VEHICLE_RENTAL');
    const home = report.categories.find((c) => c.code === 'VEHICLE_RENTAL')!;
    expect(detail.category.summaryTitleZh).toBe(home.statusSummaryZh);
    expect(detail.items.length).toBeGreaterThanOrEqual(6);
    expect(detail.tips.length).toBeGreaterThan(0);
  });

  it('maps unread compliance to TO_PREPARE', () => {
    const report = assembleSelfDriveReadinessReport(
      baseInput({ complianceReads: {} }),
    );
    const compliance = report.categoryItems!.COMPLIANCE_KNOWLEDGE;
    expect(compliance.every((i) => i.status === 'TO_PREPARE')).toBe(true);
    expect(
      report.categories.find((c) => c.code === 'COMPLIANCE_KNOWLEDGE')
        ?.aggregateStatus,
    ).toBe('TO_PREPARE');
  });

  it('uses China compliance pack for CN (no Iceland offroad item)', () => {
    const report = assembleSelfDriveReadinessReport(
      baseInput({
        countryCode: 'CN',
        productLine: 'china_classic_self_drive',
        complianceReads: {},
        tripSummary: {
          title: 'G318 川藏南线',
          coverImageUrl: null,
          dateRangeLabelZh: '7月1日 - 7月14日',
          startDate: '2026-07-01',
          endDate: '2026-07-14',
          travelerCount: 2,
          travelerLabelZh: '2 人同行',
          routeLabelZh: '成都→拉萨',
          distanceSummaryZh: null,
        },
      }),
    );
    const compliance = report.categoryItems!.COMPLIANCE_KNOWLEDGE;
    expect(compliance.some((i) => i.id === 'city_driving_limit')).toBe(true);
    expect(compliance.some((i) => i.id === 'no_offroad')).toBe(false);
    expect(
      report.categories.find((c) => c.code === 'COMPLIANCE_KNOWLEDGE')
        ?.descriptionZh,
    ).toMatch(/限行|ETC|高原/);
    expect(report.categoryTips!.COMPLIANCE_KNOWLEDGE[0]?.textZh).toMatch(
      /限行|ETC|高反/,
    );
  });

  it('CTA opens first incomplete category', () => {
    const report = assembleSelfDriveReadinessReport(baseInput());
    expect(report.primaryCta.action).toBe('OPEN_FIRST_INCOMPLETE_CATEGORY');
    expect(report.primaryCta.categoryCode).toBeTruthy();
  });
});

describe('status helpers', () => {
  it('aggregate priority prefers MUST_RESOLVE', () => {
    const counts = withRemaining({
      completed: 3,
      toPrepare: 1,
      toConfirm: 1,
      mustResolve: 1,
      blocked: 0,
    });
    expect(resolveAggregateStatus(counts)).toBe('MUST_RESOLVE');
    expect(formatStatusSummaryZh('MUST_RESOLVE', counts)).toBe('必须解决 1 项');
  });

  it('countByStatus groups correctly', () => {
    const counts = countByStatus([
      {
        id: 'a',
        type: 'LICENSE_VALIDITY',
        titleZh: 'a',
        descriptionZh: null,
        status: 'COMPLETED',
        statusLabelZh: '已完成',
        iconKey: 'doc',
        isTappable: false,
      },
      {
        id: 'b',
        type: 'PRIMARY_DRIVER_AGE',
        titleZh: 'b',
        descriptionZh: null,
        status: 'MUST_RESOLVE',
        statusLabelZh: '必须解决',
        iconKey: 'doc',
        isTappable: true,
      },
    ]);
    expect(counts.completed).toBe(1);
    expect(counts.mustResolve).toBe(1);
  });
});
