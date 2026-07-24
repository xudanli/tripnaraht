import { PlanningOverviewPageContextBuilder } from './planning-overview-page-context.builder';
import type { ClientPageState } from '../contracts/page-insight.types';

describe('PlanningOverviewPageContextBuilder', () => {
  const client: ClientPageState = {
    pageId: 'PLANNING_OVERVIEW',
    pageMode: 'PLANNING_OVERVIEW',
    insightScope: 'TRIP',
    lifecycle: 'PLANNING',
  };

  it('CONTEXT_MISSING without pageMode', async () => {
    const builder = new PlanningOverviewPageContextBuilder(
      { listProblems: jest.fn() } as never,
    );
    const built = await builder.build('t1', {
      ...client,
      pageMode: undefined,
      insightScope: undefined,
    });
    expect(built.gate.ok).toBe(false);
    expect(built.gate.missing).toEqual(
      expect.arrayContaining(['pageMode', 'insightScope']),
    );
  });

  it('CLEAR when queue empty', async () => {
    const gateway = {
      listProblems: jest.fn(async () => ({
        items: [],
        meta: { openCount: 0 },
      })),
    };
    const feasibility = {
      getReportFast: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
        issues: [],
        canStartExecute: true,
        gateExecute: { blocked: false, reasons: [] },
      })),
    };
    const builder = new PlanningOverviewPageContextBuilder(
      gateway as never,
      feasibility as never,
    );
    const built = await builder.build('t1', client);
    expect(built.gate.ok).toBe(true);
    expect(built.severity).toBe('CLEAR');
    expect(built.openProblemCount).toBe(0);
  });

  it('BLOCKING when must confirm present', async () => {
    const gateway = {
      listProblems: jest.fn(async () => ({
        meta: { openCount: 1 },
        items: [
          {
            problemId: 'dp1',
            workflowStatus: 'WAITING_DECISION',
            title: '确认车型',
            enforcement: 'BLOCK',
            decisionCase: {
              uiGroup: 'MUST_CONFIRM',
              requiredness: 'BLOCKING',
              domain: 'TRANSPORT',
            },
            scope: { tripId: 't1' },
            semanticKey: 'VEHICLE',
            dimension: 'ROUTE',
          },
        ],
      })),
    };
    const feasibility = {
      getReportFast: jest.fn(async () => ({
        summary: { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 },
        issues: [],
        canStartExecute: true,
        gateExecute: { blocked: false, reasons: [] },
      })),
    };
    const builder = new PlanningOverviewPageContextBuilder(
      gateway as never,
      feasibility as never,
    );
    const built = await builder.build('t1', client);
    expect(built.severity).toBe('BLOCKING');
    expect(built.mustConfirmCount).toBe(1);
    expect(built.topProblem?.problemId).toBe('dp1');
    expect(built.vehicleRelatedOpen).toBe(true);
  });
});
