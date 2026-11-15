import { validateRating } from '../domain/ratings/acceptance';
import { publishSync } from '../lib/sync';
import {
  deleteFromStore,
  getAllFromStore,
  getFromStore,
  putInStore,
  type StoreName,
} from './db';
import type {
  AppEvent,
  AppSettings,
  AppUser,
  DailySnapshot,
  DiningRoom,
  RatingRecord,
  StoredMenu,
  UserRole,
} from './types';
import type { MenuOption } from '../domain/menu/types';

type EditableEntity = 'diningRoom' | 'option' | 'settings';

const STORE_BY_ENTITY: Record<EditableEntity, StoreName> = {
  diningRoom: 'diningRooms',
  option: 'options',
  settings: 'settings',
};

interface FieldMeta {
  timestamp: string;
  role: UserRole;
  value: unknown;
}

export interface MutationConflict {
  applied: boolean;
  message: string;
  winningValue: unknown;
  losingValue: unknown;
}

function nutritionProtected(entityType: EditableEntity, field: string): boolean {
  if (entityType === 'option') return true;
  if (entityType !== 'settings') return false;
  return [
    'minKcal', 'maxKcal', 'minProtein', 'maxSodium', 'maxCarbsDiabetes',
    'optionCap', 'optionCapThreshold', 'surveyWindowWeeks',
  ].includes(field);
}

function incomingWins(
  entityType: EditableEntity,
  field: string,
  existing: FieldMeta | undefined,
  incoming: FieldMeta,
): boolean {
  if (!existing) return true;
  if (entityType === 'diningRoom' && ['budget', 'diners'].includes(field)) {
    return incoming.timestamp >= existing.timestamp;
  }
  if (nutritionProtected(entityType, field)) {
    if (existing.role === incoming.role) return incoming.timestamp >= existing.timestamp;
    if (incoming.role === 'nutritionist') return true;
    if (existing.role === 'nutritionist') return false;
  }
  return incoming.timestamp >= existing.timestamp;
}

