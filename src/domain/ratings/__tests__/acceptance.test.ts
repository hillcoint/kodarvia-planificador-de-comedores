import { describe, expect, it } from 'vitest';
import { calculateAcceptances, validateRating } from '../acceptance';
import type { RatingRecord } from '../../../data/types';

describe('survey acceptance rules', () => {
  it('rejects ratings outside 1..5 or non-integers', () => {
    expect(validateRating(0)).toBe('La calificación tiene que ser un número entero de 1 a 5');
    expect(validateRating(5.5)).toBe('La calificación tiene que ser un número entero de 1 a 5');
    expect(validateRating(5)).toBeNull();
  });

  it('uses only the last four weeks and rounds half-up to one decimal', () => {
    const ratings: RatingRecord[] = [5, 4, 4, 4].map((value, index) => ({
      id: `r${index}`,
      diningRoomId: 'C01',
      optionId: 'S1',
      value,
      date: `2026-11-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`,
      userId: 'u',
    }));
    const result = calculateAcceptances(
      ratings,
      [{ id: 'S1' }, { id: 'S2' }],
      'C01',
      new Date('2026-11-14T12:00:00.000Z'),
      4,
    );
    expect(result[0]).toMatchObject({ optionId: 'S1', acceptance: 4.3, count: 4, noData: false });
    expect(result[1]).toMatchObject({ optionId: 'S2', acceptance: 3, count: 0, noData: true });
  });
});
