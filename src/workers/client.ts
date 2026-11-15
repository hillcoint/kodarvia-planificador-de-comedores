import type { MenuPlanningInput, MenuOption } from '../domain/menu/types';
import type { OptionAcceptance } from '../domain/ratings/acceptance';
import type { RatingRecord } from '../data/types';
import type { MenuPlanResult } from '../domain/menu/types';

type WorkerResult =
  | { id: string; ok: true; type: 'plan-menu'; result: MenuPlanResult }
  | { id: string; ok: true; type: 'recalculate-acceptance'; result: OptionAcceptance[] }
  | { id: string; ok: false; error: string };

let worker: Worker | null = null;
let counter = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

function getWorker(): Worker {
  if (typeof window === 'undefined') throw new Error('El Worker solo está disponible en el navegador');
  if (!worker) {
    worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const message = event.data;
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      if (!message.ok) task.reject(new Error(message.error));
      else task.resolve(message.result);
    };
    worker.onerror = (event) => {
      for (const task of pending.values()) task.reject(new Error(event.message || 'Error en el Worker'));
      pending.clear();
    };
  }
  return worker;
}

function requestWorker<T>(type: string, payload: unknown): Promise<T> {
  const id = `worker-${Date.now()}-${counter += 1}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage({ id, type, payload });
  });
}

export function planMenuInWorker(input: MenuPlanningInput): Promise<MenuPlanResult> {
  return requestWorker('plan-menu', input);
}

export function recalculateAcceptancesInWorker(payload: {
  ratings: RatingRecord[];
  options: Pick<MenuOption, 'id'>[];
  diningRoomId: string;
  referenceDate: string;
  windowWeeks: number;
}): Promise<OptionAcceptance[]> {
  return requestWorker('recalculate-acceptance', payload);
}