function liveEventId() {
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function bumpDataVersion(actor: AppUser) {
  const settings = await getFromStore<AppSettings>('settings', 'settings');
  if (!settings) return;
  await putInStore('settings', {
    ...settings,
    version: settings.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  });
}

async function recordEvent(event: AppEvent) {
  await putInStore('events', event);
}

export async function updateEntityField(input: {
  entityType: EditableEntity;
  entityId: string;
  field: string;
  value: unknown;
  actor: AppUser;
}): Promise<MutationConflict | null> {
  const storeName = STORE_BY_ENTITY[input.entityType];
  const current = await getFromStore<Record<string, unknown>>(storeName, input.entityId);
  if (!current) throw new Error('No se encontró el registro a modificar');

  const timestamp = new Date().toISOString();
  const metaByField = (current.__fieldMeta as Record<string, FieldMeta> | undefined) ?? {};
  const incoming: FieldMeta = { timestamp, role: input.actor.role, value: input.value };
  const existingMeta = metaByField[input.field];
  const previousValue = current[input.field];
  const wins = incomingWins(input.entityType, input.field, existingMeta, incoming);

  if (!wins) {
    const message = 'Se detectó un conflicto entre pestañas. Se mantuvo el valor con prioridad según las reglas del servicio.';
    await recordEvent({
      id: liveEventId(),
      timestamp,
      userId: input.actor.id,
      role: input.actor.role,
      entityType: 'conflict',
      entityId: input.entityId,
      field: input.field,
      previousValue: input.value,
      nextValue: previousValue,
    });
    publishSync({
      type: 'conflict',
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      role: input.actor.role,
      timestamp,
      appliedValue: previousValue,
      competingValue: input.value,
      message,
    });
    return { applied: false, message, winningValue: previousValue, losingValue: input.value };
  }

  const next = {
    ...current,
    [input.field]: input.value,
    __fieldMeta: { ...metaByField, [input.field]: incoming },
    updatedAt: timestamp,
    updatedBy: input.actor.id,
    version: typeof current.version === 'number' ? current.version + 1 : current.version,
  };

  if (input.entityType === 'settings') {
    next.version = typeof current.version === 'number' ? current.version + 1 : 1;
  }

  await putInStore(storeName, next);
  await recordEvent({
    id: liveEventId(),
    timestamp,
    userId: input.actor.id,
    role: input.actor.role,
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    previousValue,
    nextValue: input.value,
  });
  if (input.entityType !== 'settings') await bumpDataVersion(input.actor);

  publishSync({
    type: existingMeta && existingMeta.value !== input.value ? 'conflict' : 'data-changed',
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    role: input.actor.role,
    timestamp,
    appliedValue: input.value,
    competingValue: existingMeta?.value,
    message: existingMeta && existingMeta.value !== input.value
      ? 'Se resolvió un conflicto y se aplicó el valor ganador.'
      : undefined,
  });

  if (existingMeta && existingMeta.value !== input.value) {
    return {
      applied: true,
      message: 'Se resolvió un conflicto y se aplicó el valor ganador.',
      winningValue: input.value,
      losingValue: existingMeta.value,
    };
  }
  return null;
}

export async function addRating(input: {
  diningRoomId: string;
  optionId: string;
  value: number;
  date: string;
  actor: AppUser;
}) {
  const error = validateRating(input.value);
  if (error) throw new Error(error);
  const record: RatingRecord = {
    id: `live-rating-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    diningRoomId: input.diningRoomId,
    optionId: input.optionId,
    value: input.value,
    date: input.date,
    userId: input.actor.id,
  };
  await putInStore('ratings', record);
  await recordEvent({
    id: liveEventId(),
    timestamp: new Date().toISOString(),
    userId: input.actor.id,
    role: input.actor.role,
    entityType: 'rating',
    entityId: record.id,
    field: '__record__',
    previousValue: null,
    nextValue: record,
  });
  await bumpDataVersion(input.actor);
  publishSync({
    type: 'data-changed',
    entityType: 'rating',
    entityId: record.id,
    field: '__record__',
    role: input.actor.role,
    timestamp: new Date().toISOString(),
    appliedValue: record,
  });
  return record;
}

async function applyEventValue(event: AppEvent, useNext: boolean) {
  const value = useNext ? event.nextValue : event.previousValue;
  if (event.entityType === 'rating' && event.field === '__record__') {
    if (value == null) await deleteFromStore('ratings', event.entityId);
    else await putInStore('ratings', value);
    return;
  }
  if (!['diningRoom', 'option', 'settings'].includes(event.entityType)) return;
  const entityType = event.entityType as EditableEntity;
  const store = STORE_BY_ENTITY[entityType];
  const current = await getFromStore<Record<string, unknown>>(store, event.entityId);
  if (!current) return;
  await putInStore(store, { ...current, [event.field]: value });
}

export async function undoLastChange(): Promise<AppEvent | null> {
  const events = (await getAllFromStore<AppEvent>('events'))
    .filter((event) => event.id.startsWith('live-') && event.entityType !== 'conflict')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50);
  const event = events.find((candidate) => !candidate.undone);
  if (!event) return null;
  await applyEventValue(event, false);
  await putInStore('events', { ...event, undone: true });
  publishSync({
    type: 'data-changed',
    entityType: event.entityType,
    entityId: event.entityId,
    field: event.field,
    role: event.role,
    timestamp: new Date().toISOString(),
    appliedValue: event.previousValue,
  });
  return event;
}

export async function redoLastChange(): Promise<AppEvent | null> {
  const events = (await getAllFromStore<AppEvent>('events'))
    .filter((event) => event.id.startsWith('live-') && event.entityType !== 'conflict')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-50);
  const event = events.find((candidate) => candidate.undone);
  if (!event) return null;
  await applyEventValue(event, true);
  await putInStore('events', { ...event, undone: false });
  publishSync({
    type: 'data-changed',
    entityType: event.entityType,
    entityId: event.entityId,
    field: event.field,
    role: event.role,
    timestamp: new Date().toISOString(),
    appliedValue: event.nextValue,
  });
  return event;
}

export async function getUndoRedoState() {
  const events = (await getAllFromStore<AppEvent>('events'))
    .filter((event) => event.id.startsWith('live-') && event.entityType !== 'conflict')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50);
  return {
    canUndo: events.some((event) => !event.undone),
    canRedo: events.some((event) => event.undone),
    retainedSteps: events.length,
  };
}

export interface ReconstructedState {
  at: string;
  diningRooms: DiningRoom[];
  options: MenuOption[];
  settings: AppSettings;
  ratings: RatingRecord[];
  menus: StoredMenu[];
  appliedEvents: number;
}

export async function reconstructStateAt(at: string): Promise<ReconstructedState> {
  const atMs = new Date(at).getTime();
  if (!Number.isFinite(atMs)) throw new Error('Fecha y hora no válidas');

  const snapshots = (await getAllFromStore<DailySnapshot>('snapshots'))
    .filter((snapshot) => new Date(snapshot.createdAt).getTime() <= atMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const snapshot = snapshots[0];
  if (!snapshot) throw new Error('No hay una instantánea anterior a esa fecha');

  const state = structuredClone(snapshot.state);
  const events = (await getAllFromStore<AppEvent>('events'))
    .filter((event) => {
      const time = new Date(event.timestamp).getTime();
      return time > new Date(snapshot.createdAt).getTime() && time <= atMs && !event.undone;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const event of events) {
    if (event.entityType === 'diningRoom') {
      const entity = state.diningRooms.find((item) => item.id === event.entityId) as unknown as Record<string, unknown> | undefined;
      if (entity) entity[event.field] = event.nextValue;
    } else if (event.entityType === 'option') {
      if (event.field === '__record__' && event.nextValue) {
        const exists = state.options.some((item) => item.id === event.entityId);
        if (!exists) state.options.push(structuredClone(event.nextValue) as MenuOption);
      } else {
        const entity = state.options.find((item) => item.id === event.entityId) as unknown as Record<string, unknown> | undefined;
        if (entity) entity[event.field] = event.nextValue;
      }
    } else if (event.entityType === 'settings') {
      (state.settings as unknown as Record<string, unknown>)[event.field] = event.nextValue;
    }
  }

  const ratings = (await getAllFromStore<RatingRecord>('ratings'))
    .filter((rating) => new Date(rating.date).getTime() <= atMs);
  const menus = (await getAllFromStore<StoredMenu>('menus'))
    .filter((menu) => {
      const time = menu.computedAt ? new Date(menu.computedAt).getTime() : new Date(`${menu.date}T23:59:59.999Z`).getTime();
      return time <= atMs;
    });

  return {
    at,
    diningRooms: state.diningRooms,
    options: state.options,
    settings: state.settings,
    ratings,
    menus,
    appliedEvents: events.length,
  };
}
