/**
 * 涉藏检查站试点 playbook — Country Pack 只读加载。
 */
import * as fs from 'fs';
import * as path from 'path';

export type CnTibetCheckpointPlaybook = {
  id: string;
  version: string;
  disclaimer: string;
  summaryCN: string;
  checklistCN: string[];
  advisoriesCN: string[];
  advisoriesEN: string[];
  contentPath: string;
  relatedComplianceIds: string[];
};

type FileShape = {
  metadata?: {
    id?: string;
    version?: string;
    disclaimer?: string;
  };
  summaryCN?: string;
  checklistCN?: string[];
  advisoriesCN?: string[];
  advisoriesEN?: string[];
  relatedComplianceIds?: string[];
  contentPath?: string;
};

const REL =
  'data/country-packs/CN/playbooks/tibet-checkpoint-pilot.v1.json';

let cached: CnTibetCheckpointPlaybook | null = null;

function load(): CnTibetCheckpointPlaybook {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), REL);
  if (!fs.existsSync(filePath)) {
    cached = {
      id: 'cn.playbook.tibet_checkpoint_pilot',
      version: '0.0.0-missing',
      disclaimer:
        '涉藏通行证件以当地主管部门当日规定为准；平台不代办审批。',
      summaryCN: '涉藏行程须自行核验证件与检查站要求。',
      checklistCN: [],
      advisoriesCN: ['涉藏检查站：自行核验证件与通行资格，产品不代办审批。'],
      advisoriesEN: [
        'Tibet checkpoints: verify your own documents/permits; we do not process approvals.',
      ],
      contentPath: REL.replace(/\.json$/, '.md'),
      relatedComplianceIds: ['checkpoint_documents'],
    };
    return cached;
  }
  const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
  cached = {
    id: doc.metadata?.id || 'cn.playbook.tibet_checkpoint_pilot',
    version: doc.metadata?.version || '1.0.0',
    disclaimer:
      doc.metadata?.disclaimer ||
      '涉藏通行证件以当地主管部门当日规定为准；平台不代办审批。',
    summaryCN: doc.summaryCN || '',
    checklistCN: doc.checklistCN?.slice() ?? [],
    advisoriesCN: doc.advisoriesCN?.slice() ?? [],
    advisoriesEN: doc.advisoriesEN?.slice() ?? [],
    contentPath: doc.contentPath || REL.replace(/\.json$/, '.md'),
    relatedComplianceIds: doc.relatedComplianceIds?.slice() ?? [],
  };
  return cached;
}

/** @internal */
export function __resetCnTibetCheckpointPlaybookCacheForTests(): void {
  cached = null;
}

export function getCnTibetCheckpointPlaybook(): CnTibetCheckpointPlaybook {
  return load();
}

export function cnTibetCheckpointPlaybookDisclaimer(): string {
  return load().disclaimer;
}

/** 注入 drivingContext / 咨询附注的轻量摘要 */
export function buildCnTibetCheckpointPlaybookMeta(): Record<string, unknown> {
  const p = load();
  return {
    playbook_id: p.id,
    version: p.version,
    summary_cn: p.summaryCN,
    advisories_cn: p.advisoriesCN,
    checklist_cn: p.checklistCN.slice(0, 6),
    content_path: p.contentPath,
    related_compliance_ids: p.relatedComplianceIds,
    disclaimer: p.disclaimer,
  };
}
