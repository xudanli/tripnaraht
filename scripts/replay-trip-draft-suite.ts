/**
 * TripDraft Decision OS Replay Suite (lite)
 *
 * 目标：提供可重复证据（deterministic seed），验证：
 * - Lunch/Dinner 槽位类型锁（必须 RESTAURANT）
 * - finalStayMin >= minSafeMin（严禁悄悄松弛到 MinSafe 以下）
 * - decisionTrace/relaxation_event 结构存在且稳定
 *
 * 用法：
 * - npx tsx scripts/replay-trip-draft-suite.ts
 */
import { ConstraintEngine } from '../src/trips/services/constraint.engine';
import { FatiguePredictionEngine } from '../src/trips/services/fatigue-prediction.engine';
import { PacingEngine } from '../src/trips/services/pacing.engine';
import { TripDraftService } from '../src/trips/services/trip-draft.service';
import { TimeSlot, TransportMode, IntensityLevel } from '../src/trips/dto/trip-draft.dto';

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`[replay-trip-draft-suite] ${msg}`);
}

function main() {
  const constraintEngine = new ConstraintEngine();
  const fatigueEngine = new FatiguePredictionEngine();
  const pacingEngine = new PacingEngine();

  const baseCandidates: any[] = [
    // 餐厅（两家）
    { id: 1001, nameCN: '餐厅A', category: 'RESTAURANT', lat: 64.146, lng: -21.94, rating: 4.6, popularity: 9, tags: ['michelin'] },
    { id: 1002, nameCN: '餐厅B', category: 'RESTAURANT', lat: 64.147, lng: -21.95, rating: 4.2, popularity: 7, tags: [] },
    // 活动点（博物馆/景点/公园）
    { id: 2001, nameCN: '博物馆X', category: 'ATTRACTION', canonicalType: 'MUSEUM', lat: 64.15, lng: -21.93, rating: 4.8, popularity: 9, tags: ['museum'] },
    { id: 2002, nameCN: '景点Y', category: 'ATTRACTION', lat: 64.18, lng: -21.90, rating: 4.5, popularity: 8, tags: [] },
    { id: 2003, nameCN: '公园Z', category: 'PARK', lat: 64.20, lng: -21.92, rating: 4.0, popularity: 6, tags: [] },
    // 故意放一个“关门”的点（测试 openingHours gate）
    { id: 2999, nameCN: '关门景点', category: 'ATTRACTION', lat: 64.16, lng: -21.91, rating: 4.9, popularity: 9, openingHours: { weekday: 'Closed' } },
  ];
  // generateDraft 有“候选>=20”的门槛；这里在保留原始 id 的基础上扩展候选（用于回放，不影响生产逻辑）
  const candidates: any[] = [...baseCandidates];
  let idOffset = 0;
  while (candidates.length < 22) {
    for (const c of baseCandidates) {
      idOffset += 1;
      candidates.push({
        ...c,
        id: c.id + idOffset * 10000,
        nameCN: `${c.nameCN}_${idOffset}`,
      });
      if (candidates.length >= 22) break;
    }
  }

  const days = [{ day: 1, date: '2026-06-01' }];

  // 故意给错：lunch 塞景点、morning 塞餐厅、并且晚餐塞关门景点
  const llmResult = {
    days: [
      {
        day: 1,
        slots: {
          morning: { placeId: 1001, reason: '错误示例：morning 是餐厅' },
          lunch: { placeId: 2002, reason: '错误示例：lunch 不是餐厅' },
          afternoon: { placeId: 2999, reason: '错误示例：关门点' },
          dinner: { placeId: 2003, reason: '错误示例：dinner 不是餐厅' },
        },
      },
    ],
  };

  // TripDraftService 构造参数很多；replay suite 用最小 stub 覆盖 generateDraft 汇总口径
  const svc = new TripDraftService(
    {} as any,
    {} as any,
    {
      retrieve: async () => candidates,
    } as any,
    constraintEngine,
    {
      optimize: async () => llmResult,
    } as any,
    fatigueEngine,
    pacingEngine,
    {} as any,
  );

  const seed = 2293028143; // 固定 seed（可回放）

  const warnings: string[] = [];

  // 1) validateAndRepair 层断言
  const validatePromise = (svc as any)
    .validateAndRepair(days, llmResult, candidates, warnings, {
      intensity: IntensityLevel.BALANCED,
      transport: TransportMode.WALK,
      seed,
      timezone: 'America/New_York',
    })
    .then((validated: any[]) => {
      const d1 = validated[0];
      assert(d1?.slots?.lunch, 'day1 lunch missing');
      assert(d1?.slots?.dinner, 'day1 dinner missing');

      // 🆕 Contract: Opening Hours Audit (Decision OS)
      const items = Object.values(d1.slots).filter(Boolean) as any[];
      for (const it of items) {
        const ev: any = it?.evidence || {};
        const ohv = ev?.decision_metadata?.openingHoursValidation;
        assert(ohv, `${it?.slot}: missing evidence.decision_metadata.openingHoursValidation`);
        assert(ohv.targetSlot != null, `${it?.slot}: openingHoursValidation.targetSlot missing`);
        // data quality audit: if openingHours is missing, dataQuality must be LOW
        if (!ev.openingHours) {
          assert(ohv.dataQuality === 'LOW', `${it?.slot}: expected dataQuality=LOW when evidence.openingHours is empty`);
        }
        // physical consistency: uncovered must be explained (replacement/relaxation/sleep anchor)
        if (ohv.isCovered === false) {
          const hasExplanation =
            !!ev?.decisionTrace?.relaxation_event ||
            !!ev?.decisionTrace?.replacementTopK?.length ||
            typeof it?.reason === 'string' && /修复|松弛|Sleep Anchor|回酒店/.test(it.reason);
          assert(hasExplanation, `${it?.slot}: isCovered=false must have explanation (relaxation/replacement/sleep-anchor)`);
        }
      }

      const lunchId = d1.slots.lunch.placeId;
      const dinnerId = d1.slots.dinner.placeId;
      const lunchC = candidates.find((c) => c.id === lunchId);
      const dinnerC = candidates.find((c) => c.id === dinnerId);
      assert(lunchC?.category === 'RESTAURANT', `type lock violated: lunch is ${lunchC?.category}`);
      assert(dinnerC?.category === 'RESTAURANT', `type lock violated: dinner is ${dinnerC?.category}`);

      // MinSafe / FinalStay 审计
      for (const [slot, item] of Object.entries(d1.slots)) {
        const ev: any = (item as any).evidence || {};
        if (ev.minSafeMin != null && ev.finalStayMin != null) {
          assert(ev.finalStayMin >= ev.minSafeMin, `${slot}: finalStayMin < minSafeMin (${ev.finalStayMin} < ${ev.minSafeMin})`);
        }
        if (ev.decisionTrace?.relaxation_event?.type === 'TIME_COMPRESSION') {
          assert(ev.decisionTrace.relaxation_event.final_min >= ev.decisionTrace.relaxation_event.min_safe_min, `${slot}: relaxation final < min_safe`);
          // 🆕 TIME_COMPRESSION consistency: compressed_min should match evidence.compressedMin (if present)
          if (typeof ev.compressedMin === 'number') {
            assert(
              ev.decisionTrace.relaxation_event.compressed_min === ev.compressedMin,
              `${slot}: relaxation_event.compressed_min != evidence.compressedMin (${ev.decisionTrace.relaxation_event.compressed_min} != ${ev.compressedMin})`,
            );
          }
          assert(
            typeof ev.decisionTrace?.score_breakdown?.total === 'number',
            `${slot}: expected score_breakdown.total to be number when TIME_COMPRESSION`,
          );
        }
      }

      // decisionTrace 结构（替换应产生 replacementTopK）
      const hasTopK =
        Object.values(d1.slots).some((it: any) => it?.evidence?.decisionTrace?.replacementTopK?.length);
      assert(hasTopK, 'expected at least one replacementTopK trace');
    });

  // 1.5) Stress-Test: Unresolvable Constraints（全餐厅闭店，必须 FAILED）
  const closedRestaurantCandidates = candidates.map((c) => {
    if (c.category === 'RESTAURANT') {
      return { ...c, openingHours: { weekday: 'Closed' } };
    }
    return c;
  });
  const llmResultClosedRestaurant = {
    days: [
      {
        day: 1,
        slots: {
          morning: { placeId: 2002, reason: '正常活动点' },
          lunch: { placeId: 1001, reason: '午餐选了餐厅但闭店（应失败）' },
          afternoon: { placeId: 2003, reason: '正常活动点' },
          dinner: { placeId: 1002, reason: '晚餐选了餐厅但闭店（应失败）' },
        },
      },
    ],
  };
  const svcClosed = new TripDraftService(
    {} as any,
    {} as any,
    { retrieve: async () => closedRestaurantCandidates } as any,
    constraintEngine,
    { optimize: async () => llmResultClosedRestaurant } as any,
    fatigueEngine,
    pacingEngine,
    {} as any,
  );
  const failedPromise = (svcClosed as any)
    .generateDraft(
      {
        destination: 'IS',
        days: 1,
        startDate: '2026-06-01',
        intensity: IntensityLevel.BALANCED,
        transport: TransportMode.WALK,
        seed,
        useAlgorithmicDraft: true,
      },
      undefined,
      undefined,
    )
    .then((draft: any) => {
      assert(draft?.metadata?.verificationStatus === 'FAILED', `expected FAILED, got ${draft?.metadata?.verificationStatus}`);
      assert(Array.isArray(draft?.metadata?.failureReasonCodes), 'FAILED requires failureReasonCodes');
      assert(
        draft.metadata.failureReasonCodes.includes('OPENING_HOURS_CLOSED_UNRESOLVABLE'),
        `expected OPENING_HOURS_CLOSED_UNRESOLVABLE in failureReasonCodes, got ${JSON.stringify(draft.metadata.failureReasonCodes)}`,
      );
      // 证据：validationWarnings 中应出现“Closed 且无替代”的提示（当前实现为 warning + failureReasonCodes）
      const warningsArr: string[] = draft.validationWarnings || [];
      const hasClosedWarn = warningsArr.some((w) => /Closed.*无替代/.test(w) || /营业时间.*Closed.*无替代/.test(w));
      assert(hasClosedWarn, `FAILED case expected Closed-without-replacement warning, got ${JSON.stringify(warningsArr)}`);

      // 证据：metadata.failureDecisionTraces 必须包含 OPENING_HOURS_CLOSED_UNRESOLVABLE 的 rejectedTopK（Closed）
      const traces = draft?.metadata?.failureDecisionTraces || [];
      assert(Array.isArray(traces) && traces.length > 0, 'FAILED case expected metadata.failureDecisionTraces');
      const ohTrace = traces.find((t: any) => t?.reasonCode === 'OPENING_HOURS_CLOSED_UNRESOLVABLE');
      assert(ohTrace, `FAILED case expected OPENING_HOURS_CLOSED_UNRESOLVABLE trace, got ${JSON.stringify(traces)}`);
      assert(
        Array.isArray(ohTrace.rejectedTopK) && ohTrace.rejectedTopK.length > 0,
        'FAILED case expected rejectedTopK in failureDecisionTraces',
      );
    });

  // 1.6) Radar: Timezone window NOT_COVERED (NY local time)
  // - 场景：景点营业 10:00-17:00，但 morning slot 为 08:30-12:00（NY 墙钟），应触发 window 不覆盖且无替代 -> FAILED + evidence trace
  const nyCandidates: any[] = [];
  // 1) 非餐饮候选（全部 10-17，无覆盖 morning）
  for (let i = 0; i < 22; i++) {
    nyCandidates.push({
      id: 5000 + i,
      nameCN: `纽约景点_${i}`,
      category: 'ATTRACTION',
      lat: 40.76 + i * 0.001,
      lng: -73.98 - i * 0.001,
      rating: 4.6,
      popularity: 8,
      openingHours: { weekday: '10:00-17:00' },
      tags: [],
    });
  }
  // 2) 餐厅候选也全部 10-17，让 lunch/dinner 可行但 morning 不可行
  nyCandidates.push(
    { id: 6001, nameCN: '纽约餐厅A', category: 'RESTAURANT', lat: 40.74, lng: -73.99, rating: 4.6, popularity: 9, openingHours: { weekday: '10:00-17:00' }, tags: [] },
    { id: 6002, nameCN: '纽约餐厅B', category: 'RESTAURANT', lat: 40.75, lng: -73.97, rating: 4.4, popularity: 8, openingHours: { weekday: '10:00-17:00' }, tags: [] },
  );
  const llmResultNy = {
    days: [
      {
        day: 1,
        slots: {
          morning: { placeId: 5000, reason: '强行塞入早上活动（应失败）' },
          lunch: { placeId: 6001, reason: '午餐' },
          afternoon: { placeId: 5001, reason: '下午活动' },
          dinner: { placeId: 6002, reason: '晚餐' },
        },
      },
    ],
  };
  const svcNy = new TripDraftService(
    {} as any,
    {} as any,
    { retrieve: async () => nyCandidates } as any,
    constraintEngine,
    { optimize: async () => llmResultNy } as any,
    fatigueEngine,
    pacingEngine,
    {} as any,
  );
  const nyPromise = (svcNy as any)
    .generateDraft(
      {
        destination: 'US',
        days: 1,
        startDate: '2026-06-01',
        intensity: IntensityLevel.BALANCED,
        transport: TransportMode.WALK,
        seed,
        useAlgorithmicDraft: true,
      },
      undefined,
      undefined,
    )
    .then((draft: any) => {
      assert(draft?.metadata?.verificationStatus === 'FAILED', `NY radar expected FAILED, got ${draft?.metadata?.verificationStatus}`);
      const codes: string[] = draft?.metadata?.failureReasonCodes || [];
      assert(codes.includes('OPENING_HOURS_WINDOW_UNRESOLVABLE'), `NY radar expected OPENING_HOURS_WINDOW_UNRESOLVABLE, got ${JSON.stringify(codes)}`);
      const traces = draft?.metadata?.failureDecisionTraces || [];
      const t = traces.find((x: any) => x?.reasonCode === 'OPENING_HOURS_WINDOW_UNRESOLVABLE');
      assert(t, `NY radar expected OPENING_HOURS_WINDOW_UNRESOLVABLE trace, got ${JSON.stringify(traces)}`);
      const rej = t?.rejectedTopK || [];
      assert(Array.isArray(rej) && rej.length > 0, 'NY radar expected rejectedTopK');
      const hasNotCovered = rej.some((r: any) => /NOT_COVERING_WINDOW/.test(String(r?.reason || '')));
      assert(hasNotCovered, `NY radar expected NOT_COVERING_WINDOW evidence, got ${JSON.stringify(rej)}`);
    });

  // 2) generateDraft 层断言（覆盖 metadata.verificationStatus/failureReasonCodes 汇总口径）
  const generatePromise = (svc as any)
    .generateDraft(
      {
        destination: 'IS',
        days: 1,
        startDate: '2026-06-01',
        intensity: IntensityLevel.BALANCED,
        transport: TransportMode.WALK,
        seed,
        // 强制走算法模式，避免 llmOrchestrate
        useAlgorithmicDraft: true,
      },
      undefined,
      undefined,
    )
    .then((draft: any) => {
      assert(draft?.metadata?.verificationStatus, 'metadata.verificationStatus missing');
      // 本 suite 设计的输入应当能被修复到可用（不应 FAILED）
      assert(
        draft.metadata.verificationStatus === 'VERIFIED' || draft.metadata.verificationStatus === 'VERIFIED_WITH_RELAXATION',
        `unexpected verificationStatus=${draft.metadata.verificationStatus}`,
      );
      if (draft.metadata.verificationStatus === 'FAILED') {
        assert(Array.isArray(draft.metadata.failureReasonCodes), 'FAILED requires failureReasonCodes');
      }

      // 🆕 Contract: Opening Hours Audit must exist on produced draft items
      const all = (draft?.draftDays || []).flatMap((d: any) => Object.values(d?.slots || {})).filter(Boolean) as any[];
      assert(all.length > 0, 'expected draftDays slots to exist');
      for (const it of all) {
        const ev: any = it?.evidence || {};
        const ohv = ev?.decision_metadata?.openingHoursValidation;
        assert(ohv, `${it?.slot}: draft item missing openingHoursValidation`);
        assert(ohv.targetSlot != null, `${it?.slot}: draft openingHoursValidation.targetSlot missing`);
      }
    });

  return Promise.all([validatePromise, failedPromise, nyPromise, generatePromise]).then(() => {
    console.log('[replay-trip-draft-suite] OK');
    console.log(`[replay-trip-draft-suite] warnings=${warnings.length}`);
  });
}

main().catch((e: unknown) => {
  const err = e as any;
  console.error(String(err?.stack || err));
  process.exit(1);
});

