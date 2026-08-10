/**
 * Product copy for EXPERIENCE_BOOKING confirmations (not self-drive hard gates).
 */

const EXPERIENCE_BOOKING_CONFIRMATION_COPY: Record<string, string> = {
  exp_thorsmork_superjeep:
    'Þórsmörk 以超级吉普 / 向导体验增强行程（需预订核验），不是自驾过河硬门禁；确认后可作为可选体验活动',
  exp_landmannalaugar_superjeep:
    'Landmannalaugar 超级吉普 / 向导体验需预订核验后才能确认为行程活动',
  exp_blue_lagoon_admission:
    '蓝湖门票需预订核验后才能确认为行程活动',
};

/** Default generic booking-verification line when no product-specific copy. */
export function experienceBookingConfirmationMessage(
  experienceProductId: string,
  label: string,
): string {
  return (
    EXPERIENCE_BOOKING_CONFIRMATION_COPY[experienceProductId] ??
    `${label} 需要预订核验后才能确认为行程活动`
  );
}
