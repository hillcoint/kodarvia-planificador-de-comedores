import { TEST_MENU_OPTIONS } from '../domain/menu/fixtures';
import type { MenuOption, MenuTime } from '../domain/menu/types';
import type {
  AppEvent,
  AppSettings,
  AppUser,
  DailySnapshot,
  DemoSeed,
  DiningRoom,
  RatingRecord,
  StoredMenu,
} from './types';

export const DEMO_SEED = 5537;
export const DEMO_REFERENCE_DATE = '2026-11-14T12:00:00.000Z';

export function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const EXPANDED_NAMES: Record<MenuTime, string[]> = {
  soup: [
    'Sopa de lentejas', 'Caldo tlalpeño', 'Sopa de tortilla', 'Crema de elote',
    'Sopa de verduras', 'Caldo de pollo', 'Crema de poblano', 'Sopa de arroz',
    'Caldo de hongos', 'Crema de zanahoria', 'Sopa de garbanzo', 'Consomé de res',
  ],
  main: [
    'Tinga de res', 'Chiles rellenos de queso horneados', 'Pollo en salsa verde',
    'Picadillo de res', 'Enchiladas de pollo', 'Albóndigas al chipotle',
    'Cerdo en adobo', 'Pescado al limón', 'Rajas con pollo', 'Carne deshebrada',
    'Tortitas de atún', 'Pollo con nopales',
  ],
  side: [
    'Calabacitas a la mexicana', 'Puré de papa', 'Arroz blanco', 'Frijoles bayos',
    'Ensalada de col', 'Verduras al vapor', 'Pasta poblana', 'Papas cambray',
    'Ejotes con jitomate', 'Ensalada de pepino', 'Elote con calabaza', 'Arroz integral',
  ],
  water: [
    'Agua de horchata sin azúcar', 'Agua de limón con chía', 'Agua de tamarindo',
    'Agua de piña', 'Agua de sandía', 'Agua de naranja con hierbabuena',
    'Agua de guayaba', 'Agua de melón', 'Agua de jamaica sin azúcar',
    'Agua de limón sin azúcar', 'Agua de fresa', 'Agua de mango',
  ],
};

function expandedOption(
  time: MenuTime,
  name: string,
  index: number,
  random: () => number,
): MenuOption {
  const prefix = { soup: 'SX', main: 'FX', side: 'GX', water: 'AX' }[time];
  const ranges = {
    soup: { kcal: [90, 240], carbs: [8, 38], protein: [3, 14], sodium: [180, 720], cost: [8, 20] },
    main: { kcal: [260, 520], carbs: [7, 48], protein: [18, 40], sodium: [280, 900], cost: [20, 52] },
    side: { kcal: [40, 250], carbs: [5, 45], protein: [2, 12], sodium: [80, 450], cost: [4, 15] },
    water: { kcal: [10, 130], carbs: [2, 30], protein: [0, 1], sodium: [5, 30], cost: [3, 8] },
  }[time];
  const pick = ([min, max]: number[]) => Math.round((min + random() * (max - min)) * 10) / 10;
  const tags: string[] = [];
  if (/queso|crema/i.test(name)) tags.push('lácteo');
  if (/pescado|atún/i.test(name)) tags.push('pescado');
  if (time === 'water' && !/sin azúcar/i.test(name) && random() < 0.55) tags.push('azúcar');

  return {
    id: `${prefix}${String(index + 1).padStart(2, '0')}`,
    name,
    time,
    kcal: pick(ranges.kcal),
    carbs: pick(ranges.carbs),
    protein: pick(ranges.protein),
    sodium: pick(ranges.sodium),
    cost: pick(ranges.cost),
    acceptance: Math.round((3.1 + random() * 1.6) * 10) / 10,
    tags,
  };
}

function generateOptions(random: () => number): MenuOption[] {
  const expanded = (Object.entries(EXPANDED_NAMES) as [MenuTime, string[]][]).flatMap(([time, names]) =>
    names.map((name, index) => expandedOption(time, name, index, random)),
  );
  return [...TEST_MENU_OPTIONS.map((option) => ({ ...option, tags: [...option.tags] })), ...expanded];
}

const DINING_ROOM_NAMES = [
  'Corporativo Reforma', 'Torre Polanco', 'Parque Industrial Norte', 'Centro Logístico Vallejo',
  'Campus Santa Fe', 'Oficinas Insurgentes', 'Planta Iztapalapa', 'Centro Operativo Tlalpan',
  'Torre Periférico', 'Corporativo Coyoacán', 'Hub Azcapotzalco', 'Centro Administrativo Sur',
  'Oficinas Del Valle', 'Estudio Roma Norte',
];

function generateDiningRooms(random: () => number): DiningRoom[] {
  return DINING_ROOM_NAMES.map((name, index) => {
    const diners = index === 13 ? 23 : Math.round(40 + random() * 360);
    return {
      id: `C${String(index + 1).padStart(2, '0')}`,
      name,
      diners,
      budget: index === 0 ? 45 : Math.round((50 + random() * 40) * 100) / 100,
      serviceDays: [1, 2, 3, 4, 5],
      diabetesPercent: Math.round((5 + random() * 7) * 10) / 10,
      scheduleStart: '13:00',
      scheduleEnd: '16:00',
      active: true,
      updatedAt: DEMO_REFERENCE_DATE,
      updatedBy: 'u-operaciones',
      version: 1,
    };
  });
}

