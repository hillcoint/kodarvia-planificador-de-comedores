import type { AppSettings, DiningRoom, RatingRecord } from '../../data/types';
import { calculateAllAcceptances, applyAcceptances } from '../ratings/acceptance';
import { planMenu } from './planner';
import type { MenuLine, MenuOption, MenuPlanResult } from './types';

export interface DayPlanLine {
  line: MenuLine;
  diners: number;
  result: MenuPlanResult;
}

export interface DayPlanRoom {
  diningRoomId: string;
  diningRoomName: string;
  status: 'calculated' | 'no-capacity' | 'not-served';
  diners: number;
  lines: DayPlanLine[];
}

export interface DayPlanResult {
  date: string;
  rooms: DayPlanRoom[];
  usedCapacity: number;
  remainingCapacity: number;
  elapsedMs: number;
  acceptanceElapsedMs: number;
}

function diabetesDiners(room: DiningRoom): number {
  if (room.diabetesPercent <= 0) return 0;
  return Math.max(1, Math.min(room.diners, Math.round(room.diners * room.diabetesPercent / 100)));
}

export function planDay(input: {
  date: string;
  diningRooms: DiningRoom[];
  options: MenuOption[];
  ratings: RatingRecord[];
  settings: AppSettings;
}): DayPlanResult {
  const started = performance.now();
  const referenceDate = new Date(`${input.date}T23:59:59.999Z`);
  const activeRooms = input.diningRooms.filter((room) => room.active);
  const acceptanceStarted = performance.now();
  const acceptanceMatrix = calculateAllAcceptances(
    input.ratings,
    input.options,
    activeRooms.map((room) => room.id),
    referenceDate,
    input.settings.surveyWindowWeeks,
  );
  const acceptanceElapsedMs = performance.now() - acceptanceStarted;

  let remaining = input.settings.centralCapacity;
  let used = 0;
  const dayOfWeek = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  const rooms: DayPlanRoom[] = [];

  for (const room of activeRooms) {
    if (!room.serviceDays.includes(dayOfWeek)) {
      rooms.push({
        diningRoomId: room.id,
        diningRoomName: room.name,
        status: 'not-served',
        diners: room.diners,
        lines: [],
      });
      continue;
    }

    if (room.diners > remaining) {
      rooms.push({
        diningRoomId: room.id,
        diningRoomName: room.name,
        status: 'no-capacity',
        diners: room.diners,
        lines: [],
      });
      continue;
    }

    const acceptedOptions = applyAcceptances(
      input.options,
      input.options.map((option) => acceptanceMatrix[room.id][option.id]),
    );
    const diabetes = diabetesDiners(room);
    const general = Math.max(0, room.diners - diabetes);
    const lines: DayPlanLine[] = [];

    if (general > 0) {
      lines.push({
        line: 'general',
        diners: general,
        result: planMenu({
          options: acceptedOptions,
          diners: general,
          budget: room.budget,
          line: 'general',
          limits: {
            minKcal: input.settings.minKcal,
            maxKcal: input.settings.maxKcal,
            minProtein: input.settings.minProtein,
            maxSodium: input.settings.maxSodium,
            maxCarbsDiabetes: input.settings.maxCarbsDiabetes,
          },
          optionCap: input.settings.optionCap,
          optionCapThreshold: input.settings.optionCapThreshold,
        }),
      });
    }

    if (diabetes > 0) {
      lines.push({
        line: 'diabetes',
        diners: diabetes,
        result: planMenu({
          options: acceptedOptions,
          diners: diabetes,
          budget: room.budget,
          line: 'diabetes',
          limits: {
            minKcal: input.settings.minKcal,
            maxKcal: input.settings.maxKcal,
            minProtein: input.settings.minProtein,
            maxSodium: input.settings.maxSodium,
            maxCarbsDiabetes: input.settings.maxCarbsDiabetes,
          },
          optionCap: input.settings.optionCap,
          optionCapThreshold: input.settings.optionCapThreshold,
        }),
      });
    }

    remaining -= room.diners;
    used += room.diners;
    rooms.push({
      diningRoomId: room.id,
      diningRoomName: room.name,
      status: 'calculated',
      diners: room.diners,
      lines,
    });
  }

  return {
    date: input.date,
    rooms,
    usedCapacity: used,
    remainingCapacity: remaining,
    elapsedMs: performance.now() - started,
    acceptanceElapsedMs,
  };
}
