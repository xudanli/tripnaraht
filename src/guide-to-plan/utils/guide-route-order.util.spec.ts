import { nearestNeighborVisitOrder } from './guide-route-order.util';

describe('nearestNeighborVisitOrder', () => {
  it('minimizes backtracking on a chain graph', () => {
    const matrix = [
      [0, 10, 30],
      [10, 0, 12],
      [30, 12, 0],
    ];
    expect(nearestNeighborVisitOrder(matrix, 0)).toEqual([0, 1, 2]);
  });
});
