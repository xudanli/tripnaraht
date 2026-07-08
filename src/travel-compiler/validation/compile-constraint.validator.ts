import { randomUUID } from 'crypto';
import type { CompileIssue } from '../contracts/compilation-result.types';
import type { CanonicalTravelGraph } from '../contracts/canonical-travel-graph.types';
import { resolveIcelandPoiRule } from '../rules/iceland-travel-link.rules';

export type CompileConstraintValidation = {
  warnings: CompileIssue[];
  errors: CompileIssue[];
  constraintsSatisfied: number;
  constraintsTotal: number;
};

/**
 * Compile-time constraint checks (read-only, no Decision Runtime execute).
 * Maps destination-pack style rules onto the Canonical Travel Graph.
 */
export function validateCompileConstraints(
  graph: CanonicalTravelGraph,
  countryCode: string,
): CompileConstraintValidation {
  const warnings: CompileIssue[] = [];
  const errors: CompileIssue[] = [];
  let constraintsSatisfied = 0;
  let constraintsTotal = graph.constraints.length;

  if (countryCode.toUpperCase() === 'IS') {
    for (const node of graph.nodes) {
      if (node.kind !== 'POI') continue;
      const poiId = node.canonical?.poiId;
      const rule = resolveIcelandPoiRule(poiId);
      if (!rule) continue;

      if (rule.requiresFRoad) {
        constraintsTotal += 1;
        warnings.push({
          issueId: randomUUID(),
          severity: 'warning',
          phase: 'VALIDATION',
          code: 'IS_F_ROAD_REQUIRED',
          message: rule.constraintMessage ?? `F-road may be required for ${node.label}`,
          dayIndex: node.dayIndex,
          nodeId: node.nodeId,
        });
      }

      if (rule.requiresBooking) {
        constraintsTotal += 1;
        const booking = graph.bookings.find((b) => b.linkedNodeId === node.nodeId);
        if (booking && booking.status !== 'booked') {
          warnings.push({
            issueId: randomUUID(),
            severity: 'warning',
            phase: 'VALIDATION',
            code: 'BOOKING_REQUIRED',
            message: `Booking required for ${node.label}`,
            dayIndex: node.dayIndex,
            nodeId: node.nodeId,
          });
        } else if (booking?.status === 'booked') {
          constraintsSatisfied += 1;
        }
      }
    }
  }

  for (const dep of graph.dependencies) {
    constraintsTotal += 1;
    if (dep.satisfied) {
      constraintsSatisfied += 1;
    } else if (dep.kind === 'REQUIRES_F_ROAD') {
      warnings.push({
        issueId: randomUUID(),
        severity: 'warning',
        phase: 'VALIDATION',
        code: 'DEPENDENCY_F_ROAD',
        message: `F-road dependency unsatisfied for node ${dep.subjectNodeId}`,
        nodeId: dep.subjectNodeId,
      });
    } else if (dep.kind === 'REQUIRES_BOOKING') {
      warnings.push({
        issueId: randomUUID(),
        severity: 'warning',
        phase: 'VALIDATION',
        code: 'DEPENDENCY_BOOKING',
        message: `Booking dependency unsatisfied for node ${dep.subjectNodeId}`,
        nodeId: dep.subjectNodeId,
      });
    }
  }

  for (const c of graph.constraints) {
    if (c.severity === 'hard') {
      warnings.push({
        issueId: randomUUID(),
        severity: 'warning',
        phase: 'VALIDATION',
        code: c.code,
        message: c.message,
        nodeId: c.affectedNodeIds?.[0],
      });
    } else {
      constraintsSatisfied += 1;
    }
  }

  return { warnings, errors, constraintsSatisfied, constraintsTotal };
}
