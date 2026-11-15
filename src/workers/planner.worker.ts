/// <reference lib="webworker" />

import { planMenu } from '../domain/menu/planner';
import {
  calculateAcceptances,
  type OptionAcceptance,
} from '../domain/ratings/acceptance';
import type { MenuPlanningInput, MenuOption } from '../domain/menu/types';
import type { RatingRecord } from '../data/types';

type Request =
  | { id: string; type: 'plan-menu'; payload: MenuPlanningInput }
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
    };

type Success =
  | { id: string; ok: true; type: 'plan-menu'; result: ReturnType<typeof planMenu> }
  | { id: string; ok: true; type: 'recalculate-acceptance'; result: OptionAcceptance[] };

type Failure = { id: string; ok: false; error: string };

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === 'plan-menu') {
      const response: Success = {
        id: request.id,
        ok: true,
        type: 'plan-menu',
        result: planMenu(request.payload),
      };
      scope.postMessage(response);
      return;
    }

    const response: Success = {
      id: request.id,
      ok: true,
      type: 'recalculate-acceptance',
      result: calculateAcceptances(
        request.payload.ratings,
        request.payload.options,
        request.payload.diningRoomId,
        new Date(request.payload.referenceDate),
        request.payload.windowWeeks,
      ),
    };
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
