import { RelaxationTripPersistService } from './relaxation-trip-persist.service';
import { ApplyRelaxationConstraintsService } from '../../trips/trip-constraint-solver/services/apply-relaxation-constraints.service';

describe('RelaxationTripPersistService', () => {
  it('filters writable action ids', () => {
    const svc = new RelaxationTripPersistService(undefined);
    expect(
      svc.resolvePersistableActionIds([
        { id: 'upgrade_vehicle_to_4wd' },
        { id: 'accept_no_solution' },
      ]),
    ).toEqual(['upgrade_vehicle_to_4wd']);
  });

  it('persists via ApplyRelaxationConstraintsService', async () => {
    const apply = {
      applyRelaxation: jest.fn().mockResolvedValue({
        constraintsVersion: 4,
        applied: [],
        summary: {},
        recalcRecommended: true,
      }),
    } as unknown as ApplyRelaxationConstraintsService;
    const svc = new RelaxationTripPersistService(apply);
    const result = await svc.persistFromIntake('trip-1', 'user-1', [
      { id: 'relax_budget_by_10pct' },
    ]);
    expect(result?.persisted).toBe(true);
    expect(result?.constraintsVersion).toBe(4);
    expect(apply.applyRelaxation).toHaveBeenCalledWith('trip-1', 'user-1', {
      actionIds: ['relax_budget_by_10pct'],
      source: 'clarification_submit',
    });
  });
});
