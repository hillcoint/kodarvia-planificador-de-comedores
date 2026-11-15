import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ADMIN_KEY } from '../config';
import { ensureDemoData, getAllFromStore, getFromStore, putInStore, resetDemoData } from '../data/db';
import { updateEntityField } from '../data/mutations';
import type { AppEvent, AppSettings, AppUser, DiningRoom } from '../data/types';
import type { MenuOption } from '../domain/menu/types';

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: [{ title: 'Manyar · Administración' }] }),
  component: AdminPage,
});

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [rooms, setRooms] = useState<DiningRoom[]>([]);
  const [options, setOptions] = useState<MenuOption[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    await ensureDemoData();
    const [s, u, r, o, e] = await Promise.all([
      getFromStore<AppSettings>('settings', 'settings'),
      getAllFromStore<AppUser>('users'),
      getAllFromStore<DiningRoom>('diningRooms'),
      getAllFromStore<MenuOption>('options'),
      getAllFromStore<AppEvent>('events'),
    ]);
    setSettings(s ?? null);
    setUsers(u);
    setRooms(r);
    setOptions(o);
    setEvents(e);
  }

  useEffect(() => { void load(); }, []);

  function login() {
    if (keyValue === ADMIN_KEY) {
      setAuthenticated(true);
      setMessage('');
    } else {
      setMessage('Clave incorrecta.');
    }
  }

  async function saveSetting(field: keyof AppSettings, value: number) {
    if (!settings) return;
    const admin = users.find((user) => user.role === 'admin');
    if (!admin) return;
    if (value <= 0 && field !== 'maxCarbsDiabetes') {
      alert('El valor debe ser mayor que cero.');
      return;
    }
    await updateEntityField({
      entityType: 'settings',
      entityId: 'settings',
      field,
      value,
      actor: admin,
    });
    await load();
  }

  async function changeRole(user: AppUser, role: AppUser['role']) {
    await putInStore('users', { ...user, role });
    await load();
  }

  async function restore() {
    if (!confirm('¿Restaurar todos los datos de ejemplo? Se borrarán los cambios locales.')) return;
    try {
      await resetDemoData();
      await load();
      setMessage('Datos de ejemplo restaurados con la semilla 5537.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron restaurar los datos.');
    }
  }

  if (!authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8F3EB] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="font-serif text-2xl font-black text-[#7A1F3D]">Manyar · /admin</h1>
          <p className="mt-2 text-sm text-stone-600">Acceso de demostración con clave simple en el código. No es autenticación real.</p>
          <input
            type="password"
            value={keyValue}
            onChange={(event) => setKeyValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') login(); }}
            placeholder="Clave"
            className="field mt-5"
          />
          {message ? <p className="mt-2 text-sm font-semibold text-red-700">{message}</p> : null}
          <button onClick={login} className="mt-3 w-full rounded-lg bg-[#7A1F3D] px-4 py-2.5 font-bold text-white">Entrar</button>
          <Link to="/" className="mt-4 block text-center text-sm font-semibold text-[#2E4057]">Volver a Manyar</Link>
        </div>
      </main>
    );
  }

  if (!settings) return <main className="p-6">Cargando configuración…</main>;

  const numericFields: Array<[keyof AppSettings, string, number]> = [
    ['minKcal', 'Kcal mínimas', settings.minKcal],
    ['maxKcal', 'Kcal máximas', settings.maxKcal],
    ['minProtein', 'Proteína mínima (g)', settings.minProtein],
    ['maxSodium', 'Sodio máximo (mg)', settings.maxSodium],
    ['maxCarbsDiabetes', 'Carbohidratos máx. diabetes (g)', settings.maxCarbsDiabetes],
    ['optionCap', 'Tope por opción (0–1)', settings.optionCap],
    ['optionCapThreshold', 'Umbral de comensales', settings.optionCapThreshold],
    ['surveyWindowWeeks', 'Ventana encuestas (semanas)', settings.surveyWindowWeeks],
    ['centralCapacity', 'Capacidad central diaria', settings.centralCapacity],
  ];

  return (
    <main className="min-h-screen bg-[#F8F3EB] p-4 text-[#1B1B1B] sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-black text-[#7A1F3D]">Administración</h1>
            <p className="mt-1 text-sm text-stone-600">Configuración local de Manyar.</p>
          </div>
          <Link to="/" className="rounded-lg border border-[#7A1F3D] px-4 py-2 font-semibold text-[#7A1F3D]">Volver</Link>
        </header>

        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div> : null}

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-bold">Límites y reglas</h2>
          <p className="mt-1 text-sm text-stone-500">Los cambios marcan como desactualizados los menús calculados con versiones anteriores.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {numericFields.map(([field, label, value]) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs font-bold text-stone-500">{label}</span>
                <input
                  type="number"
                  step={field === 'optionCap' ? '0.01' : '1'}
                  defaultValue={value}
                  onBlur={(event) => void saveSetting(field, Number(event.target.value))}
                  className="field"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-bold">Usuarios y roles</h2>
          <div className="mt-4 space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
                <div><strong>{user.name}</strong><div className="text-xs text-stone-500">{user.id}</div></div>
                <select value={user.role} onChange={(event) => void changeRole(user, event.target.value as AppUser['role'])} className="field max-w-44">
                  <option value="nutritionist">Nutrióloga</option>
                  <option value="operations">Operación</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-bold">Exportación CSV</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => downloadCsv('manyar-comedores.csv', rooms as unknown as Record<string, unknown>[])} className="rounded-lg bg-[#2E4057] px-4 py-2 text-sm font-semibold text-white">Comedores</button>
            <button onClick={() => downloadCsv('manyar-opciones.csv', options as unknown as Record<string, unknown>[])} className="rounded-lg bg-[#2E4057] px-4 py-2 text-sm font-semibold text-white">Opciones</button>
            <button onClick={() => downloadCsv('manyar-eventos.csv', events as unknown as Record<string, unknown>[])} className="rounded-lg bg-[#2E4057] px-4 py-2 text-sm font-semibold text-white">Historial</button>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-xl font-bold">Datos de demostración</h2>
          <p className="mt-1 text-sm">La restauración borra IndexedDB y regenera la semilla fija 5537.</p>
          <button onClick={() => void restore()} className="mt-4 rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white">Restaurar datos de ejemplo</button>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm">
          <strong>Importante:</strong> esta clave está embebida en el frontend y solo sirve como separación visual de la demo. No es seguridad real. El README explica dónde cambiarla.
        </section>
      </div>
    </main>
  );
}
