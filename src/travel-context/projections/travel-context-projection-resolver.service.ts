import { Injectable } from '@nestjs/common';
import type { TravelContextViewName, TravelContextDomain } from '../domain/travel-context.constants';
import type { TravelContextSnapshot, TravelContextViewEnvelope } from '../domain/travel-context.types';
import { projectExplorationView } from './exploration.projection';
import { projectOverviewView } from './overview.projection';
import { projectDecisionsView } from './decisions.projection';
import {
  projectAssistantView,
  projectFeasibilityView,
  projectMonitoringView,
  projectParticipantsView,
  projectPlanView,
} from './view-projections.util';

@Injectable()
export class TravelContextProjectionResolverService {
  resolve<T = Record<string, unknown>>(
    snapshot: TravelContextSnapshot,
    view: TravelContextViewName,
  ): TravelContextViewEnvelope<T> {
    const data = this.projectData(snapshot, view) as T;

    return {
      contextId: snapshot.identity.contextId,
      snapshotId: snapshot.meta.snapshotId,
      revision: snapshot.meta.revision,
      view,
      data,
      observability: {
        schemaVersion: 'travel-context-v1',
        changedDomains: this.inferChangedDomainsForView(view),
      },
    };
  }

  resolveAll(snapshot: TravelContextSnapshot): TravelContextViewEnvelope[] {
    const views: TravelContextViewName[] = [
      'overview',
      'exploration',
      'plan',
      'decisions',
      'monitoring',
      'participants',
      'feasibility',
      'assistant',
    ];
    return views.map((view) => this.resolve(snapshot, view));
  }

  private projectData(
    snapshot: TravelContextSnapshot,
    view: TravelContextViewName,
  ): Record<string, unknown> {
    switch (view) {
      case 'overview':
        return projectOverviewView(snapshot);
      case 'exploration':
        return projectExplorationView(snapshot);
      case 'plan':
        return projectPlanView(snapshot);
      case 'decisions':
        return projectDecisionsView(snapshot);
      case 'monitoring':
        return projectMonitoringView(snapshot);
      case 'participants':
        return projectParticipantsView(snapshot);
      case 'feasibility':
        return projectFeasibilityView(snapshot);
      case 'assistant':
        return projectAssistantView(snapshot);
      default:
        return projectOverviewView(snapshot);
    }
  }

  private inferChangedDomainsForView(view: TravelContextViewName): TravelContextDomain[] {
    switch (view) {
      case 'exploration':
        return ['intent', 'plan', 'history'];
      case 'decisions':
        return ['decisions'];
      case 'monitoring':
        return ['monitoring'];
      case 'plan':
        return ['plan', 'contract'];
      case 'participants':
        return ['participants'];
      case 'feasibility':
        return ['intent', 'contract', 'plan', 'world'];
      case 'assistant':
        return ['intent', 'decisions', 'monitoring', 'plan'];
      case 'overview':
      default:
        return ['intent', 'plan', 'decisions', 'monitoring'];
    }
  }
}
