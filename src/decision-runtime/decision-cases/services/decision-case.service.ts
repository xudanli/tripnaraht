/**
 * Ensure Iceland self-drive DecisionCases: shells → enrich → conditional P0 rules.
 * AI 不直接 publish；规则 + materiality 才入库。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionCaseStoreService } from '../persistence/decision-case.store';
import type {
  DecisionCaseProductProjection,
  DecisionEligibilitySnapshot,
  DecisionOpportunityCandidate,
  DecisionOpportunityListView,
  StoredDecisionCase,
} from '../contracts/decision-case.types';
import {
  buildFroadMismatchCase,
  buildInsuranceShellCase,
  buildVehicleShellCase,
  enrichInsuranceCase,
  enrichVehicleCase,
  SEMANTIC_EXCESSIVE_DRIVE,
  SEMANTIC_GLACIER_EXPERIENCE,
  SEMANTIC_HIGH_IMPACT_EXPERIENCE,
  SEMANTIC_LANDING_LONG_DRIVE,
  SEMANTIC_RING_VS_SOUTH,
} from '../publishers/iceland-p0-case.builders';
import {
  buildExcessiveDailyDriveCase,
  buildGlacierExperienceCase,
  buildHighImpactExperienceCase,
  buildLandingLongDriveCase,
  buildRingVsSouthCase,
  toEligibilitySnapshot,
  type HighImpactExperienceKind,
} from '../publishers/iceland-p0-route-experience.builders';
import {
  buildMaterialityScore,
  emptyMaterialityBreakdown,
  evaluateThreeGatePublish,
  passesMaterialityPublishGate,
  shouldStayOpportunityOnly,
} from '../materiality/decision-materiality.util';
import {
  evaluateExperienceEligibility,
  evaluateScheduleTriggerEligibility,
  parseTripPartyCapabilities,
  scheduleMaterialityBoost,
} from '../eligibility/decision-eligibility.util';
import type { TripPartyCapabilities } from '../eligibility/decision-eligibility.types';
import {
  mapStoredCaseToInternalRow,
  mapStoredCaseOptionsToDecisionOptions,
  projectCaseToProductFields,
} from '../projections/decision-case.projection';
import type { InternalUnifiedProblemRow } from '../../gateway/utils/unified-decision-problem-projection.util';
import type { DecisionOption } from '../../../trips/decision-semantics/types/decision-semantics.types';
import { buildIcelandSelfDriveSituationClientFromCaseFlags } from '../../packs/knowledge/demo/build-iceland-self-drive-situation.client';
import type { IcelandSelfDriveSituationClientV1 } from '../../packs/knowledge/demo/iceland-self-drive-situation.client';
import type { InsuranceCoverageTier } from '../../packs/knowledge/rental-insurance';

const DEFAULT_DAY_LIMIT_HOURS = 8;
const MIN_RING_DAYS = 10;
const EXECUTION_DAY_CAP_HOURS = 10;

@Injectable()
export class DecisionCaseService {
  private readonly logger = new Logger(DecisionCaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DecisionCaseStoreService,
  ) {}

  async ensureAndCollectRows(tripId: string): Promise<{
    rows: InternalUnifiedProblemRow[];
    caseByProblemId: Record<string, StoredDecisionCase>;
  }> {
    const ctx = await this.loadTripContext(tripId);
    if (!ctx.isIcelandSelfDrive) {
      return { rows: [], caseByProblemId: {} };
    }

    await this.ensureP0ShellsAndEnrich(tripId, ctx);
    await this.ensureExperienceOpportunities(tripId, ctx);

    const published = await this.store.listPublished(tripId);
    const caseByProblemId: Record<string, StoredDecisionCase> = {};
    for (const c of published) {
      if (['RESOLVED', 'DISMISSED'].includes(c.workflowStatus)) continue;
      caseByProblemId[c.problemId] = c;
    }

    return {
      rows: Object.values(caseByProblemId).map(mapStoredCaseToInternalRow),
      caseByProblemId,
    };
  }

  async getCase(tripId: string, problemId: string): Promise<StoredDecisionCase | undefined> {
    return this.store.getCase(tripId, problemId);
  }

  async getCaseOptions(tripId: string, problemId: string): Promise<DecisionOption[] | undefined> {
    const c = await this.store.getCase(tripId, problemId);
    if (!c?.published) return undefined;
    return mapStoredCaseOptionsToDecisionOptions(c.problemId, c.options);
  }

  productProjection(decisionCase: StoredDecisionCase): DecisionCaseProductProjection {
    return projectCaseToProductFields(decisionCase);
  }

  async isIcelandSelfDriveTrip(tripId: string): Promise<boolean> {
    const ctx = await this.loadTripContext(tripId);
    return ctx.isIcelandSelfDrive;
  }

  /**
   * 规划期 Situation 专用投影；会 ensureP0Shells，保证 deepLink.problemIdHint 可命中。
   * 非冰岛自驾返回 undefined（由 product BFF 映射为 NOT_ICELAND_SELF_DRIVE）。
   */
  async getIcelandSelfDriveSituationClient(
    tripId: string,
  ): Promise<IcelandSelfDriveSituationClientV1 | undefined> {
    const ctx = await this.loadTripContext(tripId);
    if (!ctx.isIcelandSelfDrive) return undefined;

    await this.ensureP0ShellsAndEnrich(tripId, ctx);

    return buildIcelandSelfDriveSituationClientFromCaseFlags({
      tripId,
      hasFRoad: ctx.hasFRoad,
      hasGravel: ctx.hasGravel,
      highWind: ctx.highWind,
      vehicleType: ctx.vehicleType,
      vehicleClassLabel: ctx.vehicleClassLabel,
      rentalRestrictions: ctx.rentalRestrictions,
      fRoadIdHint: ctx.fRoadIdHint,
      fRoadAllowed: ctx.fRoadAllowed,
      coverageTier: ctx.coverageTier,
      fordCrossing: ctx.fordCrossing,
    });
  }

  async listOpportunities(tripId: string): Promise<DecisionOpportunityListView> {
    const ctx = await this.loadTripContext(tripId);
    if (ctx.isIcelandSelfDrive) {
      await this.ensureExperienceOpportunities(tripId, ctx);
    }
    const items = await this.store.listOpportunities(tripId);
    return {
      schemaId: 'tripnara.decision_opportunities@v1',
      tripId,
      generatedAt: new Date().toISOString(),
      meta: {
        total: items.length,
        eligibleCount: items.filter((i) => i.eligible).length,
      },
      items,
    };
  }

  async publishOpportunityAsCase(
    tripId: string,
    opportunityId: string,
  ): Promise<StoredDecisionCase | null> {
    const state = await this.store.load(tripId);
    const opp = state.opportunitiesById[opportunityId];
    if (!opp || !opp.eligible) return null;
    if (
      !passesMaterialityPublishGate({
        eligible: true,
        materialityTotal: opp.materiality.total,
      })
    ) {
      return null;
    }

    if (opp.subjectRef.includes('glacier')) {
      const existing = Object.values(state.byProblemId).find(
        (c) => c.semanticKey === SEMANTIC_GLACIER_EXPERIENCE && !c.resolvedOptionId,
      );
      if (existing) return existing;
      const ctx = await this.loadTripContext(tripId);
      const eligibility = evaluateExperienceEligibility('glacier', ctx.party);
      if (!eligibility.eligible) return null;
      const glacier = buildGlacierExperienceCase({
        tripId,
        materialityBoost: true,
        eligibility,
      });
      glacier.opportunityId = opportunityId;
      await this.store.upsertCase(tripId, glacier);
      return glacier;
    }

    if (!opp.subjectRef.includes('experience')) return null;

    const kind = resolveHighImpactKindFromSubject(opp.subjectRef);
    if (!kind) return null;
    const ctx = await this.loadTripContext(tripId);
    const eligibility = evaluateExperienceEligibility(kind, ctx.party);
    if (!eligibility.eligible) return null;
    const decisionCase = buildHighImpactExperienceCase({ tripId, kind, eligibility });
    decisionCase.opportunityId = opportunityId;
    await this.store.upsertCase(tripId, decisionCase);
    return decisionCase;
  }

  private async ensureP0ShellsAndEnrich(
    tripId: string,
    ctx: TripCaseContext,
  ): Promise<void> {
    const state = await this.store.load(tripId);
    let dirty = false;

    const upsertIfNew = (c: StoredDecisionCase) => {
      const prev = state.byProblemId[c.problemId];
      if (prev?.resolvedOptionId) return;
      if (prev) return;
      state.byProblemId[c.problemId] = c;
      dirty = true;
    };

    let vehicle = Object.values(state.byProblemId).find(
      (c) => c.semanticKey === 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
    );
    if (!vehicle) {
      vehicle = buildVehicleShellCase(tripId);
      state.byProblemId[vehicle.problemId] = vehicle;
      dirty = true;
    }

    if (ctx.routeReady && vehicle.enrichmentStage === 'SHELL' && !vehicle.resolvedOptionId) {
      vehicle = enrichVehicleCase(vehicle, {
        hasFRoad: ctx.hasFRoad,
        gravelShareHint: ctx.hasGravel ? '路线含碎石路段，影响车轮/底盘与保险' : undefined,
        windExposure: ctx.highWind,
      });
      state.byProblemId[vehicle.problemId] = vehicle;
      dirty = true;
    }

    let insurance = Object.values(state.byProblemId).find(
      (c) => c.semanticKey === 'REQUIRED_CHOICE.RENTAL_INSURANCE',
    );
    if (!insurance) {
      insurance = buildInsuranceShellCase(tripId);
      state.byProblemId[insurance.problemId] = insurance;
      dirty = true;
    }

    const vehicleConfirmed = Boolean(ctx.vehicleType && vehicle.resolvedOptionId);
    if (
      ctx.routeReady &&
      (vehicleConfirmed || vehicle.enrichmentStage === 'ENRICHED') &&
      !insurance.resolvedOptionId
    ) {
      const needsEnrichShell = insurance.enrichmentStage === 'SHELL';
      const needsFordingHintRefresh = !insurance.options.every(
        (o) => o.writebackPayload?.fordingExcluded === true,
      );
      if (needsEnrichShell || needsFordingHintRefresh) {
        insurance = enrichInsuranceCase(insurance, {
          gravelRisk: ctx.hasGravel,
          highWind: ctx.highWind,
          highlands: ctx.hasFRoad,
          vehicleConfirmed: vehicleConfirmed || vehicle.enrichmentStage === 'ENRICHED',
        });
        state.byProblemId[insurance.problemId] = insurance;
        dirty = true;
      }
    }

    const effectiveVehicle = ctx.vehicleType ?? '2WD';
    const needsFroadCase =
      ctx.hasFRoad &&
      (effectiveVehicle === '2WD' ||
        ctx.fRoadAllowed === false ||
        ctx.constraints.excludeFRoad === true);

    if (needsFroadCase && vehicle.resolvedOptionId) {
      upsertIfNew(
        buildFroadMismatchCase({
          tripId,
          roadId: ctx.fRoadIdHint ?? 'F-road',
          vehicleType: effectiveVehicle,
          reason: '当前车型与计划高地 / F-road 不匹配',
        }),
      );
    }

    if (ctx.routeReady && ctx.excessiveDrive) {
      const hasDrive = Object.values(state.byProblemId).some(
        (c) => c.semanticKey === SEMANTIC_EXCESSIVE_DRIVE && !c.resolvedOptionId,
      );
      if (!hasDrive) {
        upsertIfNew(
          buildExcessiveDailyDriveCase({
            tripId,
            dayIndex: ctx.excessiveDrive.dayIndex,
            driveHours: ctx.excessiveDrive.driveHours,
            dayLimitHours: ctx.dayLimitHours,
            reason: ctx.excessiveDrive.reason,
          }),
        );
      }
    }

    if (ctx.routeReady && ctx.landingLongDrive) {
      const schedElig = evaluateScheduleTriggerEligibility(
        'landing_long_drive',
        ctx.party,
      );
      const boost = scheduleMaterialityBoost(ctx.party);
      const gate = evaluateThreeGatePublish({
        detected: true,
        eligible: schedElig.eligible,
        materialityTotal: 8 + boost.fitness + boost.team, // landing base ~8
      });
      const hasLanding = Object.values(state.byProblemId).some(
        (c) => c.semanticKey === SEMANTIC_LANDING_LONG_DRIVE && !c.resolvedOptionId,
      );
      if (!hasLanding && gate.publish) {
        upsertIfNew(
          buildLandingLongDriveCase({
            tripId,
            arrivalHint: ctx.landingLongDrive.arrivalHint,
            day1DriveHours: ctx.landingLongDrive.day1DriveHours,
            eligibility: schedElig,
            materialityBoost: boost,
          }),
        );
      }
    }

    if (ctx.routeReady && ctx.ringVsSouth) {
      const schedElig = evaluateScheduleTriggerEligibility('ring_vs_south', ctx.party);
      const boost = scheduleMaterialityBoost(ctx.party);
      const hasRing = Object.values(state.byProblemId).some(
        (c) => c.semanticKey === SEMANTIC_RING_VS_SOUTH && !c.resolvedOptionId,
      );
      if (!hasRing && schedElig.eligible) {
        upsertIfNew(
          buildRingVsSouthCase({
            tripId,
            tripDays: ctx.tripDays,
            minRingDays: MIN_RING_DAYS,
            avgDriveHours: ctx.ringVsSouth.avgDriveHours,
            dayLimitHours: ctx.dayLimitHours,
            eligibility: schedElig,
            materialityBoost: boost,
          }),
        );
      }
    }

    if (dirty) {
      await this.store.saveState(tripId, state);
      this.logger.log(`decision_cases_ensured trip=${tripId}`);
    }
  }

  private async ensureExperienceOpportunities(
    tripId: string,
    ctx: TripCaseContext,
  ): Promise<void> {
    if (!ctx.routeReady) return;
    const state = await this.store.load(tripId);
    const now = new Date().toISOString();
    let dirty = false;

    const glacierElig = evaluateExperienceEligibility('glacier', ctx.party);
    const glacierMat = buildMaterialityScore({
      ...emptyMaterialityBreakdown(),
      budget: ctx.glacierNeedsBooking ? 3 : 2,
      time: 3,
      fitness: 2,
      bookingUrgency: ctx.glacierNeedsBooking ? 2 : 1,
      safety: 1,
    });
    const glacierSnap = toEligibilitySnapshot(glacierElig);
    const glacierEvidence = [
      'route:skaftafell_or_solheimajokull',
      'pref:adventure',
      ...ctx.party.evidenceRefs,
      'gate:eligibility',
    ];

    const glacierId = `opp_glacier_${tripId}`;
    if (ctx.nearGlacier) {
      const prev = state.opportunitiesById[glacierId];
      if (!prev) {
        state.opportunitiesById[glacierId] = buildOpportunityRow({
          opportunityId: glacierId,
          tripId,
          triggerType: 'ROUTE_INTERSECTION',
          subjectRef: 'experience:glacier',
          evidenceRefs: glacierEvidence,
          title: '是否加入冰川体验？',
          summary: glacierOpportunitySummary(glacierElig, glacierMat.total),
          domain: 'EXPERIENCE',
          materiality: glacierMat,
          eligibility: glacierSnap,
          now,
        });
        dirty = true;
      } else if (prev.eligible !== glacierElig.eligible) {
        prev.eligible = glacierElig.eligible;
        prev.ineligibilityReason = glacierElig.reason;
        prev.eligibility = glacierSnap;
        prev.summary = glacierOpportunitySummary(glacierElig, glacierMat.total);
        prev.updatedAt = now;
        dirty = true;
      }

      const glacierGate = evaluateThreeGatePublish({
        detected: true,
        eligible: glacierElig.eligible,
        materialityTotal: glacierMat.total,
        ineligibilityReason: glacierElig.reason,
      });
      if (glacierGate.publish) {
        const hasGlacierCase = Object.values(state.byProblemId).some(
          (c) => c.semanticKey === SEMANTIC_GLACIER_EXPERIENCE && !c.resolvedOptionId,
        );
        if (!hasGlacierCase) {
          const glacier = buildGlacierExperienceCase({
            tripId,
            materialityBoost: ctx.glacierNeedsBooking,
            eligibility: glacierElig,
          });
          glacier.opportunityId = glacierId;
          state.byProblemId[glacier.problemId] = glacier;
          dirty = true;
        }
      }
    }

    if (ctx.highImpactKind) {
      const kind = ctx.highImpactKind;
      const expElig = evaluateExperienceEligibility(kind, ctx.party);
      const mat = buildMaterialityScore({
        ...emptyMaterialityBreakdown(),
        budget: 2,
        time: 2,
        bookingUrgency: 2,
        fitness: kind === 'silfra' || kind === 'snowmobile' ? 2 : 1,
        safety: 1,
      });
      const oppId = `opp_${kind}_${tripId}`;
      const snap = toEligibilitySnapshot(expElig);
      const prev = state.opportunitiesById[oppId];
      if (!prev) {
        state.opportunitiesById[oppId] = buildOpportunityRow({
          opportunityId: oppId,
          tripId,
          triggerType: 'PROFILE_MATCH',
          subjectRef: `experience:${kind}`,
          evidenceRefs: [
            `pref:${kind}`,
            'route:proximity',
            ...ctx.party.evidenceRefs,
            'gate:eligibility',
          ],
          title: `高影响体验候选：${kind}`,
          summary: expElig.eligible
            ? shouldStayOpportunityOnly(mat.total)
              ? '系统发现体验机会；影响尚未达门槛，仅作机会。'
              : '体验会影响预算、时段与预订；已过资格闸。'
            : `未过资格闸：${expElig.reason ?? '体能或资格不足'}`,
          domain: 'EXPERIENCE',
          materiality: mat,
          eligibility: snap,
          now,
        });
        dirty = true;
      } else if (prev.eligible !== expElig.eligible) {
        prev.eligible = expElig.eligible;
        prev.ineligibilityReason = expElig.reason;
        prev.eligibility = snap;
        prev.updatedAt = now;
        dirty = true;
      }

      const gate = evaluateThreeGatePublish({
        detected: true,
        eligible: expElig.eligible,
        materialityTotal: mat.total,
        ineligibilityReason: expElig.reason,
      });
      if (gate.publish) {
        const hasExp = Object.values(state.byProblemId).some(
          (c) =>
            c.semanticKey === SEMANTIC_HIGH_IMPACT_EXPERIENCE &&
            c.problemId.includes(kind) &&
            !c.resolvedOptionId,
        );
        if (!hasExp) {
          const expCase = buildHighImpactExperienceCase({
            tripId,
            kind,
            eligibility: expElig,
          });
          expCase.opportunityId = oppId;
          state.byProblemId[expCase.problemId] = expCase;
          dirty = true;
        }
      }
    }

    if (dirty) await this.store.saveState(tripId, state);
  }

  private async loadTripContext(tripId: string): Promise<TripCaseContext> {
    const [trip, dayCount] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { destination: true, metadata: true },
      }),
      this.prisma.tripDay.count({ where: { tripId } }),
    ]);

    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const constraints = (meta.constraints as Record<string, unknown> | undefined) ?? {};
    const destination = (trip?.destination ?? '').toUpperCase();
    const countryHint = String(
      meta.countryCode ?? meta.destinationCountryCode ?? destination,
    ).toUpperCase();
    const needsCar =
      meta.needsCarRental === true ||
      meta.travelMode === 'SELF_DRIVE' ||
      meta.mobilityMode === 'SELF_DRIVE' ||
      countryHint === 'IS' ||
      destination === 'IS' ||
      destination.includes('ICELAND');

    const isIcelandSelfDrive =
      (countryHint === 'IS' || destination === 'IS' || destination.includes('ICELAND')) &&
      needsCar;

    const party = parseTripPartyCapabilities(meta);

    const routeFlags = (meta.routeDecisionFlags as Record<string, unknown> | undefined) ?? {};
    const hasFRoad =
      routeFlags.hasFRoad === true ||
      meta.hasFRoad === true ||
      (Array.isArray(meta.fRoadIds) && (meta.fRoadIds as unknown[]).length > 0);
    const hasGravel = routeFlags.hasGravel === true || meta.hasGravel === true;
    const highWind = routeFlags.highWind === true || meta.highWindExposure === true;
    const nearGlacier =
      routeFlags.nearGlacier === true ||
      meta.nearGlacier === true ||
      (isIcelandSelfDrive &&
        dayCount >= 3 &&
        routeFlags.suppressGlacier !== true &&
        meta.suppressGlacier !== true);

    const dayLimitHours = num(
      constraints.maxDailyDriveHours ??
        meta.maxDailyDriveHours ??
        routeFlags.dayLimitHours,
      DEFAULT_DAY_LIMIT_HOURS,
    );

    const maxDayDriveHours = num(
      routeFlags.maxDailyDriveHours ?? meta.maxDailyDriveHoursObserved,
      0,
    );
    const peakDayIndex = num(routeFlags.peakDriveDayIndex ?? meta.peakDriveDayIndex, 0);
    const avgDriveHours = num(
      routeFlags.avgDailyDriveHours ?? meta.avgDailyDriveHours,
      dayCount > 0 && maxDayDriveHours > 0 ? maxDayDriveHours * 0.75 : 0,
    );

    let excessiveDrive: TripCaseContext['excessiveDrive'];
    if (
      maxDayDriveHours > dayLimitHours ||
      maxDayDriveHours > EXECUTION_DAY_CAP_HOURS ||
      routeFlags.consecutiveHighLoad === true
    ) {
      excessiveDrive = {
        dayIndex: peakDayIndex,
        driveHours: maxDayDriveHours || dayLimitHours + 2,
        reason:
          maxDayDriveHours > EXECUTION_DAY_CAP_HOURS
            ? '当天总执行时长偏高，SafeTravel 建议避免疲劳驾驶。'
            : '预计驾驶超过用户每日上限。',
      };
    } else if (
      isIcelandSelfDrive &&
      dayCount >= 4 &&
      dayCount < MIN_RING_DAYS &&
      isRingIntent(meta, routeFlags) &&
      routeFlags.suppressDriveLoadCase !== true
    ) {
      excessiveDrive = {
        dayIndex: Math.min(2, Math.max(0, dayCount - 1)),
        driveHours: dayLimitHours + 2.5,
        reason: '有限天数环岛常见超长驾驶日，建议确认是否拆宿。',
      };
    }

    const day1DriveHours = num(
      routeFlags.day1DriveHours ?? meta.day1DriveHours,
      isIcelandSelfDrive && dayCount > 0 ? 5 : 0,
    );
    let landingLongDrive: TripCaseContext['landingLongDrive'];
    const hasIntlArrival =
      meta.hasInternationalArrival === true ||
      routeFlags.hasInternationalArrival === true ||
      Boolean(meta.inboundFlight) ||
      Boolean(routeFlags.inboundFlight);
    const jetlagRisk =
      meta.jetlagRisk === true ||
      routeFlags.jetlagRisk === true ||
      meta.nightArrival === true ||
      routeFlags.nightArrival === true ||
      meta.earlyArrival === true ||
      routeFlags.earlyArrival === true;
    const landingModeSet = Boolean(meta.landingMode || constraints.landingMode);

    if (routeFlags.suppressLandingCase === true || landingModeSet) {
      landingLongDrive = undefined;
    } else if (
      hasIntlArrival &&
      day1DriveHours >= 3.5 &&
      (jetlagRisk || day1DriveHours >= dayLimitHours * 0.6)
    ) {
      landingLongDrive = {
        arrivalHint:
          meta.nightArrival || routeFlags.nightArrival
            ? '存在夜航 / 较晚到达信息'
            : jetlagRisk
              ? '存在国际航班到达与时差风险'
              : '存在国际抵达后首日长驾',
        day1DriveHours,
      };
    } else if (
      routeFlags.forceLandingCase === true ||
      meta.forceLandingCase === true ||
      (isIcelandSelfDrive &&
        dayCount >= 5 &&
        meta.hasInternationalArrival !== false &&
        day1DriveHours >= 4)
    ) {
      landingLongDrive = {
        arrivalHint: hasIntlArrival
          ? '国际抵达后开程（证据：inbound / hasInternationalArrival）'
          : '默认按国际抵达后开程建模（可用 suppressLandingCase 关闭）',
        day1DriveHours: Math.max(day1DriveHours, 4.5),
      };
    }

    let ringVsSouth: TripCaseContext['ringVsSouth'];
    const ringIntent = isRingIntent(meta, routeFlags);
    if (
      ringIntent &&
      routeFlags.suppressRingScopeCase !== true &&
      ((dayCount > 0 && dayCount < MIN_RING_DAYS) ||
        avgDriveHours > dayLimitHours ||
        routeFlags.shallowStops === true ||
        routeFlags.forceRingScopeCase === true)
    ) {
      ringVsSouth = {
        avgDriveHours: avgDriveHours || dayLimitHours + 1,
      };
    }

    const glacierNeedsBooking =
      routeFlags.glacierNeedsBooking === true || meta.glacierNeedsBooking === true;

    const highImpactKind = resolveHighImpactKind(meta, routeFlags);

    const vehicleType = String(
      constraints.vehicle_type ?? constraints.vehicleType ?? meta.vehicleType ?? '',
    ).toUpperCase();

    const isd =
      meta.icelandSelfDrive && typeof meta.icelandSelfDrive === 'object'
        ? (meta.icelandSelfDrive as Record<string, unknown>)
        : undefined;
    const drivingSettings =
      isd?.drivingSettings && typeof isd.drivingSettings === 'object'
        ? (isd.drivingSettings as Record<string, unknown>)
        : meta.drivingSettings && typeof meta.drivingSettings === 'object'
          ? (meta.drivingSettings as Record<string, unknown>)
          : undefined;
    const vehicleSettings =
      drivingSettings?.vehicle && typeof drivingSettings.vehicle === 'object'
        ? (drivingSettings.vehicle as Record<string, unknown>)
        : undefined;
    const insuranceSettings =
      drivingSettings?.insurance && typeof drivingSettings.insurance === 'object'
        ? (drivingSettings.insurance as Record<string, unknown>)
        : undefined;

    const vehicleClassLabel =
      typeof vehicleSettings?.vehicleClassLabel === 'string'
        ? vehicleSettings.vehicleClassLabel
        : null;
    const rentalRestrictions = Array.isArray(vehicleSettings?.rentalRestrictions)
      ? (vehicleSettings!.rentalRestrictions as unknown[]).map(String)
      : Array.isArray(constraints.rentalRestrictions)
        ? (constraints.rentalRestrictions as unknown[]).map(String)
        : [];

    const coverageRaw = String(
      insuranceSettings?.coverageTier ??
        constraints.coverageTier ??
        constraints.insuranceCoverageTier ??
        '',
    ).toUpperCase();
    const coverageTier: InsuranceCoverageTier | undefined =
      coverageRaw === 'BASIC' || coverageRaw === 'STANDARD' || coverageRaw === 'FULL'
        ? coverageRaw
        : undefined;

    const fordCrossing =
      rentalRestrictions.includes('no_wading') ||
      constraints.excludeFording === true ||
      routeFlags.fordCrossing === true;

    return {
      isIcelandSelfDrive,
      routeReady:
        dayCount > 0 || meta.routeDraftReady === true || meta.itineraryGenerated === true,
      tripDays: dayCount,
      dayLimitHours,
      hasFRoad,
      hasGravel,
      highWind,
      nearGlacier,
      glacierNeedsBooking,
      vehicleType: vehicleType || undefined,
      vehicleClassLabel,
      rentalRestrictions,
      coverageTier,
      fordCrossing,
      fRoadAllowed: constraints.fRoadAllowed,
      fRoadIdHint: Array.isArray(meta.fRoadIds)
        ? String((meta.fRoadIds as unknown[])[0] ?? 'F-road')
        : 'F-road',
      constraints,
      party,
      excessiveDrive,
      landingLongDrive,
      ringVsSouth,
      highImpactKind,
    };
  }
}

