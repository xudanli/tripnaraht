/**
 * 将 route_and_run 住宿 MCP 卡片规范为 Chat / iOS 认的 accommodation_cards 形状。
 * （与 AgentChatService.normalizeChatAccommodationCards 对齐，避免只写 accommodations 时前端不渲卡）
 */

function buildFallbackRecommendReasonZh(card: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const hint = String(card.itineraryHintZh ?? '').trim();
  const distance = String(card.distance_label_zh ?? '').trim();
  const stay = String(card.stayLabelZh ?? '').trim();
  const rating =
    typeof card.rating === 'number'
      ? card.rating
      : Number.isFinite(Number(card.rating))
        ? Number(card.rating)
        : undefined;
  if (hint) parts.push(hint);
  if (distance) parts.push(distance);
  if (rating != null && rating >= 4.5) parts.push(`评分 ${rating}，口碑较好`);
  else if (rating != null && rating >= 4) parts.push(`评分 ${rating}`);
  if (stay) parts.push(stay);
  if (!parts.length) return undefined;
  return `${parts.join('；')}。`;
}

export function normalizeAccommodationCardsForClient(
  accommodations: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return accommodations.slice(0, 8).map((card, i) => {
    const name = String(
      card.nameCN ??
        card.nameZh ??
        card.name ??
        card.title ??
        card.label ??
        card.listing_name ??
        `房源 ${i + 1}`,
    ).trim();
    const price = String(
      card.priceLabel ??
        card.priceHint ??
        card.price_text ??
        card.priceText ??
        card.price ??
        '',
    ).trim();
    const rating =
      typeof card.rating === 'number'
        ? card.rating
        : Number.isFinite(Number(card.rating))
          ? Number(card.rating)
          : undefined;
    const url = String(card.url ?? '').trim() || undefined;
    const appUrl = String(card.appUrl ?? '').trim() || undefined;
    const webUrl = String(card.webUrl ?? '').trim() || undefined;
    const bookingLinks = Array.isArray(card.bookingLinks)
      ? (card.bookingLinks as Array<Record<string, unknown>>)
          .map((link) => {
            const provider = String(link.provider ?? '').trim();
            const linkUrl = String(link.url ?? '').trim();
            const linkApp = String(link.appUrl ?? '').trim();
            const linkWeb = String(link.webUrl ?? '').trim();
            const labelZh = String(link.labelZh ?? '').trim();
            if (!provider || !linkUrl) return null;
            return {
              provider,
              url: linkUrl,
              ...(linkApp ? { appUrl: linkApp } : {}),
              ...(linkWeb ? { webUrl: linkWeb } : {}),
              labelZh: labelZh || provider,
            };
          })
          .filter(
            (
              x,
            ): x is {
              provider: string;
              url: string;
              appUrl?: string;
              webUrl?: string;
              labelZh: string;
            } => !!x,
          )
      : undefined;
    const bookingProvider = String(card.bookingProvider ?? '').trim() || undefined;
    const bookingCtaLabelZh =
      String(card.bookingCtaLabelZh ?? '').trim() || undefined;
    const photos = Array.isArray(card.photos)
      ? card.photos.map((p) => String(p)).filter(Boolean)
      : [];
    const photoUrl =
      String(card.photoUrl ?? card.imageUrl ?? card.coverUrl ?? '').trim() ||
      (photos[0] ? String(photos[0]) : undefined);
    const address = String(card.address ?? card.areaHint ?? card.area ?? '').trim() || undefined;
    const distance = String(card.distance_label_zh ?? '').trim() || undefined;
    const stay = String(card.stayLabelZh ?? '').trim() || undefined;
    const checkIn = String(card.checkIn ?? '').slice(0, 10) || undefined;
    const checkOut = String(card.checkOut ?? '').slice(0, 10) || undefined;
    const itineraryHint = String(card.itineraryHintZh ?? '').trim() || undefined;
    const recommendReason =
      String(card.decision_support_zh ?? card.recommendReasonZh ?? '').trim() ||
      buildFallbackRecommendReasonZh({
        ...card,
        rating,
        stayLabelZh: stay,
        distance_label_zh: distance,
        itineraryHintZh: itineraryHint,
      });

    const fields_zh: Array<{ key: string; label: string; value: string }> = [];
    if (price) fields_zh.push({ key: 'price', label: '价格', value: price });
    if (rating != null) fields_zh.push({ key: 'rating', label: '评分', value: String(rating) });
    if (stay) fields_zh.push({ key: 'stay', label: '入住', value: stay });
    if (checkIn && checkOut) {
      fields_zh.push({ key: 'dates', label: '日期', value: `${checkIn} → ${checkOut}` });
    }
    if (distance) fields_zh.push({ key: 'distance', label: '距离', value: distance });
    if (itineraryHint) {
      fields_zh.push({ key: 'itinerary_hint', label: '行程锚点', value: itineraryHint });
    }
    if (address) fields_zh.push({ key: 'address', label: '位置', value: address });
    if (recommendReason) {
      fields_zh.push({ key: 'recommend_reason', label: '推荐原因', value: recommendReason });
    }

    const existingActions = Array.isArray(card.actions)
      ? (card.actions as Array<Record<string, unknown>>)
      : [];
    const hasAddAction = existingActions.some(
      (a) => String(a.action ?? '') === 'add_accommodation_to_itinerary',
    );
    const isFliggy =
      String(card.source ?? '') === 'fliggy' ||
      String(card.bookingProvider ?? '') === 'fliggy';
    const otaRef =
      card.otaRef &&
      typeof card.otaRef === 'object' &&
      String((card.otaRef as { provider?: string }).provider ?? '').trim() &&
      String((card.otaRef as { externalId?: string }).externalId ?? '').trim()
        ? {
            provider: String((card.otaRef as { provider: string }).provider).trim() as
              | 'fliggy'
              | 'airbnb'
              | 'google'
              | 'unknown',
            externalId: String((card.otaRef as { externalId: string }).externalId).trim(),
          }
        : isFliggy && String(card.id ?? '').trim()
          ? { provider: 'fliggy' as const, externalId: String(card.id).trim() }
          : undefined;
    const applySnapshot = {
      id: String(card.id ?? `acc-${i}`),
      source: card.source ?? 'airbnb',
      name,
      ...(url ? { url } : {}),
      ...(appUrl ? { appUrl } : {}),
      ...(webUrl ? { webUrl } : {}),
      ...(photoUrl ? { photoUrl } : {}),
      ...(price ? { priceLabel: price } : {}),
      ...(rating != null ? { rating } : {}),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      ...(card.nightIndex != null ? { nightIndex: card.nightIndex } : {}),
      ...(typeof card.listing_lat === 'number' ? { listing_lat: card.listing_lat } : {}),
      ...(typeof card.listing_lng === 'number' ? { listing_lng: card.listing_lng } : {}),
      ...(address ? { address } : {}),
      ...(otaRef ? { otaRef } : {}),
      ...(recommendReason ? { decision_support_zh: recommendReason } : {}),
    };
    const actions = hasAddAction
      ? existingActions
      : [
          ...(url
            ? [
                {
                  action: 'view_accommodation',
                  label: 'View',
                  labelCN: '查看',
                  params: {
                    accommodationIndex: i,
                    url,
                    ...(appUrl ? { appUrl } : {}),
                    ...(webUrl ? { webUrl } : {}),
                  },
                },
              ]
            : []),
          {
            action: 'add_accommodation_to_itinerary',
            label: 'Add to Trip',
            labelCN: '加入行程',
            params: { accommodationIndex: i, applySnapshot },
          },
        ];
    const primaryAction =
      actions.find((a) => String(a.action) === 'add_accommodation_to_itinerary') ?? actions[0];

    return {
      ...card,
      id: String(card.id ?? `acc-${i}`),
      name,
      nameZh: name,
      nameCN: name,
      ...(price ? { priceLabel: price, price } : {}),
      ...(rating != null ? { rating } : {}),
      ...(url ? { url } : {}),
      ...(appUrl ? { appUrl } : {}),
      ...(webUrl ? { webUrl } : {}),
      ...(bookingProvider ? { bookingProvider } : {}),
      ...(bookingCtaLabelZh ? { bookingCtaLabelZh } : {}),
      ...(bookingLinks?.length ? { bookingLinks } : {}),
      ...(photoUrl ? { photoUrl, imageUrl: photoUrl, coverUrl: photoUrl } : {}),
      ...(photos.length ? { photos } : {}),
      ...(address ? { address } : {}),
      ...(distance ? { distance_label_zh: distance } : {}),
      ...(stay ? { stayLabelZh: stay } : {}),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      ...(itineraryHint ? { itineraryHintZh: itineraryHint } : {}),
      ...(recommendReason
        ? { decision_support_zh: recommendReason, recommendReasonZh: recommendReason }
        : {}),
      actions,
      // 主 CTA 用加入行程；bookingCtaLabelZh（如「去飞猪查看」）留给次要查看按钮
      cta_zh: String(
        primaryAction?.labelCN ??
          bookingCtaLabelZh ??
          (url ? '去预订' : '加入行程'),
      ),
      primary_action: primaryAction,
      fields_zh,
    };
  });
}
