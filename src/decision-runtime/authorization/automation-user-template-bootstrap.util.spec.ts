import { bootstrapTripMetadataWithUserAutomationTemplate } from './automation-user-template-bootstrap.util';
import { USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID } from './automation-authorization.types';

describe('bootstrapTripMetadataWithUserAutomationTemplate', () => {
  it('merges user template into empty metadata', () => {
    const result = bootstrapTripMetadataWithUserAutomationTemplate({}, {
      schemaId: USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
      updatedAt: '2026-07-04T00:00:00.000Z',
      automationPaused: true,
      automation: {
        defaultLevel: 'AUTO_REPAIR_LOW_RISK',
        autoAllowed: [],
        confirmationRequired: [],
        actionOverrides: { 'activity.trim_optional_items': 'AUTO' },
      },
    });

    const contract = (result.travelDecisionContract ?? {}) as Record<string, unknown>;
    expect(contract.automationScope).toBe('USER_TEMPLATE');
    expect(contract.automationPaused).toBe(true);
    expect((contract.automation as Record<string, unknown>).defaultLevel).toBe('AUTO_REPAIR_LOW_RISK');
  });

  it('skips when trip already has TRIP-scoped overrides', () => {
    const metadata = {
      travelDecisionContract: {
        automationScope: 'TRIP',
        automation: { actionOverrides: { 'time_route.update_eta': 'ASK' } },
      },
    };

    const result = bootstrapTripMetadataWithUserAutomationTemplate(metadata, {
      schemaId: USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
      updatedAt: '2026-07-04T00:00:00.000Z',
      automation: { defaultLevel: 'SUGGEST', autoAllowed: [], confirmationRequired: [] },
    });

    expect(result).toBe(metadata);
  });
});
