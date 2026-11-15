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

export type AcceptanceMatrix = Record<string, Record<string, OptionAcceptance>>;

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
  const matrix = calculateAllAcceptances(ratings, options, [diningRoomId], referenceDate, windowWeeks);
  return options.map((option) => matrix[diningRoomId][option.id]);
}

export function calculateAllAcceptances(
  ratings: RatingRecord[],
  options: Pick<MenuOption, 'id'>[],
  diningRoomIds: string[],
  referenceDate: Date,
  windowWeeks = 4,
): AcceptanceMatrix {
  const start = referenceDate.getTime() - windowWeeks * 7 * DAY_MS;
  const end = referenceDate.getTime();
  const roomSet = new Set(diningRoomIds);
  const optionSet = new Set(options.map((option) => option.id));
  const buckets = new Map<string, { sum: number; count: number }>();

  for (const rating of ratings) {
    if (!roomSet.has(rating.diningRoomId) || !optionSet.has(rating.optionId)) continue;
    const time = new Date(rating.date).getTime();
    if (time < start || time > end) continue;
    if (validateRating(rating.value)) continue;
    const key = `${rating.diningRoomId}::${rating.optionId}`;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += rating.value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return Object.fromEntries(diningRoomIds.map((roomId) => [
    roomId,
    Object.fromEntries(options.map((option) => {
      const bucket = buckets.get(`${roomId}::${option.id}`);
      const item: OptionAcceptance = !bucket || bucket.count === 0
        ? { optionId: option.id, acceptance: 3, count: 0, noData: true }
        : {
            optionId: option.id,
            acceptance: roundHalfUp(bucket.sum / bucket.count, 1),
            count: bucket.count,
            noData: false,
          };
      return [option.id, item];
    })),
  ]));
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
