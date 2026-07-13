#!/usr/bin/env npx tsx
/**
 * Validate Execution Risk knowledge package + contract schema integrity.
 *
 * Usage:
 *   npm run validate:execution-risk-knowledge
 */

import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadExecutionRiskKnowledgeFromPackage, loadPackageCapabilityRows, loadPackageSeverityRuleRows } from '../src/trips/execution-risk-center/knowledge/execution-risk-knowledge.loader';

const PACKAGE_ROOT = join(process.cwd(), 'docs/TripNARA-Execution-Risk-Backend-Package-V1');
const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function main(): void {
  const snapshot = loadExecutionRiskKnowledgeFromPackage();
  const capabilities = loadPackageCapabilityRows();
  const severityRules = loadPackageSeverityRuleRows();
  const definitionCodes = new Set(snapshot.definitions.map((d) => d.knowledgeCode));

  if (snapshot.definitions.length !== 104) {
    fail(`Expected 104 definitions, got ${snapshot.definitions.length}`);
  }
  if (capabilities.length !== 104) {
    fail(`Expected 104 capability rows, got ${capabilities.length}`);
  }

  for (const capability of capabilities) {
    if (!definitionCodes.has(capability.knowledgeCode)) {
      fail(`Capability references unknown knowledgeCode ${capability.knowledgeCode}`);
    }
    for (const ruleId of capability.severityRuleIds ?? []) {
      if (!severityRules.some((rule) => rule.ruleId === ruleId)) {
        fail(`Capability ${capability.knowledgeCode} references missing severity rule ${ruleId}`);
      }
    }
  }

  for (const rule of severityRules) {
    if (!definitionCodes.has(rule.knowledgeCode)) {
      fail(`Severity rule ${rule.ruleId} references unknown knowledgeCode ${rule.knowledgeCode}`);
    }
  }

  const schemaPath = join(PACKAGE_ROOT, '03_CONTRACTS/execution-risk-contracts-v1.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateEnum = ajv.compile(schema.$defs.AdjustmentItemType);
  for (const cardType of [
    'SAFETY_INTERVENTION',
    'DYNAMIC_REPLAN',
    'TEAM_COORDINATION',
    'EXECUTION_PREPARATION',
  ]) {
    if (!validateEnum(cardType)) {
      fail(`Schema rejected AdjustmentItemType ${cardType}`);
    }
  }

  const deprecated = [
    'ROUTE_ADJUSTMENT',
    'SCHEDULE_ADJUSTMENT',
    'ACTIVITY_CHANGE',
    'BOOKING_CHANGE',
    'TEAM_ADJUSTMENT',
    'RESOURCE_ACTION',
  ];
  for (const cardType of deprecated) {
    if (validateEnum(cardType)) {
      fail(`Schema still accepts deprecated AdjustmentItemType ${cardType}`);
    }
  }

  const wind = snapshot.definitions.find((d) => d.knowledgeCode === 'ENV-WIND-01');
  if (!wind) fail('Missing ENV-WIND-01 definition in loader snapshot');

  const windRules = snapshot.severityRulesByCode.get('ENV-WIND-01') ?? [];
  if (windRules.length < 5) {
    fail(`ENV-WIND-01 expected multiple severity rules, got ${windRules.length}`);
  }

  const windChains = snapshot.causalChainsByCode.get('ENV-WIND-01') ?? [];
  if (windChains.length < 1) {
    fail('ENV-WIND-01 expected at least one causal chain');
  }

  const action = snapshot.actionsByCode.get('ACT-TIME-EARLIER');
  if (!action) fail('Missing intervention action ACT-TIME-EARLIER');

  if (failures.length) {
    console.error('Execution risk knowledge validation FAILED:\n' + failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        pass: true,
        definitions: snapshot.definitions.length,
        severityRules: [...snapshot.severityRulesByCode.values()].reduce((n, r) => n + r.length, 0),
        interventionActions: snapshot.actionsByCode.size,
        capabilities: capabilities.length,
      },
      null,
      2,
    ),
  );
}

main();
