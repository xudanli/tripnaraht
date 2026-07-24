/**
 * Create / list Collab follow-up sub-tasks bound to a Decision Problem resolution.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DecisionCollaborativeSubTaskStoreService,
  type StoredDecisionCollaborativeSubTask,
} from '../persistence/decision-collaborative-subtask.store';
import { DecisionProblemResolutionStoreService } from '../persistence/decision-problem-resolution.store';
import type {
  CreateDecisionCollaborativeSubTaskRequest,
  CreateDecisionCollaborativeSubTaskResponse,
  DecisionCollaborativeSubTaskView,
  ListDecisionCollaborativeSubTasksResponse,
  UpdateDecisionCollaborativeSubTaskRequest,
  UpdateDecisionCollaborativeSubTaskResponse,
  DeleteDecisionCollaborativeSubTaskResponse,
} from '../contracts/unified-decision-ui.types';
import { buildSuggestedSubTasks } from '../utils/decision-collaborative-subtask-suggestions.util';
import { storedSubTaskToView } from '../utils/decision-collaborative-subtask-projection.util';
import { resolveCollaborativeSubTaskResolution } from '../utils/resolve-collaborative-subtask-resolution.util';

@Injectable()
export class DecisionCollaborativeSubTaskService {
  constructor(
    private readonly store: DecisionCollaborativeSubTaskStoreService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
  ) {}

  async createSubTask(
    tripId: string,
    problemId: string,
    userId: string,
    body: CreateDecisionCollaborativeSubTaskRequest,
  ): Promise<CreateDecisionCollaborativeSubTaskResponse> {
    const stored = await this.resolutionStore.getForProblem(tripId, problemId);
    const resolution = resolveCollaborativeSubTaskResolution(
      stored,
      problemId,
      body.resolutionId,
    );

    const storedSubTask = await this.store.create(tripId, {
      problemId,
      resolutionId: resolution.resolutionId,
      actionPlanId: resolution.actionPlanId,
      kind: body.kind ?? 'OTHER',
      title: body.title.trim(),
      description: body.description?.trim(),
      status: 'pending',
      assigneeUserId: body.assigneeUserId,
      problemTitle: body.problemTitle?.trim(),
      createdByUserId: userId,
    });

    return {
      schemaId: 'tripnara.decision_collaborative_subtask_create@v1',
      tripId,
      problemId,
      generatedAt: new Date().toISOString(),
      subTask: toSubTaskView(storedSubTask),
    };
  }

  async listSubTasks(
    tripId: string,
    problemId: string,
    resolutionId?: string,
  ): Promise<ListDecisionCollaborativeSubTasksResponse> {
    const storedResolution = await this.resolutionStore.getForProblem(tripId, problemId);
    const effectiveResolutionId = resolutionId?.trim()
      ? resolveCollaborativeSubTaskResolution(storedResolution, problemId, resolutionId)
          .resolutionId
      : storedResolution?.resolutionId;

    const items = effectiveResolutionId
      ? await this.store.listForResolution(tripId, effectiveResolutionId)
      : (await this.store.listForTrip(tripId)).filter((i) => i.problemId === problemId);

    return {
      schemaId: 'tripnara.decision_collaborative_subtasks@v1',
      tripId,
      problemId,
      generatedAt: new Date().toISOString(),
      items: items.map(toSubTaskView),
    };
  }

  async listSubTasksForTrip(tripId: string): Promise<DecisionCollaborativeSubTaskView[]> {
    return (await this.store.listForTrip(tripId)).map(toSubTaskView);
  }

  async updateSubTask(
    tripId: string,
    problemId: string,
    subTaskId: string,
    body: UpdateDecisionCollaborativeSubTaskRequest,
  ): Promise<UpdateDecisionCollaborativeSubTaskResponse> {
    const existing = await this.store.getById(tripId, subTaskId);
    if (!existing || existing.problemId !== problemId) {
      throw new NotFoundException(`COLLAB_SUBTASK_NOT_FOUND: ${subTaskId}`);
    }

    const updated = await this.store.update(tripId, subTaskId, {
      status: body.status,
      assigneeUserId: body.assigneeUserId,
      title: body.title,
      description: body.description,
    });

    if (!updated) {
      throw new NotFoundException(`COLLAB_SUBTASK_NOT_FOUND: ${subTaskId}`);
    }

    return {
      schemaId: 'tripnara.decision_collaborative_subtask_update@v1',
      tripId,
      problemId,
      generatedAt: new Date().toISOString(),
      subTask: toSubTaskView(updated),
    };
  }

  /** After apply: sync actionPlanId and seed default follow-ups when none exist. */
  async ensureSuggestedOnApply(input: {
    tripId: string;
    problemId: string;
    resolutionId: string;
    actionPlanId?: string;
    semanticKey?: string;
    problemTitle?: string;
    userId: string;
  }): Promise<DecisionCollaborativeSubTaskView[]> {
    if (input.actionPlanId) {
      await this.store.syncActionPlanIdForResolution(
        input.tripId,
        input.resolutionId,
        input.actionPlanId,
      );
    }

    const existing = await this.store.listForResolution(input.tripId, input.resolutionId);
    if (existing.length > 0) {
      return existing.map(toSubTaskView);
    }

    const suggestions = buildSuggestedSubTasks(input.semanticKey);
    const created: DecisionCollaborativeSubTaskView[] = [];

    for (const suggestion of suggestions) {
      const stored = await this.store.create(input.tripId, {
        problemId: input.problemId,
        resolutionId: input.resolutionId,
        actionPlanId: input.actionPlanId,
        kind: suggestion.kind,
        title: suggestion.title,
        description: suggestion.description,
        status: 'pending',
        problemTitle: input.problemTitle?.trim(),
        createdByUserId: input.userId,
      });
      created.push(toSubTaskView(stored));
    }

    return created;
  }

  previewSuggestedFollowUps(semanticKey?: string) {
    return buildSuggestedSubTasks(semanticKey);
  }

  async deleteSubTask(
    tripId: string,
    problemId: string,
    subTaskId: string,
  ): Promise<DeleteDecisionCollaborativeSubTaskResponse> {
    const existing = await this.store.getById(tripId, subTaskId);
    if (!existing || existing.problemId !== problemId) {
      throw new NotFoundException(`COLLAB_SUBTASK_NOT_FOUND: ${subTaskId}`);
    }

    const deleted = await this.store.remove(tripId, subTaskId);
    if (!deleted) {
      throw new NotFoundException(`COLLAB_SUBTASK_NOT_FOUND: ${subTaskId}`);
    }

    return {
      schemaId: 'tripnara.decision_collaborative_subtask_delete@v1',
      tripId,
      problemId,
      subTaskId,
      generatedAt: new Date().toISOString(),
      deleted: true,
    };
  }
}

function toSubTaskView(stored: StoredDecisionCollaborativeSubTask): DecisionCollaborativeSubTaskView {
  return storedSubTaskToView(stored);
}
