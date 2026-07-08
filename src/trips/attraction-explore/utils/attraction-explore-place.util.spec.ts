import type { Place } from '@prisma/client';
import {
  isRainyDayFriendlyPlace,
  rainyDayFriendlyScore,
} from './attraction-explore-place.util';

function place(input: Partial<Place> & Pick<Place, 'nameCN'>): Place {
  return {
    id: 1,
    uuid: 'uuid',
    nameEN: null,
    category: 'ATTRACTION',
    description: null,
    metadata: {},
    rating: 4,
    ...input,
  } as Place;
}

describe('isRainyDayFriendlyPlace', () => {
  it('excludes highland outdoor attractions even when description mentions hot springs', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '兰德曼纳劳卡',
          nameEN: 'Landmannalaugar',
          description: '以其独特的彩色流纹岩山脉、天然温泉和丰富的徒步路线而闻名',
        }),
      ),
    ).toBe(false);
  });

  it('excludes lake scenery without bath facilities', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '米湖',
          nameEN: 'Mývatn',
          description: '提供徒步、观鸟、温泉浴等多种活动',
        }),
      ),
    ).toBe(false);
  });

  it('excludes wild highland hot springs', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '兰德曼纳劳卡天然温泉',
          nameEN: 'Landmannalaugar Hot Spring',
          description: '温泉免费向公众开放',
        }),
      ),
    ).toBe(false);
  });

  it('includes commercial bath facilities', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '米湖自然温泉',
          nameEN: 'Mývatn Nature Baths',
        }),
      ),
    ).toBe(true);
  });

  it('includes museums and indoor metadata', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '冰岛国家博物馆',
          nameEN: 'National Museum of Iceland',
        }),
      ),
    ).toBe(true);

    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '珍珠博物馆',
          metadata: {
            constraints: { weatherSensitivity: { indoor: true } },
          },
        }),
      ),
    ).toBe(true);
  });

  it('includes Hallgrímskirkja as rainy-day friendly church', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '哈尔格林姆斯教堂',
          nameEN: 'Hallgrímskirkja',
        }),
      ),
    ).toBe(true);
  });

  it('excludes scenic black church photo stops', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '布迪尔黑教堂',
          nameEN: 'Búðir Black Church',
        }),
      ),
    ).toBe(false);
  });

  it('excludes Kirkjufell mountain misnamed as church hill', () => {
    expect(
      isRainyDayFriendlyPlace(
        place({
          nameCN: '教堂山',
          nameEN: 'Kirkjufell',
        }),
      ),
    ).toBe(false);
  });

  it('ranks museums above generic spa names', () => {
    const museum = place({ nameCN: '冰岛国家博物馆', nameEN: 'National Museum of Iceland', rating: 4 });
    const spa = place({ nameCN: '蓝湖温泉', nameEN: 'Blue Lagoon', rating: 5 });
    expect(rainyDayFriendlyScore(museum)).toBeGreaterThan(rainyDayFriendlyScore(spa) - 2);
  });
});
