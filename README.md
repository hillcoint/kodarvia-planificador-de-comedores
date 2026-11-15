# Manyar · Planificador de comedores empresariales

Aplicación web para planificar menús diarios de comedores empresariales. Para cada comedor y línea (General / Diabetes) calcula la proporción de comensales que recibe cada opción de sopa, plato fuerte, guarnición y agua, maximizando la aceptación sin superar presupuesto ni límites nutricionales.

Preview pública: https://manyar-meal-planner.lovable.app/

Repositorio: https://github.com/hillcoint/kodarvia-planificador-de-comedores

## Stack

- React 19 + TypeScript
- Vite / TanStack Start
- Tailwind CSS
- IndexedDB
- Web Workers
- BroadcastChannel
- Vitest + cobertura V8
- Lovable como entorno de preview

No usa Supabase, Firebase, backend ni librerías de optimización.

## Arranque local

Requisitos: Node.js 22 recomendado y npm.

```bash
git clone https://github.com/hillcoint/kodarvia-planificador-de-comedores.git
cd kodarvia-planificador-de-comedores
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Tests y cobertura

Tests funcionales y de rendimiento:

```bash
npm run test:quick
```

Suite con cobertura del motor:

```bash
npm test
```

El informe HTML se genera en:

```text
coverage/index.html
```

El pipeline de GitHub Actions ejecuta instalación, tests funcionales/rendimiento, cobertura y build.

## Datos de ejemplo

La primera vez que se abre la aplicación se inicializa IndexedDB con una semilla determinista:

```text
5537
```

Se cargan:

- 14 comedores empresariales.
- 60 opciones de menú: 12 casos base + 48 opciones ampliadas.
- 45.000 calificaciones de encuestas de 52 semanas.
- 3.600 menús históricos.
- Aproximadamente 3.000 eventos de historial.
- Usuarios de ejemplo para Nutrióloga, Operación y Administración.
- Capacidad central diaria de 3.200 bandejas.

La generación está en:

```text
src/data/seed.ts
```

Las 12 opciones usadas por los casos obligatorios están en:

```text
src/domain/menu/fixtures.ts
```

Para sustituir los datos de ejemplo de origen, modificá esos generadores/fixtures y luego usá **Restaurar datos de ejemplo** desde `/admin`.

## Restaurar la demo

En `/admin` está el botón **Restaurar datos de ejemplo**.

La restauración:

1. borra la base IndexedDB `manyar-planner`;
2. vuelve a crear los stores;
3. regenera todos los datos con la semilla fija 5537.

Si IndexedDB está bloqueado por otra pestaña, la aplicación muestra un aviso y pide cerrar las otras pestañas antes de restaurar.

## IndexedDB

Stores principales:

- `options`
- `diningRooms`
- `ratings`
- `menus`
- `events`
- `snapshots`
- `settings`
- `users`

Los stores de mayor volumen incluyen índices por comedor, opción, fecha, entidad y usuario según corresponda.

La capa de persistencia está en:

```text
src/data/db.ts
```

## Cómo se modela una bandeja

Cada opción del catálogo tiene una variable continua:

```text
s_j = proporción de comensales que recibe la opción j
```

Para cada tiempo (sopa, plato fuerte, guarnición y agua):

```text
Σ s_j = 1
```

El tope normal por opción es 0,60 cuando la línea tiene 30 comensales o más. Con menos de 30 comensales el tope es 1,00.

La bandeja promedio se calcula con las proporciones sin redondear. Los porcentajes visibles son solo presentación.

Restricciones generales:

- 650 ≤ kcal ≤ 850
- proteína ≥ 30 g
- sodio ≤ 1.500 mg
- costo ≤ presupuesto/comensal

Línea Diabetes:

- mantiene todas las restricciones generales;
- carbohidratos ≤ 70 g;
- excluye opciones con etiqueta `azúcar`.

## Aceptación de encuestas

La aceptación de cada opción se calcula por comedor usando las calificaciones de las últimas cuatro semanas.

- Calificaciones válidas: enteros 1–5.
- Promedio redondeado a un decimal con half-up.
- Sin datos recientes: aceptación 3,0 y estado `sin datos`.

El recálculo masivo sobre las 45.000 respuestas se ejecuta dentro del Web Worker.

## Motor símplex

El motor está escrito en TypeScript sin librerías de optimización:

```text
src/domain/optimization/simplex.ts
```

Implementa:

- símplex de dos fases;
- variables de holgura, exceso y artificiales;
- regla de Bland para elegir variable entrante;
- tolerancia numérica `1e-9`;
- detección de inviabilidad;
- detección de óptimos alternativos;
- registro de tabla inicial, cada pivote y tabla final.

El planificador construye el modelo en:

```text
src/domain/menu/planner.ts
```

## Objetivo y desempate

Primer modelo:

```text
max Σ aceptación_j · s_j
```

La aceptación mostrada como promedio por tiempo es:

```text
objetivo / 4
```

Si el primer modelo tiene óptimos alternativos, se ejecuta un segundo modelo que conserva la aceptación óptima y minimiza el costo.

La interfaz indica que hubo óptimos alternativos y permite consultar los pivotes reales tanto del modelo principal como del desempate.

## Diagnóstico cuando el presupuesto no alcanza

Si el modelo con presupuesto es inviable, no se genera un menú parcial.

Se ejecuta un segundo modelo:

```text
min costo
```

manteniendo las restricciones nutricionales y retirando únicamente el límite presupuestario.

Si existe solución nutricional, se informa el costo mínimo necesario. Si tampoco existe, se informa que las opciones disponibles no permiten construir una bandeja válida aunque aumente el presupuesto.

## Porciones a cocinar

Para cada opción:

```text
porcionesExactas = s_j × comensales
```

Antes del techo se redondea a seis decimales para evitar errores de coma flotante.

Ejemplos cubiertos por tests:

- 90,69 → 91
- 108 exactas → 108
- 108,0000000002 → 108
- proporción 0,0000004 → 0 porciones

La holgura de producción es:

```text
totalPorciones - (4 × comensales)
```

## Web Worker y rendimiento

Los cálculos pesados se ejecutan fuera del hilo de interfaz:

```text
src/workers/planner.worker.ts
```

Incluye:

- símplex;
- cálculo de ambas líneas;
- cálculo de los 14 comedores;
- recálculo de aceptación.

La suite funcional verifica el objetivo de menos de 2 segundos para el cálculo diario de la semilla completa y menos de 1 segundo para el recálculo de aceptaciones.

## Historial, deshacer/rehacer y “Estado al…”

Cada cambio guarda un evento con:

- usuario;
- rol;
- fecha/hora;
- entidad;
- campo;
- valor anterior;
- valor nuevo.

Se conservan hasta 50 pasos operativos para deshacer/rehacer.

La vista **Estado al…** reconstruye el estado a partir de la instantánea anterior y los eventos posteriores hasta la fecha/hora indicada. También filtra las encuestas por fecha y recalcula el menú que se habría obtenido con los datos disponibles en ese momento.

## Dos pestañas y conflictos

Se usa `BroadcastChannel` para avisar cambios entre pestañas.

Reglas:

- límites nutricionales y opciones: Nutrióloga prevalece sobre Operación;
- mismo rol: gana la edición más reciente;
- presupuesto y comensales: gana siempre la edición más reciente.

Cuando hay conflicto se muestran ambos valores, se registra el conflicto en el historial y la interfaz permite elegir explícitamente el otro valor.

## Hoja de producción

La pantalla Producción muestra:

- comedor;
- línea General / Diabetes;
- opción;
- porcentaje;
- porciones;
- holgura;
- etiqueta para bandejas Diabetes.

Tiene CSS específico de impresión para ocultar navegación y botones.

## Administración

Ruta:

```text
/admin
```

La clave de demostración por defecto es:

```text
1234
```

Se define en:

```text
src/config.ts
```

Para cambiarla, modificá `ADMIN_KEY` y recompilá la aplicación.

**Esta clave no es autenticación real.** Está incluida en el frontend y puede inspeccionarse desde el navegador. Kodarvia deberá sustituirla por autenticación real si el proyecto pasa a producción.

Desde `/admin` se pueden editar:

- límites nutricionales;
- tope por opción;
- umbral de comensales;
- ventana temporal de encuesta;
- capacidad central;
- usuarios y roles.

También se puede exportar CSV y restaurar la semilla.

## Estructura principal

```text
src/
├─ components/manyar/       interfaz y visualización de pivotes
├─ data/                    IndexedDB, semilla, eventos y mutaciones
├─ domain/menu/             construcción y resolución del planificador
├─ domain/optimization/     símplex de dos fases
├─ domain/ratings/          aceptación de encuestas
├─ workers/                 Web Worker y cliente
├─ routes/                  rutas principal y /admin
└─ config.ts                configuración simple de frontend
```

## Entorno de demostración

Todo el proyecto funciona en el navegador. Los datos de la demo son locales al navegador que abre la aplicación y se almacenan en IndexedDB.

Kodarvia se encargará posteriormente de backend, autenticación real, conexiones externas, dominio, políticas legales y puesta en producción.
