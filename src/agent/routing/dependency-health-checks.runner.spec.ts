import { registerDependencyHealthChecks } from './dependency-health-checks.runner';
import type { DependencyHealthChecksHost } from './dependency-health-checks.host';

describe('dependency-health-checks.runner', () => {
  it('no-ops when dependencyHealthCheck is missing', () => {
    const host: DependencyHealthChecksHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    };
    registerDependencyHealthChecks(host);
    expect(host.logger.debug).toHaveBeenCalled();
    expect(host.logger.log).not.toHaveBeenCalled();
  });

  it('registers checks for injected agents', () => {
    const registerDependencies = jest.fn();
    const host: DependencyHealthChecksHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      dependencyHealthCheck: { registerDependencies } as any,
      plannerAgent: {},
      geoAgent: {},
    };
    registerDependencyHealthChecks(host);
    expect(registerDependencies).toHaveBeenCalled();
    const checks = registerDependencies.mock.calls[0][0] as Array<{ name: string }>;
    expect(checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['planner_agent', 'geo_agent']),
    );
    expect(host.logger.log).toHaveBeenCalled();
  });
});
