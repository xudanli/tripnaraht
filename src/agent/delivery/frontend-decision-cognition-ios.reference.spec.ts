import {
  buildDecisionConsentRequest,
  pickCognitionCardsForIos,
  shouldPromptDecisionConsent,
} from './frontend-decision-cognition-ios.reference';

describe('frontend-decision-cognition-ios.reference', () => {
  it('picks ui_display cards over cockpit', () => {
    const cards = pickCognitionCardsForIos({
      result: {
        payload: {
          ui_display: {
            cognition_cards: {
              markers: ['PROBLEM_FOCUSED'],
              cards: [
                {
                  id: 'focus:1',
                  kind: 'FOCUSED_PROBLEM',
                  title_zh: '当前决策焦点',
                  body_zh: '是否绕行？',
                  cta_zh: '请确认后继续',
                  severity: 'warn',
                },
              ],
            },
          },
        },
      },
      explain: {
        decision_cockpit: {
          cognition_cards: {
            markers: [],
            cards: [
              {
                id: 'other',
                kind: 'REALITY',
                title_zh: '现实',
                body_zh: 'x',
              },
            ],
          },
        },
      },
    });
    expect(cards?.cards[0]?.kind).toBe('FOCUSED_PROBLEM');
    expect(shouldPromptDecisionConsent(cards)).toBe(true);
  });

  it('builds consent request with decision_consent', () => {
    const body = buildDecisionConsentRequest({
      requestId: 'ios-1',
      userId: 'u1',
      tripId: 't1',
    });
    expect((body.options as { decision_consent?: boolean }).decision_consent).toBe(true);
    expect(body.trip_id).toBe('t1');
  });
});
