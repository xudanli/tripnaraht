/**
 * Guide-to-Plan / 上传订单话术 → 导入意图提示（不新增意图词典；复用既有 CRE 短语）。
 */
export function detectGuideToPlanImportIntentHint(message: string): boolean {
  const msg = String(message ?? '');
  if (!msg.trim()) return false;
  return (
    /上传.*订单|关联.*预订|booking\s*upload|attach\s*booking/i.test(msg) ||
    /导入.*攻略|攻略链接|paste.*guide|guide.?to.?plan/i.test(msg) ||
    /上传.*(截图|确认单|凭证)|screenshot|confirmation\s*email/i.test(msg) ||
    /https?:\/\/\S+/i.test(msg) && /booking|expedia|airbnb|酒店|租车|航班/i.test(msg)
  );
}
