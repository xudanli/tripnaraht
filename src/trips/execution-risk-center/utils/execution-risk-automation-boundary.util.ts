import { ForbiddenException } from '@nestjs/common';
import {
  AutomationCapability,
  ExecutionMode,
  type InterventionAction,
} from '../../../generated/execution-risk-contracts';
import type { PackageHarnessExpectedPlan } from '../harness/package-harness.types';

export enum ActionAutomationClass {
  AUTOMATABLE = 'AUTOMATABLE',
  EXTERNAL_TRANSACTION = 'EXTERNAL_TRANSACTION',
  EMERGENCY_GUIDANCE = 'EMERGENCY_GUIDANCE',
}

export interface ClassifiedPlanAction {
  actionCode: string;
  actionClass: ActionAutomationClass;
  requiresUserConfirmation: boolean;
  guidanceDescription?: string;
}

const EXTERNAL_TRANSACTION_PATTERNS = [
  /^CALL_HOTEL/i,
  /^BOOK_/i,
  /^REBOOK_/i,
  /^CANCEL_REMAINING_ITINERARY/i,
  /^NOTIFY_.*HOTEL/i,
  /^CONFIRM_CREDIT/i,
  /^CONTACT_PROVIDER/i,
];

const EMERGENCY_GUIDANCE_PATTERNS = [
  /^EVACUATE/i,
  /^IMMEDIATE_EVACUATION/i,
  /^SHELTER_/i,
  /^SEEK_MEDICAL/i,
  /^DRIVE_TO_REYKJAVIK/i,
  /^CONTACT_EMERGENCY/i,
];

const COMPLETION_CLAIM_PATTERNS = [
  /\bcompleted\b/i,
  /\bexecuted\b/i,
  /\bdone\b/i,
  /已完成/,
  /已执行/,
];

export function classifyActionCode(
  actionCode: string,
  action?: InterventionAction,
): ClassifiedPlanAction {
  if (action) {
    if (
      action.executionMode === ExecutionMode.EMERGENCY_GUIDANCE ||
      action.actionCategory === 'EMERGENCY'
    ) {
      return {
        actionCode,
        actionClass: ActionAutomationClass.EMERGENCY_GUIDANCE,
        requiresUserConfirmation: true,
        guidanceDescription: formatEmergencyGuidanceDescription(action.name, action.description),
      };
    }
    if (
      action.capabilities.includes(AutomationCapability.EXTERNAL_TRANSACTION) ||
      action.userConfirmRequired
    ) {
      return {
        actionCode,
        actionClass: ActionAutomationClass.EXTERNAL_TRANSACTION,
        requiresUserConfirmation: true,
      };
    }
  }

  if (EMERGENCY_GUIDANCE_PATTERNS.some((re) => re.test(actionCode))) {
    return {
      actionCode,
      actionClass: ActionAutomationClass.EMERGENCY_GUIDANCE,
      requiresUserConfirmation: true,
      guidanceDescription: formatEmergencyGuidanceDescription(actionCode),
    };
  }

  if (EXTERNAL_TRANSACTION_PATTERNS.some((re) => re.test(actionCode))) {
    return {
      actionCode,
      actionClass: ActionAutomationClass.EXTERNAL_TRANSACTION,
      requiresUserConfirmation: true,
    };
  }

  return {
    actionCode,
    actionClass: ActionAutomationClass.AUTOMATABLE,
    requiresUserConfirmation: false,
  };
}

export function classifyPlanActions(
  actionCodes: string[],
  actionsByCode?: Map<string, InterventionAction>,
): ClassifiedPlanAction[] {
  return actionCodes.map((code) => classifyActionCode(code, actionsByCode?.get(code)));
}

export function formatEmergencyGuidanceDescription(label: string, detail?: string): string {
  const base = detail?.trim() || label.replace(/_/g, ' ').toLowerCase();
  if (/^(you should|recommended|建议|请立即)/i.test(base)) return base;
  return `Recommended: ${base}`;
}

export function assertHarnessAutomationBoundary(
  scenarioId: string,
  plans: PackageHarnessExpectedPlan[] | undefined,
): string[] {
  if (!plans?.length) return [];
  const failures: string[] = [];

  for (const plan of plans) {
    for (const code of plan.actionCodes) {
      const classified = classifyActionCode(code);
      if (classified.actionClass === ActionAutomationClass.EMERGENCY_GUIDANCE) {
        const desc = classified.guidanceDescription ?? '';
        if (COMPLETION_CLAIM_PATTERNS.some((re) => re.test(desc))) {
          failures.push(
            `${scenarioId}: EMERGENCY_GUIDANCE action ${code} must not claim completion`,
          );
        }
        if (!/^(you should|recommended|建议|请立即)/i.test(desc)) {
          failures.push(
            `${scenarioId}: EMERGENCY_GUIDANCE action ${code} must use guidance language`,
          );
        }
      }
      if (classified.actionClass === ActionAutomationClass.EXTERNAL_TRANSACTION) {
        if (!classified.requiresUserConfirmation) {
          failures.push(
            `${scenarioId}: EXTERNAL_TRANSACTION action ${code} must require user confirmation`,
          );
        }
      }
    }
  }

  return failures;
}

export function guardAutoExternalTransaction(input: {
  actionCodes: string[];
  actionsByCode?: Map<string, InterventionAction>;
  userConfirmed: boolean;
  autoSwitch?: boolean;
}): void {
  const external = classifyPlanActions(input.actionCodes, input.actionsByCode).filter(
    (a) => a.actionClass === ActionAutomationClass.EXTERNAL_TRANSACTION,
  );
  if (external.length === 0) return;

  if (input.autoSwitch === true) {
    throw new ForbiddenException({
      code: 'CONFIRMATION_REQUIRED',
      message: 'EXTERNAL_TRANSACTION actions cannot auto-execute even when autoSwitch is true',
      transactionType: 'EXTERNAL_TRANSACTION',
      actionCodes: external.map((a) => a.actionCode),
      userConfirmed: input.userConfirmed,
    });
  }

  if (!input.userConfirmed) {
    throw new ForbiddenException({
      code: 'CONFIRMATION_REQUIRED',
      message: 'EXTERNAL_TRANSACTION actions require explicit user confirmation',
      transactionType: 'EXTERNAL_TRANSACTION',
      actionCodes: external.map((a) => a.actionCode),
      userConfirmed: input.userConfirmed,
    });
  }
}

export function buildAutomationBoundaryLedgerPayload(input: {
  actionCodes: string[];
  actionsByCode?: Map<string, InterventionAction>;
  userConfirmed: boolean;
}): Record<string, unknown> {
  const classified = classifyPlanActions(input.actionCodes, input.actionsByCode);
  return {
    externalTransactions: classified
      .filter((a) => a.actionClass === ActionAutomationClass.EXTERNAL_TRANSACTION)
      .map((a) => ({
        actionCode: a.actionCode,
        transactionType: 'EXTERNAL_TRANSACTION',
        userConfirmed: input.userConfirmed,
      })),
    emergencyGuidance: classified
      .filter((a) => a.actionClass === ActionAutomationClass.EMERGENCY_GUIDANCE)
      .map((a) => ({
        actionCode: a.actionCode,
        actionClass: ActionAutomationClass.EMERGENCY_GUIDANCE,
        guidanceDescription: a.guidanceDescription,
        acknowledged: input.userConfirmed,
      })),
  };
}
