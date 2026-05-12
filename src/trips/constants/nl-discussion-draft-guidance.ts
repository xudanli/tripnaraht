/**
 * 自然语言创建行程 ——「可执行讨论稿」产品定位（与 PRD 一致：先草案、同 trip 再拍板）
 * 供 POST /trips/from-natural-language 与 v2 成功响应、会话消息复用。
 */
export const NL_DISCUSSION_DRAFT_INTENT = 'executable_discussion_first' as const;

export const nlDiscussionDraftGuidance = {
  intent: NL_DISCUSSION_DRAFT_INTENT,
  /** 短句：适合 Toast / 主 message */
  headline: '先有一版能改的草案，再一起拍板。',
  /** 完整说明：卡片正文、详情 */
  body: '先帮你出一版能改的行程草案；去不去、怎么取舍，我们在同一条行程里接着聊。',
  /** 副提示：管理预期 */
  shortHint: '这是一版用来讨论的草案，你改条件，方案跟着变。',
  progressItemsLabel: '正在生成可讨论的行程草案',
  progressItemsDetail: '后台编排中，稍后刷新即可查看最新安排',
} as const;