function generateRatings(
  random: () => number,
  options: MenuOption[],
  rooms: DiningRoom[],
): RatingRecord[] {
  const end = new Date(DEMO_REFERENCE_DATE).getTime();
  const span = 52 * 7 * 24 * 60 * 60 * 1000;
  const ratings: RatingRecord[] = [];

  for (let index = 0; index < 45000; index += 1) {
    const option = options[Math.floor(random() * options.length)];
    const room = rooms[Math.floor(random() * rooms.length)];
    const value = clamp(Math.round(option.acceptance + gaussian(random) * 0.8), 1, 5);
    const date = new Date(end - random() * span).toISOString();
    ratings.push({
      id: `R${String(index + 1).padStart(5, '0')}`,
      diningRoomId: room.id,
      optionId: option.id,
      value,
      date,
      userId: random() < 0.5 ? 'u-nutricion' : 'u-operaciones',
    });
  }
  return ratings;
}

function generateMenus(random: () => number, rooms: DiningRoom[]): StoredMenu[] {
  const end = new Date(DEMO_REFERENCE_DATE).getTime();
  const day = 24 * 60 * 60 * 1000;
  return Array.from({ length: 3600 }, (_, index) => {
    const room = rooms[Math.floor(random() * rooms.length)];
    const date = new Date(end - Math.floor(random() * 364) * day).toISOString().slice(0, 10);
    const line = random() < 0.82 ? 'general' : 'diabetes';
    return {
      id: `M${String(index + 1).padStart(4, '0')}`,
      diningRoomId: room.id,
      date,
      line,
      status: 'calculated',
      computedAt: `${date}T10:30:00.000Z`,
      sourceVersion: 1,
      acceptancePerTime: Math.round((3.2 + random() * 1.5) * 1000) / 1000,
      cost: Math.round((42 + random() * 30) * 100) / 100,
      kcal: Math.round((670 + random() * 150) * 100) / 100,
      carbs: Math.round((55 + random() * 35) * 100) / 100,
      protein: Math.round((31 + random() * 18) * 100) / 100,
      sodium: Math.round((1050 + random() * 430) * 100) / 100,
      slack: Math.floor(random() * 5),
    } satisfies StoredMenu;
  });
}

function generateEvents(random: () => number, rooms: DiningRoom[], options: MenuOption[]): AppEvent[] {
  const end = new Date(DEMO_REFERENCE_DATE).getTime();
  const span = 52 * 7 * 24 * 60 * 60 * 1000;
  return Array.from({ length: 3000 }, (_, index) => {
    const editRoom = random() < 0.55;
    const entity = editRoom
      ? rooms[Math.floor(random() * rooms.length)]
      : options[Math.floor(random() * options.length)];
    return {
      id: `E${String(index + 1).padStart(4, '0')}`,
      timestamp: new Date(end - random() * span).toISOString(),
      userId: random() < 0.45 ? 'u-nutricion' : 'u-operaciones',
      role: random() < 0.45 ? 'nutritionist' : 'operations',
      entityType: editRoom ? 'diningRoom' : 'option',
      entityId: entity.id,
      field: editRoom ? (random() < 0.5 ? 'budget' : 'diners') : (random() < 0.5 ? 'sodium' : 'cost'),
      previousValue: editRoom ? Math.round(45 + random() * 40) : Math.round(5 + random() * 800),
      nextValue: editRoom ? Math.round(45 + random() * 40) : Math.round(5 + random() * 800),
    };
  });
}

export function generateDemoSeed(): DemoSeed {
  const random = mulberry32(DEMO_SEED);
  const options = generateOptions(random);
  const diningRooms = generateDiningRooms(random);
  const ratings = generateRatings(random, options, diningRooms);
  const menus = generateMenus(random, diningRooms);
  const events = generateEvents(random, diningRooms, options);

  const settings: AppSettings = {
    id: 'settings',
    minKcal: 650,
    maxKcal: 850,
    minProtein: 30,
    maxSodium: 1500,
    maxCarbsDiabetes: 70,
    optionCap: 0.6,
    optionCapThreshold: 30,
    surveyWindowWeeks: 4,
    centralCapacity: 3200,
    adminKey: [1, 2, 3, 4].join(''),
    version: 1,
    updatedAt: DEMO_REFERENCE_DATE,
    updatedBy: 'u-admin',
  };

  const users: AppUser[] = [
    { id: 'u-nutricion', name: 'Ana · Nutrióloga', role: 'nutritionist', active: true },
    { id: 'u-operaciones', name: 'Luis · Operación', role: 'operations', active: true },
    { id: 'u-admin', name: 'Administración', role: 'admin', active: true },
  ];

  const snapshots: DailySnapshot[] = [{
    id: 'snapshot-demo',
    date: DEMO_REFERENCE_DATE.slice(0, 10),
    createdAt: DEMO_REFERENCE_DATE,
    state: {
      diningRooms: diningRooms.map((room) => ({ ...room })),
      options: options.map((option) => ({ ...option, tags: [...option.tags] })),
      settings: { ...settings },
    },
  }];

  return {
    options,
    diningRooms,
    ratings,
    menus,
    events,
    snapshots,
    settings: [settings],
    users,
  };
}