function buildOpportunityRow(input: {
  opportunityId: string;
  tripId: string;
  triggerType: DecisionOpportunityCandidate['triggerType'];
  subjectRef: string;
  evidenceRefs: string[];
  title: string;
  summary: string;
  domain: DecisionOpportunityCandidate['domain'];
  materiality: DecisionOpportunityCandidate['materiality'];
  eligibility: DecisionEligibilitySnapshot;
  now: string;
}): DecisionOpportunityCandidate {
  return {
    opportunityId: input.opportunityId,
    tripId: input.tripId,
    triggerType: input.triggerType,
    subjectRef: input.subjectRef,
    evidenceRefs: input.evidenceRefs,
    title: input.title,
    summary: input.summary,
    domain: input.domain,
    materiality: input.materiality,
    eligible: input.eligibility.eligible,
    ineligibilityReason: input.eligibility.reason,
    eligibility: input.eligibility,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function glacierOpportunitySummary(
  eligibility: { eligible: boolean; reason?: string },
  materialityTotal: number,
): string {
  if (!eligibility.eligible) {
    return `未过资格闸：${eligibility.reason ?? '体能或资格不足'}；保留为不可发布机会。`;
  }
  return shouldStayOpportunityOnly(materialityTotal)
    ? '发现冰川徒步 / 冰洞候选；影响尚未达重要门槛，仅作机会。'
    : '冰川体验会影响预算、时段与预订；已过资格闸。';
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isRingIntent(
  meta: Record<string, unknown>,
  routeFlags: Record<string, unknown>,
): boolean {
  if (meta.routeScope === 'SOUTH_COAST_FOCUS' || routeFlags.routeScope === 'SOUTH_COAST_FOCUS') {
    return false;
  }
  const scope = String(
    meta.routeScope ?? routeFlags.routeScope ?? meta.explorationStrategy ?? '',
  ).toLowerCase();
  return (
    scope.includes('ring') ||
    meta.wantsRingRoad === true ||
    routeFlags.wantsRingRoad === true ||
    meta.coverageGoal === 'RING' ||
    (meta.wantsRingRoad !== false &&
      routeFlags.wantsRingRoad !== false &&
      !scope.includes('south'))
  );
}

function resolveHighImpactKind(
  meta: Record<string, unknown>,
  routeFlags: Record<string, unknown>,
): HighImpactExperienceKind | undefined {
  const explicit = String(
    meta.highImpactExperience ?? routeFlags.highImpactExperience ?? '',
  ).toLowerCase();
  if (
    explicit === 'whale' ||
    explicit === 'silfra' ||
    explicit === 'snowmobile' ||
    explicit === 'super_jeep'
  ) {
    return explicit;
  }
  const prefs = [
    ...(Array.isArray(meta.preferences) ? (meta.preferences as unknown[]) : []),
    ...(Array.isArray(routeFlags.experiencePrefs)
      ? (routeFlags.experiencePrefs as unknown[])
      : []),
  ]
    .map((p) => String(p).toLowerCase())
    .join(' ');
  if (/whale|观鲸/.test(prefs) || routeFlags.nearWhale === true) return 'whale';
  if (/silfra|浮潜|snorkel/.test(prefs) || routeFlags.nearSilfra === true) return 'silfra';
  if (/snowmobile|雪地摩托/.test(prefs)) return 'snowmobile';
  if (/super.?jeep|高地跟团/.test(prefs) || routeFlags.suggestSuperJeep === true) {
    return 'super_jeep';
  }
  if (routeFlags.nearThingvellir === true) return 'silfra';
  return undefined;
}

function resolveHighImpactKindFromSubject(
  subjectRef: string,
): HighImpactExperienceKind | undefined {
  if (subjectRef.includes('whale')) return 'whale';
  if (subjectRef.includes('silfra')) return 'silfra';
  if (subjectRef.includes('snowmobile')) return 'snowmobile';
  if (subjectRef.includes('super_jeep')) return 'super_jeep';
  return undefined;
}

interface TripCaseContext {
  isIcelandSelfDrive: boolean;
  routeReady: boolean;
  tripDays: number;
  dayLimitHours: number;
  hasFRoad: boolean;
  hasGravel: boolean;
  highWind: boolean;
  nearGlacier: boolean;
  glacierNeedsBooking: boolean;
  vehicleType?: string;
  vehicleClassLabel?: string | null;
  rentalRestrictions?: string[];
  coverageTier?: InsuranceCoverageTier;
  fordCrossing?: boolean;
  fRoadAllowed?: unknown;
  fRoadIdHint?: string;
  constraints: Record<string, unknown>;
  party: TripPartyCapabilities;
  excessiveDrive?: { dayIndex: number; driveHours: number; reason: string };
  landingLongDrive?: { arrivalHint: string; day1DriveHours: number };
  ringVsSouth?: { avgDriveHours: number };
  highImpactKind?: HighImpactExperienceKind;
}
