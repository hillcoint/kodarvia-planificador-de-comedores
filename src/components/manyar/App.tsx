import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ensureDemoData, getAllFromIndex, getAllFromStore, getFromStore, putInStore } from '../../data/db';
import { addRating, reconstructStateAt, redoLastChange, undoLastChange, updateEntityField } from '../../data/mutations';
import type { AppEvent, AppSettings, AppUser, DiningRoom, RatingRecord, StoredMenu } from '../../data/types';
import type { MenuLine, MenuOption, MenuPlanResult, MenuTime } from '../../domain/menu/types';
import { applyAcceptances, calculateAcceptances } from '../../domain/ratings/acceptance';
import { planDayInWorker, planMenuInWorker, recalculateAcceptancesInWorker } from '../../workers/client';
import { subscribeSync, type SyncNotice } from '../../lib/sync';
import { localDateTime, money, number, percent, tomorrowIso } from '../../lib/format';
import { VirtualRows } from './VirtualRows';
import { SimplexTraceView } from './SimplexTrace';

type Tab = 'inicio' | 'comedores' | 'opciones' | 'encuestas' | 'planificador' | 'produccion' | 'historial';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'comedores', label: 'Comedores' },
  { id: 'opciones', label: 'Opciones' },
  { id: 'encuestas', label: 'Encuestas' },
  { id: 'planificador', label: 'Planificador' },
  { id: 'produccion', label: 'Producción' },
  { id: 'historial', label: 'Historial' },
];

const TIME_LABEL: Record<MenuTime, string> = {
  soup: 'Sopa',
  main: 'Plato fuerte',
  side: 'Guarnición',
  water: 'Agua',
};

