/** 是否允许访问 HikePlan：本人，或关联 Trip 的协作者 */
export function canAccessHikePlan(
  plan: { userId: string; tripId: string | null },
  userId: string,
  isTripCollaborator: boolean,
): boolean {
  if (plan.userId === userId) return true;
  if (plan.tripId && isTripCollaborator) return true;
  return false;
}
