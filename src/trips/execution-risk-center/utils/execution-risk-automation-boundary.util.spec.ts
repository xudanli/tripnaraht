import { ForbiddenException } from '@nestjs/common';
import {
  ActionAutomationClass,
  assertHarnessAutomationBoundary,
  buildAutomationBoundaryLedgerPayload,
  classifyActionCode,
  formatEmergencyGuidanceDescription,
  guardAutoExternalTransaction,
} from './execution-risk-automation-boundary.util';

describe('execution-risk-automation-boundary.util (AC-014)', () => {
  it('classifies hotel booking actions as EXTERNAL_TRANSACTION', () => {
    expect(classifyActionCode('CALL_HOTEL_LATE_ARRIVAL').actionClass).toBe(
      ActionAutomationClass.EXTERNAL_TRANSACTION,
    );
    expect(classifyActionCode('BOOK_ARROWTOWN_MOTEL').actionClass).toBe(
      ActionAutomationClass.EXTERNAL_TRANSACTION,
    );
  });

  it('classifies evacuation actions as EMERGENCY_GUIDANCE with safe wording', () => {
    const classified = classifyActionCode('IMMEDIATE_EVACUATION');
    expect(classified.actionClass).toBe(ActionAutomationClass.EMERGENCY_GUIDANCE);
    expect(classified.guidanceDescription).toMatch(/^Recommended:/);
    expect(formatEmergencyGuidanceDescription('Drive to nearest hospital')).toMatch(
      /^Recommended:/,
    );
  });

  it('blocks auto external transaction execution without confirmation', () => {
    expect(() =>
      guardAutoExternalTransaction({
        actionCodes: ['CALL_HOTEL_LATE_ARRIVAL'],
        userConfirmed: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('blocks external transactions when autoSwitch is true', () => {
    expect(() =>
      guardAutoExternalTransaction({
        actionCodes: ['BOOK_ARROWTOWN_MOTEL'],
        userConfirmed: true,
        autoSwitch: true,
      }),
    ).toThrow(ForbiddenException);
  });

  it('records ledger payload with transactionType and userConfirmed', () => {
    const payload = buildAutomationBoundaryLedgerPayload({
      actionCodes: ['CALL_HOTEL_LATE_ARRIVAL', 'IMMEDIATE_EVACUATION'],
      userConfirmed: true,
    });
    expect(payload.externalTransactions).toEqual([
      expect.objectContaining({
        actionCode: 'CALL_HOTEL_LATE_ARRIVAL',
        transactionType: 'EXTERNAL_TRANSACTION',
        userConfirmed: true,
      }),
    ]);
    expect(payload.emergencyGuidance).toEqual([
      expect.objectContaining({
        actionCode: 'IMMEDIATE_EVACUATION',
        actionClass: ActionAutomationClass.EMERGENCY_GUIDANCE,
      }),
    ]);
  });

  it('validates SH-SCHED-003 and SH-ENV-005 harness plans', () => {
    expect(
      assertHarnessAutomationBoundary('SH-SCHED-003', [
        {
          planType: 'RECOMMENDED',
          actionCodes: ['CALL_HOTEL_LATE_ARRIVAL', 'DRIVE_SAFELY_NO_RUSH'],
        },
      ]),
    ).toEqual([]);
    expect(
      assertHarnessAutomationBoundary('SH-ENV-005', [
        {
          planType: 'CONSERVATIVE',
          actionCodes: ['IMMEDIATE_EVACUATION', 'DRIVE_TO_REYKJAVIK'],
        },
      ]),
    ).toEqual([]);
  });
});