function Empty({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function Pill({ children, tone = 'stone' }: { children: React.ReactNode; tone?: 'stone' | 'green' | 'amber' | 'red' | 'blue' }) {
  const styles = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-sky-100 text-sky-800',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

function statusInfo(status: 'uncalculated' | 'calculated' | 'stale' | 'no-capacity') {
  if (status === 'calculated') return { label: 'Calculado', tone: 'green' as const };
  if (status === 'stale') return { label: 'Desactualizado', tone: 'amber' as const };
  if (status === 'no-capacity') return { label: 'Sin capacidad', tone: 'red' as const };
  return { label: 'Sin calcular', tone: 'stone' as const };
}

function nextRecordVersion(settings: AppSettings) {
  return settings.version;
}

export function ManyarApp() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [rooms, setRooms] = useState<DiningRoom[]>([]);
  const [options, setOptions] = useState<MenuOption[]>([]);
  const [menus, setMenus] = useState<StoredMenu[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState('');
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  const [planDate, setPlanDate] = useState(tomorrowIso());
  const [calculatingDay, setCalculatingDay] = useState(false);
  const [daySummary, setDaySummary] = useState<{ elapsedMs: number; acceptanceElapsedMs: number; used: number; remaining: number } | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedLine, setSelectedLine] = useState<MenuLine>('general');
  const [selectedDate, setSelectedDate] = useState(tomorrowIso());
  const [singleResult, setSingleResult] = useState<MenuPlanResult | null>(null);
  const [singleBusy, setSingleBusy] = useState(false);

  const [optionSearch, setOptionSearch] = useState('');
  const [optionTime, setOptionTime] = useState<MenuTime | 'all'>('all');

  const [surveyRoomId, setSurveyRoomId] = useState('');
  const [surveyOptionId, setSurveyOptionId] = useState('');
  const [surveyWeeks, setSurveyWeeks] = useState(4);
  const [surveyRows, setSurveyRows] = useState<RatingRecord[]>([]);
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [newRating, setNewRating] = useState(5);

  const [events, setEvents] = useState<AppEvent[]>([]);
  const [historyFilter, setHistoryFilter] = useState('');
  const [stateAtInput, setStateAtInput] = useState('2026-11-09T08:00');
  const [stateAt, setStateAt] = useState<Awaited<ReturnType<typeof reconstructStateAt>> | null>(null);

  const refreshCore = useCallback(async () => {
    await ensureDemoData();
    const [nextRooms, nextOptions, nextMenus, nextSettings, nextUsers] = await Promise.all([
      getAllFromStore<DiningRoom>('diningRooms'),
      getAllFromStore<MenuOption>('options'),
      getAllFromStore<StoredMenu>('menus'),
      getFromStore<AppSettings>('settings', 'settings'),
      getAllFromStore<AppUser>('users'),
    ]);
    if (!nextSettings) throw new Error('No se encontró la configuración de Manyar');
    nextRooms.sort((a, b) => a.name.localeCompare(b.name));
    setRooms(nextRooms);
    setOptions(nextOptions);
    setMenus(nextMenus);
    setSettings(nextSettings);
    setUsers(nextUsers);
    setSelectedRoomId((current) => current || nextRooms[0]?.id || '');
    setSurveyRoomId((current) => current || nextRooms[0]?.id || '');
    setSurveyOptionId((current) => current || nextOptions[0]?.id || '');
  }, []);

  const loadHistory = useCallback(async () => {
    const rows = await getAllFromStore<AppEvent>('events');
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    setEvents(rows);
  }, []);

  const loadSurveyRows = useCallback(async (roomId: string) => {
    if (!roomId) return;
    setSurveyBusy(true);
    try {
      const rows = await getAllFromIndex<RatingRecord>('ratings', 'diningRoomId', roomId);
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setSurveyRows(rows);
    } finally {
      setSurveyBusy(false);
    }
  }, []);

  useEffect(() => {
    refreshCore()
      .then(() => setLoading(false))
      .catch((error) => {
        setFatalError(error instanceof Error ? error.message : 'No se pudo inicializar Manyar');
        setLoading(false);
      });
  }, [refreshCore]);

  useEffect(() => {
    if (!surveyRoomId) return;
    void loadSurveyRows(surveyRoomId);
  }, [surveyRoomId, loadSurveyRows]);

  useEffect(() => {
    if (tab === 'historial') void loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => subscribeSync((message) => {
    setNotice(message);
    void refreshCore();
    if (tab === 'historial') void loadHistory();
    if (message.entityType === 'rating' && message.entityId && surveyRoomId) void loadSurveyRows(surveyRoomId);
  }), [refreshCore, loadHistory, loadSurveyRows, surveyRoomId, tab]);

  const operationsUser = users.find((user) => user.role === 'operations') ?? users[0];
  const nutritionUser = users.find((user) => user.role === 'nutritionist') ?? users[0];

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  const surveyRoom = rooms.find((room) => room.id === surveyRoomId);

  const roomStatus = useCallback((room: DiningRoom) => {
    const record = menus.find((menu) => menu.diningRoomId === room.id && menu.date === planDate && menu.line === 'general');
    if (!record) return 'uncalculated' as const;
    if (record.status === 'no-capacity') return 'no-capacity' as const;
    if (settings && record.sourceVersion < settings.version) return 'stale' as const;
    return 'calculated' as const;
  }, [menus, planDate, settings]);

  async function persistMenu(room: DiningRoom, date: string, line: MenuLine, diners: number, result: MenuPlanResult) {
    if (!settings) return;
    const record: StoredMenu = {
      id: `${date}-${room.id}-${line}`,
      diningRoomId: room.id,
      date,
      line,
      status: 'calculated',
      computedAt: new Date().toISOString(),
      sourceVersion: nextRecordVersion(settings),
      acceptancePerTime: result.metrics?.acceptancePerTime,
      cost: result.metrics?.cost,
      kcal: result.metrics?.kcal,
      carbs: result.metrics?.carbs,
      protein: result.metrics?.protein,
      sodium: result.metrics?.sodium,
      allocations: result.allocations.map((item) => ({
        optionId: item.option.id,
        proportion: item.proportion,
        portions: item.portions,
      })),
      slack: result.slack,
      message: result.message,
    };
    void diners;
    await putInStore('menus', record);
  }

  async function calculateDay() {
    if (!settings) return;
    setCalculatingDay(true);
    try {
      const ratings = await getAllFromStore<RatingRecord>('ratings');
      const result = await planDayInWorker({
        date: planDate,
        diningRooms: rooms,
        options,
        ratings,
        settings,
      });
      for (const roomPlan of result.rooms) {
        const room = rooms.find((item) => item.id === roomPlan.diningRoomId);
        if (!room) continue;
        if (roomPlan.status === 'no-capacity') {
          await putInStore<StoredMenu>('menus', {
            id: `${planDate}-${room.id}-general`,
            diningRoomId: room.id,
            date: planDate,
            line: 'general',
            status: 'no-capacity',
            computedAt: new Date().toISOString(),
            sourceVersion: settings.version,
            message: 'La capacidad central de cocina no alcanza para este comedor.',
          });
          continue;
        }
        for (const line of roomPlan.lines) await persistMenu(room, planDate, line.line, line.diners, line.result);
      }
      setDaySummary({
        elapsedMs: result.elapsedMs,
        acceptanceElapsedMs: result.acceptanceElapsedMs,
        used: result.usedCapacity,
        remaining: result.remainingCapacity,
      });
      await refreshCore();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudieron calcular los menús');
    } finally {
      setCalculatingDay(false);
    }
  }

  async function calculateSingle() {
    if (!settings || !selectedRoom) return;
    setSingleBusy(true);
    try {
      const ratings = await getAllFromIndex<RatingRecord>('ratings', 'diningRoomId', selectedRoom.id);
      const acceptance = await recalculateAcceptancesInWorker({
        ratings,
        options: options.map(({ id }) => ({ id })),
        diningRoomId: selectedRoom.id,
        referenceDate: `${selectedDate}T23:59:59.999Z`,
        windowWeeks: settings.surveyWindowWeeks,
      });
      const acceptedOptions = applyAcceptances(options, acceptance);
      const diners = selectedLine === 'diabetes'
        ? Math.max(1, Math.round(selectedRoom.diners * selectedRoom.diabetesPercent / 100))
        : Math.max(1, selectedRoom.diners - Math.round(selectedRoom.diners * selectedRoom.diabetesPercent / 100));
      const result = await planMenuInWorker({
        options: acceptedOptions,
        diners,
        budget: selectedRoom.budget,
        line: selectedLine,
        limits: {
          minKcal: settings.minKcal,
          maxKcal: settings.maxKcal,
          minProtein: settings.minProtein,
          maxSodium: settings.maxSodium,
          maxCarbsDiabetes: settings.maxCarbsDiabetes,
        },
        optionCap: settings.optionCap,
        optionCapThreshold: settings.optionCapThreshold,
      });
      setSingleResult(result);
      await persistMenu(selectedRoom, selectedDate, selectedLine, diners, result);
      await refreshCore();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo calcular el menú');
    } finally {
      setSingleBusy(false);
    }
  }

  async function saveRoomField(room: DiningRoom, field: string, value: unknown) {
    if (!operationsUser) return;
    if ((field === 'diners' || field === 'budget') && Number(value) <= 0) {
      alert('Comensales y presupuesto deben ser mayores que cero.');
      return;
    }
    const conflict = await updateEntityField({
      entityType: 'diningRoom',
      entityId: room.id,
      field,
      value,
      actor: operationsUser,
    });
    if (conflict) alert(`${conflict.message}\nAplicado: ${String(conflict.winningValue)}\nOtro valor: ${String(conflict.losingValue)}`);
    await refreshCore();
  }

  async function saveOptionField(option: MenuOption, field: string, value: unknown) {
    if (!nutritionUser) return;
    const conflict = await updateEntityField({
      entityType: 'option',
      entityId: option.id,
      field,
      value,
      actor: nutritionUser,
    });
    if (conflict) alert(`${conflict.message}\nAplicado: ${String(conflict.winningValue)}\nOtro valor: ${String(conflict.losingValue)}`);
    await refreshCore();
  }

  async function createRating() {
    if (!nutritionUser || !surveyRoomId || !surveyOptionId) return;
    try {
      await addRating({
        diningRoomId: surveyRoomId,
        optionId: surveyOptionId,
        value: newRating,
        date: new Date().toISOString(),
        actor: nutritionUser,
      });
      await loadSurveyRows(surveyRoomId);
      await refreshCore();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo guardar la calificación');
    }
  }

  const filteredOptions = useMemo(() => options.filter((option) => {
    if (optionTime !== 'all' && option.time !== optionTime) return false;
    return option.name.toLowerCase().includes(optionSearch.toLowerCase());
  }), [options, optionSearch, optionTime]);

  const visibleSurveyRows = useMemo(() => {
    const cutoff = Date.now() - surveyWeeks * 7 * 24 * 60 * 60 * 1000;
    return surveyRows.filter((rating) => {
      if (surveyOptionId && rating.optionId !== surveyOptionId) return false;
      return new Date(rating.date).getTime() >= cutoff;
    });
  }, [surveyRows, surveyOptionId, surveyWeeks]);

  const currentAcceptance = useMemo(() => {
    if (!surveyRoomId || !surveyOptionId) return null;
    return calculateAcceptances(
      surveyRows,
      [{ id: surveyOptionId }],
      surveyRoomId,
      new Date(),
      settings?.surveyWindowWeeks ?? 4,
    )[0];
  }, [surveyRows, surveyRoomId, surveyOptionId, settings]);

  const productionMenus = useMemo(() => menus.filter((menu) =>
    menu.date === selectedDate && menu.status === 'calculated' && menu.allocations?.some((item) => item.portions > 0),
  ), [menus, selectedDate]);

  const historyRows = useMemo(() => {
    const term = historyFilter.toLowerCase();
    if (!term) return events;
    return events.filter((event) =>
      event.entityType.toLowerCase().includes(term) ||
      event.entityId.toLowerCase().includes(term) ||
      event.field.toLowerCase().includes(term) ||
      event.userId.toLowerCase().includes(term),
    );
  }, [events, historyFilter]);

  async function showStateAt() {
    try {
      const value = await reconstructStateAt(new Date(stateAtInput).toISOString());
      setStateAt(value);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo reconstruir el estado');
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#F8F3EB]"><p className="font-semibold">Cargando Manyar…</p></main>;
  }

  if (fatalError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8F3EB] p-6">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6">
          <h1 className="text-xl font-bold text-red-800">Manyar no puede iniciar</h1>
          <p className="mt-2 text-sm text-stone-700">{fatalError}</p>
          <p className="mt-3 text-sm font-medium">El navegador debe permitir IndexedDB para usar la aplicación.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F3EB] text-[#1B1B1B]">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#F8F3EB]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-serif text-2xl font-black tracking-tight text-[#7A1F3D]">Manyar</h1>
            <p className="hidden text-xs text-stone-600 sm:block">Planificador de comedores empresariales</p>
          </div>
          <Link to="/admin" className="rounded-lg border border-[#7A1F3D] px-3 py-2 text-sm font-semibold text-[#7A1F3D]">/admin</Link>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${tab === item.id ? 'bg-[#7A1F3D] text-white' : 'text-stone-600 hover:bg-white'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice ? (
        <div className="mx-auto mt-3 flex max-w-7xl items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div>
            <strong>{notice.type === 'conflict' ? 'Conflicto entre pestañas.' : 'Datos actualizados en otra pestaña.'}</strong>
            {notice.message ? <span> {notice.message}</span> : null}
            {notice.competingValue !== undefined ? (
              <div className="mt-1 text-xs">Aplicado: {String(notice.appliedValue)} · Otro valor: {String(notice.competingValue)}</div>
            ) : null}
          </div>
          <button className="font-bold" onClick={() => setNotice(null)}>×</button>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        {tab === 'inicio' ? (
          <section className="space-y-5">
            <div className="rounded-3xl bg-[#7A1F3D] p-5 text-white shadow-sm sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white/75">Operación diaria</p>
                  <h2 className="mt-1 font-serif text-3xl font-black">Menús de mañana</h2>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      aria-label="Fecha a calcular"
                      type="date"
                      value={planDate}
                      onChange={(event) => setPlanDate(event.target.value)}
                      className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-stone-900"
                    />
                    <Pill tone="amber">{rooms.length} comedores</Pill>
                  </div>
                </div>
                <button
                  onClick={() => void calculateDay()}
                  disabled={calculatingDay}
                  className="min-h-12 rounded-xl bg-[#F4A259] px-5 py-3 font-bold text-stone-950 shadow-sm disabled:opacity-50"
                >
                  {calculatingDay ? 'Calculando…' : 'Calcular menús de mañana'}
                </button>
              </div>
            </div>

            {daySummary ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Tiempo total" value={`${number(daySummary.elapsedMs, 1)} ms`} />
                <Metric label="Aceptaciones" value={`${number(daySummary.acceptanceElapsedMs, 1)} ms`} />
                <Metric label="Capacidad usada" value={String(daySummary.used)} />
                <Metric label="Capacidad libre" value={String(daySummary.remaining)} />
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => {
                const status = roomStatus(room);
                const info = statusInfo(status);
                const record = menus.find((menu) => menu.diningRoomId === room.id && menu.date === planDate && menu.line === 'general');
                return (
                  <article key={room.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{room.name}</h3>
                        <p className="mt-1 text-sm text-stone-500">{room.diners} comensales · {money(room.budget)}/comensal</p>
                      </div>
                      <Pill tone={info.tone}>{info.label}</Pill>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {record?.message ? <Pill tone="red">Presupuesto / nutrición</Pill> : null}
                      {record?.sodium != null && settings && record.sodium >= settings.maxSodium - 1 ? <Pill tone="amber">Sodio al límite</Pill> : null}
                      <Pill tone="blue">Diabetes {number(room.diabetesPercent, 1)} %</Pill>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {tab === 'comedores' ? (
          <section>
            <SectionTitle title="Comedores" subtitle="Empresas, volumen, presupuesto, servicio y línea diabetes." />
            <div className="grid gap-4 lg:grid-cols-2">
              {rooms.map((room) => (
                <article key={room.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between"><h3 className="font-bold">{room.name}</h3><Pill>{room.id}</Pill></div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Field label="Comensales">
                      <input type="number" min="1" defaultValue={room.diners} onBlur={(e) => void saveRoomField(room, 'diners', Number(e.target.value))} className="field" />
                    </Field>
                    <Field label="Presupuesto MXN">
                      <input type="number" min="0.01" step="0.01" defaultValue={room.budget} onBlur={(e) => void saveRoomField(room, 'budget', Number(e.target.value))} className="field" />
                    </Field>
                    <Field label="% diabetes">
                      <input type="number" min="0" max="100" step="0.1" defaultValue={room.diabetesPercent} onBlur={(e) => void saveRoomField(room, 'diabetesPercent', Number(e.target.value))} className="field" />
                    </Field>
                    <Field label="Horario">
                      <div className="flex gap-1">
                        <input type="time" defaultValue={room.scheduleStart} onBlur={(e) => void saveRoomField(room, 'scheduleStart', e.target.value)} className="field" />
                        <input type="time" defaultValue={room.scheduleEnd} onBlur={(e) => void saveRoomField(room, 'scheduleEnd', e.target.value)} className="field" />
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Días de servicio</p>
                    <div className="flex gap-2">
                      {[['L',1],['M',2],['X',3],['J',4],['V',5]].map(([label, day]) => (
                        <label key={String(day)} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={room.serviceDays.includes(Number(day))}
                            onChange={(event) => {
                              const days = event.target.checked
                                ? [...room.serviceDays, Number(day)].sort()
                                : room.serviceDays.filter((value) => value !== Number(day));
                              void saveRoomField(room, 'serviceDays', days);
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'opciones' ? (
          <section>
            <SectionTitle title="Opciones del menú" subtitle="Catálogo nutricional, costos, etiquetas y aceptación." />
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input value={optionSearch} onChange={(e) => setOptionSearch(e.target.value)} placeholder="Buscar opción…" className="field sm:max-w-sm" />
              <select value={optionTime} onChange={(e) => setOptionTime(e.target.value as MenuTime | 'all')} className="field sm:max-w-xs">
                <option value="all">Todos los tiempos</option>
                {Object.entries(TIME_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-3">
              {filteredOptions.map((option) => (
                <article key={option.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="font-bold">{option.name}</h3><p className="text-xs text-stone-500">{option.id} · {TIME_LABEL[option.time]}</p></div>
                    <Pill tone={option.acceptance === 3 ? 'stone' : 'green'}>Aceptación {number(option.acceptance, 1)}</Pill>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                    {([
                      ['kcal', option.kcal, 'Kcal'],
                      ['carbs', option.carbs, 'Carb. g'],
                      ['protein', option.protein, 'Proteína g'],
                      ['sodium', option.sodium, 'Sodio mg'],
                      ['cost', option.cost, 'Costo'],
                    ] as const).map(([field, value, label]) => (
                      <Field key={field} label={label}>
                        <input type="number" step="0.1" defaultValue={value} onBlur={(e) => void saveOptionField(option, field, Number(e.target.value))} className="field" />
                      </Field>
                    ))}
                    <Field label="Etiquetas">
                      <input defaultValue={option.tags.join(', ')} onBlur={(e) => void saveOptionField(option, 'tags', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} className="field" />
                    </Field>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'encuestas' ? (
          <section>
            <SectionTitle title="Encuestas" subtitle="Calificaciones 1–5 y promedio de las últimas cuatro semanas." />
            <div className="mb-4 grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
              <select value={surveyRoomId} onChange={(e) => setSurveyRoomId(e.target.value)} className="field">
                {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
              <select value={surveyOptionId} onChange={(e) => setSurveyOptionId(e.target.value)} className="field">
                {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
              <select value={surveyWeeks} onChange={(e) => setSurveyWeeks(Number(e.target.value))} className="field">
                <option value={4}>Últimas 4 semanas</option>
                <option value={12}>Últimas 12 semanas</option>
                <option value={52}>52 semanas</option>
              </select>
              <div className="flex items-center justify-between rounded-lg bg-[#F8F3EB] px-3">
                <span className="text-xs font-semibold">Aceptación</span>
                <strong>{currentAcceptance ? number(currentAcceptance.acceptance, 1) : '—'}</strong>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-stone-200 bg-white p-4">
              <Field label="Nueva calificación">
                <select value={newRating} onChange={(e) => setNewRating(Number(e.target.value))} className="field">
                  {[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <button onClick={() => void createRating()} className="rounded-lg bg-[#5B8E7D] px-4 py-2 font-semibold text-white">Guardar calificación</button>
              <span className="text-xs text-stone-500">{surveyBusy ? 'Cargando…' : `${visibleSurveyRows.length.toLocaleString('es-MX')} respuestas filtradas`}</span>
            </div>

            <VirtualRows
              items={visibleSurveyRows}
              rowHeight={56}
              height={520}
              empty={<Empty title="No hay calificaciones para este filtro." />}
              renderRow={(rating) => {
                const option = options.find((item) => item.id === rating.optionId);
                return (
                  <div className="grid h-full grid-cols-[100px_1fr_70px] items-center gap-2 border-b border-stone-100 px-3 text-sm">
                    <span className="text-xs text-stone-500">{new Date(rating.date).toLocaleDateString('es-MX')}</span>
                    <span className="truncate">{option?.name ?? rating.optionId}</span>
                    <strong className="text-center tabular-nums">{rating.value} / 5</strong>
                  </div>
                );
              }}
            />
          </section>
        ) : null}

        {tab === 'planificador' ? (
          <section className="space-y-4">
            <SectionTitle title="Planificador del día" subtitle="Optimización real en Web Worker con símplex de dos fases." />
            <div className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
              <select value={selectedRoomId} onChange={(e) => { setSelectedRoomId(e.target.value); setSingleResult(null); }} className="field">
                {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="field" />
              <select value={selectedLine} onChange={(e) => { setSelectedLine(e.target.value as MenuLine); setSingleResult(null); }} className="field">
                <option value="general">General</option>
                <option value="diabetes">Diabetes</option>
              </select>
              <button onClick={() => void calculateSingle()} disabled={singleBusy} className="rounded-lg bg-[#7A1F3D] px-4 py-2 font-bold text-white disabled:opacity-50">
                {singleBusy ? 'Calculando…' : 'Calcular menú'}
              </button>
            </div>

            {singleResult ? <PlanResult result={singleResult} diners={selectedRoom?.diners ?? 0} /> : <Empty title="Elegí comedor, día y línea y calculá el menú." />}
          </section>
        ) : null}

        {tab === 'produccion' ? (
          <section className="print-area">
            <div className="no-print">
              <SectionTitle title="Hoja de producción" subtitle="Porciones a cocinar por opción, comedor y línea." />
              <div className="mb-4 flex flex-wrap gap-2">
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="field max-w-xs" />
                <button onClick={() => window.print()} className="rounded-lg bg-[#2E4057] px-4 py-2 font-semibold text-white">Imprimir hoja</button>
              </div>
            </div>
            {productionMenus.length === 0 ? (
              <Empty title="No hay menús calculados con hoja de producción para esta fecha." action={<button onClick={() => setTab('planificador')} className="rounded-lg bg-[#7A1F3D] px-4 py-2 text-sm font-semibold text-white">Ir al planificador</button>} />
            ) : (
              <div className="space-y-5">
                <div className="print-only mb-4">
                  <h1 className="text-2xl font-bold">Manyar · Hoja de producción</h1>
                  <p>{selectedDate}</p>
                </div>
                {productionMenus.map((menu) => {
                  const room = rooms.find((item) => item.id === menu.diningRoomId);
                  return (
                    <article key={menu.id} className="break-inside-avoid rounded-2xl border border-stone-300 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div><h3 className="font-bold">{room?.name ?? menu.diningRoomId}</h3><p className="text-sm text-stone-500">{menu.line === 'diabetes' ? 'Línea diabetes' : 'Línea general'}</p></div>
                        {menu.line === 'diabetes' ? <Pill tone="blue">Etiqueta DIABETES</Pill> : null}
                      </div>
                      <table className="mt-4 w-full text-sm">
                        <thead><tr className="border-b text-left"><th className="py-2">Opción</th><th className="py-2 text-right">%</th><th className="py-2 text-right">Porciones</th></tr></thead>
                        <tbody>
                          {menu.allocations?.filter((item) => item.portions > 0).map((allocation) => (
                            <tr key={allocation.optionId} className="border-b border-stone-100">
                              <td className="py-2">{options.find((option) => option.id === allocation.optionId)?.name ?? allocation.optionId}</td>
                              <td className="py-2 text-right tabular-nums">{percent(allocation.proportion)}</td>
                              <td className="py-2 text-right font-bold tabular-nums">{allocation.portions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 text-right text-sm font-semibold">Holgura total: {menu.slack ?? 0}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {tab === 'historial' ? (
          <section>
            <SectionTitle title="Historial y estado al…" subtitle="Eventos inmutables, deshacer/rehacer y reconstrucción temporal." />
            <div className="mb-4 flex flex-wrap gap-2">
              <button onClick={async () => { await undoLastChange(); await refreshCore(); await loadHistory(); }} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Deshacer</button>
              <button onClick={async () => { await redoLastChange(); await refreshCore(); await loadHistory(); }} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Rehacer</button>
              <input value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} placeholder="Filtrar eventos…" className="field min-w-56" />
            </div>
            <VirtualRows
              items={historyRows}
              rowHeight={62}
              height={420}
              empty={<Empty title="No hay eventos para este filtro." />}
              renderRow={(event) => (
                <div className="grid h-full grid-cols-[120px_90px_1fr] items-center gap-2 border-b border-stone-100 px-3 text-xs">
                  <span className="text-stone-500">{localDateTime(event.timestamp)}</span>
                  <Pill>{event.entityType}</Pill>
                  <span className="truncate"><strong>{event.entityId}</strong> · {event.field}: {String(event.previousValue)} → {String(event.nextValue)}</span>
                </div>
              )}
            />

            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="font-bold">Reconstruir “Estado al…”</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <input type="datetime-local" value={stateAtInput} onChange={(e) => setStateAtInput(e.target.value)} className="field max-w-xs" />
                <button onClick={() => void showStateAt()} className="rounded-lg bg-[#5B8E7D] px-4 py-2 font-semibold text-white">Reconstruir</button>
              </div>
              {stateAt ? <StateAtSummary state={stateAt} /> : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-5"><h2 className="font-serif text-2xl font-black text-[#2E4057]">{title}</h2><p className="mt-1 text-sm text-stone-600">{subtitle}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold text-stone-500">{label}</span>{children}</label>;
}

function PlanResult({ result, diners }: { result: MenuPlanResult; diners: number }) {
  if (result.status !== 'optimal') {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
        <h3 className="font-serif text-xl font-black text-amber-950">Diagnóstico del cálculo</h3>
        <p className="mt-2 font-medium">{result.message}</p>
        {result.minimumPossibleCost != null ? <p className="mt-3 text-2xl font-black">{money(result.minimumPossibleCost)}</p> : null}
        <div className="mt-4 space-y-3">
          <SimplexTraceView trace={result.primaryTrace} title="Ver pivotes del modelo principal" />
          <SimplexTraceView trace={result.minimumCostTrace} title="Ver pivotes del modelo de costo mínimo" />
        </div>
      </div>
    );
  }

  const positive = result.allocations.filter((item) => item.proportion > 0.0000005);
  return (
    <div className="space-y-4">
      {result.hadAlternateOptima ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
          <strong>Hubo óptimos alternativos.</strong> Varias combinaciones daban la misma aceptación máxima; Manyar ejecutó un segundo modelo y eligió la de menor costo.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-stone-50"><tr><th className="p-3 text-left">Tiempo</th><th className="p-3 text-left">Opción</th><th className="p-3 text-right">Proporción</th><th className="p-3 text-right">Porciones</th></tr></thead>
          <tbody>
            {positive.map((item) => (
              <tr key={item.option.id} className="border-t border-stone-100">
                <td className="p-3">{TIME_LABEL[item.option.time]}</td>
                <td className="p-3 font-semibold">{item.option.name}</td>
                <td className="p-3 text-right tabular-nums">{percent(item.proportion)}</td>
                <td className="p-3 text-right font-bold tabular-nums">{item.portions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Aceptación / tiempo" value={number(result.metrics?.acceptancePerTime, 3)} />
        <Metric label="Costo / comensal" value={money(result.metrics?.cost)} />
        <Metric label="Kcal" value={number(result.metrics?.kcal, 2)} />
        <Metric label="Carbohidratos" value={number(result.metrics?.carbs, 2)} />
        <Metric label="Proteína" value={number(result.metrics?.protein, 2)} />
        <Metric label="Sodio" value={number(result.metrics?.sodium, 2)} />
      </div>
      <div className="rounded-xl bg-white p-4 text-sm">
        <strong>{result.totalPortions} porciones</strong> para {diners} comensales · holgura {result.slack ?? 0}.
      </div>
      <div className="space-y-3">
        <SimplexTraceView trace={result.primaryTrace} title="Ver pivotes del símplex principal" />
        {result.tieBreakTrace ? <SimplexTraceView trace={result.tieBreakTrace} title="Ver pivotes del desempate por costo" /> : null}
      </div>
    </div>
  );
}

function StateAtSummary({ state }: { state: Awaited<ReturnType<typeof reconstructStateAt>> }) {
  const consome = calculateAcceptances(
    state.ratings,
    [{ id: 'S3' }],
    'C01',
    new Date(state.at),
    state.settings.surveyWindowWeeks,
  )[0];
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <Metric label="Comedores" value={String(state.diningRooms.length)} />
      <Metric label="Opciones" value={String(state.options.length)} />
      <Metric label="Encuestas hasta esa hora" value={state.ratings.length.toLocaleString('es-MX')} />
      <Metric label="Consomé C01" value={consome.noData ? '3,0 · sin datos' : number(consome.acceptance, 1)} />
      <div className="sm:col-span-4 text-xs text-stone-500">Eventos aplicados desde la instantánea: {state.appliedEvents}</div>
    </div>
  );
}
