/// <reference lib="webworker" />

import { planMenu } from '../domain/menu/planner';
import { planDay } from '../domain/menu/day-planner';
import {
  calculateAcceptances,
  calculateAllAcceptances,
  type OptionAcceptance,
  type AcceptanceMatrix,
} from '../domain/ratings/acceptance';
import type { MenuPlanningInput, MenuOption } from '../domain/menu/types';
import type { AppSettings, DiningRoom, RatingRecord } from '../data/types';

type Request =
  | { id: string; type: 'plan-menu'; payload: MenuPlanningInput }
  | {
      id: string;
      type: 'plan-day';
      payload: {
        date: string;
        diningRooms: DiningRoom[];
        options: MenuOption[];
        ratings: RatingRecord[];
        settings: AppSettings;
      };
    }
  | {
      id: string;
      type: 'recalculate-acceptance';
      payload: {
        ratings: RatingRecord[];
        options: Pick<MenuOption, 'id'>[];
        diningRoomId: string;
        referenceDate: string;
        windowWeeks: number;
      };
    }
  | {
      id: string;
      type: 'recalculate-all-acceptances';
      payload: {
        ratings: RatingRecord[];
        options: Pick<MenuOption, 'id'>[];
        diningRoomIds: string[];
        referenceDate: string;
        windowWeeks: number;
      };
    };

type Success =
  | { id: string; ok: true; type: 'plan-menu'; result: ReturnType<typeof planMenu> }
  | { id: string; ok: true; type: 'plan-day'; result: ReturnType<typeof planDay> }
  | { id: string; ok: true; type: 'recalculate-acceptance'; result: OptionAcceptance[] }
  | { id: string; ok: true; type: 'recalculate-all-acceptances'; result: AcceptanceMatrix };

type Failure = { id: string; ok: false; error: string };

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    let response: Success;
    switch (request.type) {
      case 'plan-menu':
        response = { id: request.id, ok: true, type: request.type, result: planMenu(request.payload) };
        break;
      case 'plan-day':
        response = { id: request.id, ok: true, type: request.type, result: planDay(request.payload) };
        break;
      case 'recalculate-acceptance':
        response = {
          id: request.id,
          ok: true,
          type: request.type,
          result: calculateAcceptances(
            request.payload.ratings,
            request.payload.options,
            request.payload.diningRoomId,
            new Date(request.payload.referenceDate),
            request.payload.windowWeeks,
          ),
        };
        break;
      case 'recalculate-all-acceptances':
        response = {
          id: request.id,
          ok: true,
          type: request.type,
          result: calculateAllAcceptances(
            request.payload.ratings,
            request.payload.options,
            request.payload.diningRoomIds,
            new Date(request.payload.referenceDate),
            request.payload.windowWeeks,
          ),
        };
        break;
    }
    scope.postMessage(response);
  } catch (error) {
    const response: Failure = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Error desconocido en el Worker',
    };
    scope.postMessage(response);
  }
};
