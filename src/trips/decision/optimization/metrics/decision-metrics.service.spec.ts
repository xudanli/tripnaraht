import { DecisionMetricsService } from './decision-metrics.service';

describe('DecisionMetricsService', () => {
  let service: DecisionMetricsService;

  beforeEach(() => {
    service = new DecisionMetricsService();
  });

  describe('recordDecisionLatency', () => {
    it('should record latency histogram', () => {
      service.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');
      service.recordDecisionLatency(1.2, 'PLAN_GEN', 'success');
      service.recordDecisionLatency(3.0, 'OPTIMIZE', 'failure');

      const summary = service.getSummary();
      expect(summary).toBeDefined();
    });

    it('should include latency in Prometheus format', () => {
      service.recordDecisionLatency(0.1, 'INTAKE', 'success');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_decision_latency_seconds');
    });
  });

  describe('recordUtilityScore', () => {
    it('should record utility scores', () => {
      service.recordUtilityScore(0.85, 'travel_plan');
      service.recordUtilityScore(0.72, 'travel_plan');
      service.recordUtilityScore(0.91, 'budget_optimize');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_utility_score');
    });
  });

  describe('incrementConstraintViolation', () => {
    it('should increment constraint violation counter', () => {
      service.incrementConstraintViolation('TIME_BUDGET', 'hard');
      service.incrementConstraintViolation('TIME_BUDGET', 'hard');
      service.incrementConstraintViolation('DISTANCE', 'soft');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_constraint_violations_total');
    });
  });

  describe('setCumulativeRegret', () => {
    it('should set cumulative regret gauge', () => {
      service.setCumulativeRegret('user-1', 0.05);
      service.setCumulativeRegret('user-2', 0.12);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_cumulative_regret');
    });

    it('should update existing user regret', () => {
      service.setCumulativeRegret('user-1', 0.05);
      service.setCumulativeRegret('user-1', 0.08);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('0.08');
    });
  });

  describe('incrementLearningUpdate', () => {
    it('should count learning updates', () => {
      service.incrementLearningUpdate('GRADIENT_DESCENT');
      service.incrementLearningUpdate('GRADIENT_DESCENT');
      service.incrementLearningUpdate('BAYESIAN');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_learning_updates_total');
    });
  });

  describe('setConvergenceStatus', () => {
    it('should set convergence status', () => {
      service.setConvergenceStatus('user-1', 'LEARNING');
      service.setConvergenceStatus('user-1', 'CONVERGING');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_convergence_status');
    });
  });

  describe('recordStateTransition', () => {
    it('should count state transitions', () => {
      service.recordStateTransition('INTAKE', 'RESEARCH');
      service.recordStateTransition('RESEARCH', 'PLAN_GEN');
      service.recordStateTransition('PLAN_GEN', 'OPTIMIZE');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_state_transitions_total');
    });
  });

  describe('setDSOVersion', () => {
    it('should track DSO versions', () => {
      service.setDSOVersion('req-1', 1);
      service.setDSOVersion('req-1', 2);
      service.setDSOVersion('req-1', 3);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_dso_version');
    });
  });

  describe('recordLockWaitTime', () => {
    it('should record lock wait histogram', () => {
      service.recordLockWaitTime('DSO_UPDATE', 0.02);
      service.recordLockWaitTime('DSO_UPDATE', 0.05);
      service.recordLockWaitTime('WEIGHT_PERSIST', 0.01);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_lock_wait_seconds');
    });
  });

  describe('recordLockHoldTime', () => {
    it('should record lock hold histogram', () => {
      service.recordLockHoldTime('DSO_UPDATE', 0.1);
      service.recordLockHoldTime('WEIGHT_PERSIST', 0.05);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_lock_hold_seconds');
    });
  });

  describe('recordMonteCarloSamples', () => {
    it('should record sample counts', () => {
      service.recordMonteCarloSamples('EXPECTED_UTILITY', 1000);
      service.recordMonteCarloSamples('IMPORTANCE_SAMPLING', 500);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_monte_carlo_samples');
    });
  });

  describe('setEffectiveSampleSize', () => {
    it('should track ESS', () => {
      service.setEffectiveSampleSize('req-1', 850);
      service.setEffectiveSampleSize('req-2', 920);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_effective_sample_size');
    });
  });

  describe('incrementCGUSIteration', () => {
    it('should count CGUS iterations', () => {
      service.incrementCGUSIteration('converged');
      service.incrementCGUSIteration('converged');
      service.incrementCGUSIteration('max_iterations');

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_cgus_iterations_total');
    });
  });

  describe('setPolicyEntropy', () => {
    it('should track policy entropy', () => {
      service.setPolicyEntropy('6_actions', 1.5);
      service.setPolicyEntropy('6_actions', 1.2);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_policy_entropy');
    });
  });

  describe('setLyapunovValue', () => {
    it('should track Lyapunov values', () => {
      service.setLyapunovValue('req-1', 0.8);
      service.setLyapunovValue('req-1', 0.5);
      service.setLyapunovValue('req-1', 0.2);

      const prometheus = service.exportPrometheusFormat();
      expect(prometheus).toContain('decision_os_lyapunov_value');
    });
  });

  describe('exportPrometheusFormat', () => {
    it('should produce valid Prometheus text format', () => {
      service.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');
      service.incrementConstraintViolation('TIME_BUDGET', 'hard');
      service.setCumulativeRegret('user-1', 0.05);

      const output = service.exportPrometheusFormat();

      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
      expect(output).toMatch(/decision_os_\w+/);
    });

    it('should format labels correctly', () => {
      service.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');

      const output = service.exportPrometheusFormat();
      expect(output).toMatch(/phase="PLAN_GEN"/);
      expect(output).toMatch(/outcome="success"/);
    });
  });

  describe('getSummary', () => {
    it('should return JSON summary', () => {
      service.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');
      service.incrementConstraintViolation('TIME_BUDGET', 'hard');

      const summary = service.getSummary();

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('object');
    });
  });

  describe('metric aggregation', () => {
    it('should correctly aggregate multiple observations', () => {
      const latencies = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0, 5.0];
      
      for (const lat of latencies) {
        service.recordDecisionLatency(lat, 'TEST', 'success');
      }

      const prometheus = service.exportPrometheusFormat();
      
      expect(prometheus).toContain('_count');
      expect(prometheus).toContain('_sum');
      expect(prometheus).toContain('_bucket');
    });
  });
});
