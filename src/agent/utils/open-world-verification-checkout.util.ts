/**
 * 开放世界核实任务状态流转（tripnara.open_world_discovery@v1 actions）
 * 无服务端持久化：客户端回传 ui_display.open_world_discovery 快照。
 */

import type { OpenWorldDiscoveryUi } from '../delivery/utils/open-world-discovery-ui.builder.util';
import type { OpenWorldPoiStub } from '../../planning-policy/types/open-world-poi.types';

export type OpenWorldVerificationAction = 'mark_verified' | 'discard_stub';

export interface ApplyOpenWorldVerificationInput {
  discovery: OpenWorldDiscoveryUi;
  action: OpenWorldVerificationAction;
  payload: {
    stub_id: string;
    promoted_place_id?: number;
    note_zh?: string;
  };
}

export interface ApplyOpenWorldVerificationResult {
  status: 'OK' | 'REJECTED';
  open_world_discovery: OpenWorldDiscoveryUi;
  rejection_reason_zh?: string;
  /** 供客户端写回 trip metadata / 本地缓存 */
  updated_stub?: OpenWorldPoiStub;
}

function findTask(discovery: OpenWorldDiscoveryUi, stubId: string) {
  return discovery.verification_tasks.find((t) => t.stub_id === stubId);
}

function stubFromTask(discovery: OpenWorldDiscoveryUi, stubId: string): OpenWorldPoiStub | undefined {
  const task = findTask(discovery, stubId);
  if (!task) return undefined;
  return {
    stubId: task.stub_id,
    displayName: task.title_zh.replace(/^核实：/, ''),
    regionHint: '',
    constraintTags: task.constraint_tags as OpenWorldPoiStub['constraintTags'],
    status: task.status === 'done' ? 'promoted' : 'verification_pending',
    source: 'user_mention',
    nodeKind: 'elastic',
    promotedPlaceId: undefined,
  };
}

export function applyOpenWorldVerificationAction(
  input: ApplyOpenWorldVerificationInput,
): ApplyOpenWorldVerificationResult {
  const stubId = String(input.payload.stub_id ?? '').trim();
  if (!stubId) {
    return {
      status: 'REJECTED',
      open_world_discovery: input.discovery,
      rejection_reason_zh: '缺少 stub_id',
    };
  }

  const task = findTask(input.discovery, stubId);
  if (!task) {
    return {
      status: 'REJECTED',
      open_world_discovery: input.discovery,
      rejection_reason_zh: `未找到核实任务：${stubId}`,
    };
  }

  if (input.action === 'discard_stub') {
    const tasks = input.discovery.verification_tasks.filter((t) => t.stub_id !== stubId);
    return {
      status: 'OK',
      open_world_discovery: {
        ...input.discovery,
        stub_count: tasks.length,
        verification_tasks: tasks,
        computed_at: new Date().toISOString(),
      },
      updated_stub: {
        ...(stubFromTask(input.discovery, stubId) ?? {
          stubId,
          displayName: task.title_zh,
          regionHint: '',
          constraintTags: [],
          status: 'discarded',
          source: 'user_mention',
          nodeKind: 'elastic',
        }),
        status: 'discarded',
      },
    };
  }

  if (input.action === 'mark_verified') {
    const tasks = input.discovery.verification_tasks.map((t) =>
      t.stub_id === stubId ? { ...t, status: 'done' as const } : t,
    );
    const updatedStub: OpenWorldPoiStub = {
      ...(stubFromTask(input.discovery, stubId) ?? {
        stubId,
        displayName: task.title_zh,
        regionHint: '',
        constraintTags: task.constraint_tags as OpenWorldPoiStub['constraintTags'],
        status: 'promoted',
        source: 'user_mention',
        nodeKind: 'verified',
      }),
      status: 'promoted',
      nodeKind: 'verified',
      ...(typeof input.payload.promoted_place_id === 'number'
        ? { promotedPlaceId: input.payload.promoted_place_id }
        : {}),
    };

    return {
      status: 'OK',
      open_world_discovery: {
        ...input.discovery,
        verification_tasks: tasks,
        computed_at: new Date().toISOString(),
      },
      updated_stub: updatedStub,
    };
  }

  return {
    status: 'REJECTED',
    open_world_discovery: input.discovery,
    rejection_reason_zh: '未知 action',
  };
}
