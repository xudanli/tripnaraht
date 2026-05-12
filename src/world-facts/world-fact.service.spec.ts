import { WorldFactService } from './world-fact.service';
import { WorldFactRepository } from './world-fact.repository';

describe('WorldFactService', () => {
  it('append links supersedes to previous same factKey', async () => {
    const repo = {
      findLatestIdByFactKey: jest.fn().mockResolvedValueOnce('prev-1').mockResolvedValue('prev-2'),
      append: jest.fn().mockImplementation(async (input: any) => ({
        id: 'new-id',
        ...input,
      })),
    } as unknown as WorldFactRepository;

    const svc = new WorldFactService(repo);

    await svc.append({
      factKey: 'country:IS:aggregated_wind_mps',
      subjectType: 'country',
      subjectId: 'IS',
      predicate: 'aggregated_wind_mps',
      valueJson: { mps: 12 },
      sourceType: 'test',
    });

    expect(repo.findLatestIdByFactKey).toHaveBeenCalledWith('country:IS:aggregated_wind_mps');
    expect(repo.append).toHaveBeenCalledWith(
      expect.objectContaining({
        factKey: 'country:IS:aggregated_wind_mps',
        supersedesFactId: 'prev-1',
      }),
    );
  });
});
