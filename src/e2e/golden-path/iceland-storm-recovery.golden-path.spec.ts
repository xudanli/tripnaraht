/**
 * Golden Path E2E — 冰岛风暴恢复全链路验收（Decision OS 活样本守卫）。
 *
 * Incident  → Replan  → Delivery
 * 暴风雪击穿冰洞 → 同理心恢复 → 局部重算 → 差量叙述 / SSE Canvas 契约
 */
import { MetaPolicyService } from '../../trips/decision/optimization/meta/meta-policy.service';
import {
  WORLD_UI_LAYER_DIFF_STREAM,
  WORLD_UI_LAYER_MAP,
  WORLD_UI_LAYER_NARRATIVE,
} from '../../world/world-editing-ui-paradigm';
import {
  runGoldenPathCgusPhase,
  runGoldenPathDeliveryPhase,
  runGoldenPathEmotionalDeliveryAudit,
  runGoldenPathIncidentPhase,
  runGoldenPathReplanPhase,
} from './iceland-storm-golden-path.harness';

describe('Golden Path E2E: Iceland storm → empathy recovery → partial replan → delivery', () => {
  const metaPolicy = new MetaPolicyService();

  describe('Anchor 1 — The Incident (冰洞崩溃)', () => {
    const incident = runGoldenPathIncidentPhase(metaPolicy);

    it('projects ExperienceFlow onto WorldModelContext with EMPATHY_RECOVERY tempo', () => {
      expect(incident.world.experienceFlow).toBeDefined();
      expect(incident.world.experienceFlow!.tempo).toBe('EMPATHY_RECOVERY');
      expect(incident.experienceFlow.currentFrictionCapacity).toBeLessThanOrEqual(0.25);
      expect(incident.experienceFlow.narrativeTone).toBe('empathetic_reassurance');
    });

    it('MetaPolicy suppresses exploration and aligns β ≈ 0.02 under empathy recovery', () => {
      expect(incident.metaPolicyOutput.useExploration).toBe(false);
      expect(incident.metaPolicyOutput.explorationBeta).toBeLessThanOrEqual(0.03);
      expect(incident.routingWeights.wFriction).toBe(1.35);
      expect(incident.routingWeights.betaInformationGain).toBeLessThanOrEqual(0.03);
    });

    it('materializes __experience_flow in research_data for DPO ground truth', () => {
      expect(incident.researchData.__experience_flow).toMatchObject({
        tempo: 'EMPATHY_RECOVERY',
        narrativeTone: 'empathetic_reassurance',
      });
    });
  });

  describe('Anchor 1.5 — CGUS Experience Routing (真实 search + audit)', () => {
    it('calls CGUSSearchService.search() and ranks shelter-first under EMPATHY_RECOVERY', async () => {
      const { cgus, experienceRoutingAudit } = await runGoldenPathCgusPhase(metaPolicy);

      expect(cgus.experienceRoutingAudit).toBeDefined();
      expect(experienceRoutingAudit.tempo).toBe('EMPATHY_RECOVERY');
      expect(experienceRoutingAudit.weights.w2).toBe(1.35);
      expect(experienceRoutingAudit.weights.beta).toBeLessThanOrEqual(0.03);

      const heavy = experienceRoutingAudit.perCandidate['froad-heavy'];
      const shelter = experienceRoutingAudit.perCandidate['shelter-first'];
      expect(heavy).toBeDefined();
      expect(shelter).toBeDefined();
      expect(heavy!.generalizedCost).toBeGreaterThan(shelter!.generalizedCost);
      expect(heavy!.frictionScore).toBeGreaterThan(shelter!.frictionScore);

      expect(cgus.rankedCandidates[0]?.candidate.id).toBe('shelter-first');
    });
  });

  describe('Anchor 2 — The Replan (局部恢复与重算)', () => {
    const replan = runGoldenPathReplanPhase(7);

    it('freezes days before anchor and after forward cone', () => {
      expect(replan.scope.anchorDayIndex).toBe(2);
      expect(replan.scope.frozenDayIndices).toEqual(expect.arrayContaining([0, 1]));
      expect(replan.scope.frozenDayIndices).toEqual(expect.arrayContaining([4, 5, 6]));
    });

    it('keeps invalidated replan window strictly on days [2, 3]', () => {
      expect(replan.scope.replanDayRange).toEqual({ from: 2, to: 3 });
    });

    it('meets partial replan SLA (< 500ms estimated)', () => {
      expect(replan.scope.estimatedLatencyMs).toBeLessThan(500);
    });

    it('accepts refinement_signal REPLACEMENT on the route_and_run request', () => {
      expect(replan.request.options?.refinement_signal?.type).toBe('REPLACEMENT');
      expect(replan.request.options?.itinerary_context?.is_replan).toBe(true);
      expect(replan.delta.op).toBe('REPLACE');
      expect(replan.delta.target.dayIndex).toBe(2);
    });
  });

  describe('Anchor 3 — The Delivery (语义交割)', () => {
    const incident = runGoldenPathIncidentPhase(metaPolicy);
    const delivery = runGoldenPathDeliveryPhase(incident);

    it('writes experience_flow.narrativeTone to decision log metadata', () => {
      expect(delivery.logMetadata.experience_flow?.narrativeTone).toBe('empathetic_reassurance');
      expect(delivery.logMetadata.experience_flow?.tempo).toBe('EMPATHY_RECOVERY');
    });

    it('Narrator voice stays empathetic under storm frustration circuit', () => {
      expect(delivery.narratorVoiceTone).toBe('empathetic_reassurance');
    });

    it('SSE phase progress payloads include Canvas render hints (Glow Stream contract)', () => {
      const phases = delivery.ssePayloads;
      expect(phases.length).toBeGreaterThanOrEqual(4);

      const research = phases.find((p) => p.current_phase === 'RESEARCH');
      expect(research?.canvas_render?.glow_stream_active).toBe(true);
      expect(research?.canvas_render?.active_layers).toContain(WORLD_UI_LAYER_MAP);

      const narrate = phases.find((p) => p.current_phase === 'NARRATE');
      expect(narrate?.canvas_render?.active_layers).toContain(WORLD_UI_LAYER_NARRATIVE);

      const done = phases.find((p) => p.current_phase === 'DONE');
      expect(done?.type).toBe('RESULT');
      expect(done?.canvas_render?.active_layers).toContain(WORLD_UI_LAYER_DIFF_STREAM);
      expect(done?.canvas_render?.glow_stream_active).toBe(false);
    });

    it('full three-anchor pipeline completes without regression flags', () => {
      const replan = runGoldenPathReplanPhase(7);
      expect(incident.experienceFlow.tempo).toBe('EMPATHY_RECOVERY');
      expect(replan.scope.estimatedLatencyMs).toBeLessThan(500);
      expect(delivery.logMetadata.narrative_track).toBe('EMPATHY_RECOVERY');
    });

    it('projects emotional_context for BFF with storm frustration circuit', () => {
      const audit = runGoldenPathEmotionalDeliveryAudit(incident);
      expect(audit.clientProjection.schemaVersion).toBe('tripnara.emotional_context.client@v1');
      expect(audit.emotionalContext.anxietyTriggered).toBe(true);
      expect(audit.clientProjection.ambienceSignals.weatherWindLockActive).toBe(true);
      expect(audit.clientProjection.proactivityGate).toBe('ACTIVE');
    });

    it('emits anchoring presence block under storm anxiety (精神主心骨)', () => {
      const audit = runGoldenPathEmotionalDeliveryAudit(incident);
      expect(audit.anchoringBlock).toContain('别慌，有我在');
      expect(audit.anchoringBlock).toContain('做三件事');
      expect(audit.anchoringBlock).toContain('风暴/强风约束');
    });
  });
});
