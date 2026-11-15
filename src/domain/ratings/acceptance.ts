import { roundHalfUp } from '../menu/rounding';
import type { MenuOption } from '../menu/types';
import type { RatingRecord } from '../../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OptionAcceptance {
  optionId: string;
  acceptance: number;
  count: number;
  noData: boolean;
}

export function validateRating(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return 'La calificación tiene que ser un número entero de 1 a 5';
  }
  return null;
}

export function calculateAcceptances(
  ratings: RatingRecord[],
  options: Pick<MenuOption, 'id'>[],
  diningRoomId: string,
  referenceDate: Date,
  windowWeeks = 4,
): OptionAcceptance[] {
  const start = referenceDate.getTime() - windowWeeks * 7 * DAY_MS;
  const end = referenceDate.getTime();
  const buckets = new Map<string, { sum: number; count: number }>();

  for (const rating of ratings) {
    if (rating.diningRoomId !== diningRoomId) continue;
    const time = new Date(rating.date).getTime();
    if (time < start || time > end) continue;
    if (validateRating(rating.value)) continue;
    const bucket = buckets.get(rating.optionId) ?? { sum: 0, count: 0 };
    bucket.sum += rating.value;
    bucket.count += 1;
    buckets.set(rating.optionId, bucket);
  }

  return options.map((option) => {
    const bucket = buckets.get(option.id);
    if (!bucket || bucket.count === 0) {
      return { optionId: option.id, acceptance: 3, count: 0, noData: true };
    }
    return {
      optionId: option.id,
      acceptance: roundHalfUp(bucket.sum / bucket.count, 1),
      count: bucket.count,
      noData: false,
    };
  });
}

export function applyAcceptances(
  options: MenuOption[],
  acceptances: OptionAcceptance[],
): MenuOption[] {
  const byId = new Map(acceptances.map((item) => [item.optionId, item.acceptance]));
  return options.map((option) => ({
    ...option,
    acceptance: byId.get(option.id) ?? 3,
  }));
}
