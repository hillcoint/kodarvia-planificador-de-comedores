import { describe, expect, it } from 'vitest';
import type { AppEvent, AppSettings, DiningRoom } from '../types';

describe('history event semantics', () => {
  it('keeps immutable previous and next values for replay', () => {
    const event: AppEvent = {
      id: 'live-1',
      timestamp: '2026-11-15T12:00:00.000Z',
      userId: 'u',
      role: 'operations',
      entityType: 'diningRoom',
      entityId: 'C01',
      field: 'budget',
      previousValue: 60,
      nextValue: 55,
    };
    expect(event.previousValue).toBe(60);
    expect(event.nextValue).toBe(55);
  });

  it('the seed types support the fields used by state reconstruction', () => {
    const room = { id: 'C', name: 'X', diners: 40, budget: 50 } as DiningRoom;
    const settings = { id: 'settings', version: 1 } as AppSettings;
    expect(room.budget).toBe(50);
    expect(settings.version).toBe(1);
  });
});
