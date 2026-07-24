import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from './ortools-solver.config';

describe('ortools-solver.config', () => {
  const prevUrl = process.env.OR_TOOLS_SOLVER_URL;
  const prevShadow = process.env.OR_TOOLS_REPAIR_SHADOW;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.OR_TOOLS_SOLVER_URL;
    else process.env.OR_TOOLS_SOLVER_URL = prevUrl;
    if (prevShadow === undefined) delete process.env.OR_TOOLS_REPAIR_SHADOW;
    else process.env.OR_TOOLS_REPAIR_SHADOW = prevShadow;
  });

  it('strips trailing slash from URL', () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091/';
    expect(resolveOrToolsSolverBaseUrl()).toBe('http://127.0.0.1:8091');
  });

  it('defaults shadow on when URL set', () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    delete process.env.OR_TOOLS_REPAIR_SHADOW;
    expect(isOrToolsRepairShadowEnabled()).toBe(true);
  });

  it('allows explicit shadow off', () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '0';
    expect(isOrToolsRepairShadowEnabled()).toBe(false);
  });
});
