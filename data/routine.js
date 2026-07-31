// Rutina semanal basada en las notas del usuario
// Cada ejercicio: { id, name, sets, reps, weight(lb), unit, tag, target }
// tag: 'fire' (objetivo), 'strong' (logrado), 'cold' (peso alto / pr), 'sick' (débil), 'pr'
// target: string legible para mostrar el objetivo
//
// Nota: `muscles` y `cardio` NO vienen quemados por defecto. El usuario los
// añade desde el editor de rutinas. Cardio se maneja vía actividades físicas.

window.WEEK_ROUTINE = {
  1: { // Lunes
    title: 'Pierna',
    subtitle: 'Cuádriceps y gemelos',
    muscles: [],
    exercises: [
      { id: 'l1', name: 'Sentadilla con barra', sub: 'Back Squat', sets: 4, reps: 8, weight: 115, unit: 'lb', tag: 'fire', target: '4×8 @ 45+35 lb' },
      { id: 'l2', name: 'Prensa de piernas', sub: 'Leg Press', sets: 5, reps: 8, weight: 225, unit: 'lb', tag: 'strong', target: '5×8 @ 5 discos 45' },
      { id: 'l3', name: 'Sentadilla búlgara', sub: 'Bulgarian Split Squat · 1 mancuerna', sets: 3, reps: 8, weight: 30, unit: 'lb', tag: 'fire', target: '3×8 @ 30 lb' },
      { id: 'l4', name: 'Extensión de piernas', sub: 'Leg Extension · drop set', sets: 3, reps: 12, weight: 120, unit: 'lb', tag: 'fire', target: '3×12 @ 120 lb' },
      { id: 'l5', name: 'Elevación de talones', sub: 'Seated Calf Raise', sets: 4, reps: 15, weight: 100, unit: 'lb', tag: 'strong', target: '4×15 @ 100 lb' },
    ],
    cardio: null,
  },
  2: { // Martes
    title: 'Espalda y bíceps',
    subtitle: 'Tracción y curl',
    muscles: [],
    exercises: [
      { id: 'm1', name: 'Dominadas', sub: 'Pull-Ups · máquina inversa', sets: 3, reps: 8, weight: 60, unit: 'lb', tag: 'strong', target: '3×8 @ 60 lb (asist)' },
      { id: 'm2', name: 'Jalón al pecho', sub: 'Lat Pulldown · agarre cerrado', sets: 3, reps: 10, weight: 132, unit: 'lb', tag: 'fire', target: '3×10 @ 60 kg' },
      { id: 'm3', name: 'Remo cerrado', sub: 'Barbell Bent-Over Row', sets: 3, reps: 12, weight: 143, unit: 'lb', tag: 'strong', target: '3×12 @ 65 kg' },
      { id: 'm4', name: 'Remo a un brazo', sub: 'Single Arm Row', sets: 3, reps: 10, weight: 66, unit: 'lb', tag: 'fire', target: '3×10 @ 30 kg/brazo' },
      { id: 'm5', name: 'Curl predicador', sub: 'Preacher Curl · máquina', sets: 4, reps: 10, weight: 90, unit: 'lb', tag: 'strong', target: '4×10 @ 25 lb lado' },
      { id: 'm6', name: 'Curl concentrado', sub: 'Concentration Curl', sets: 3, reps: 10, weight: 30, unit: 'lb', tag: 'strong', target: '3×10 @ 30 lb' },
      { id: 'm7', name: 'Curl banco inclinado', sub: 'Incline Dumbbell Curl', sets: 3, reps: 8, weight: 20, unit: 'lb', tag: 'fire', target: '3×8 @ 20 lb' },
      { id: 'm8', name: 'Face Pulls', sub: 'Deltoide posterior · trapecio bajo', sets: 3, reps: 18, weight: 40, unit: 'lb', tag: 'fire', target: '3×15-20' },
      { id: 'm9', name: 'Polea en Y', sub: 'Parte lateral del bícep', sets: 3, reps: 10, weight: 25, unit: 'lb', tag: 'fire', target: '3×10 @ 25 lb' },
    ],
    cardio: null,
  },
  3: { // Miércoles
    title: 'Pecho y tríceps',
    subtitle: 'Empuje horizontal',
    muscles: [],
    exercises: [
      { id: 'w1', name: 'Press plano con barra', sub: 'Bench Press', sets: 3, reps: 12, weight: 70, unit: 'lb', tag: 'fire', target: '3×12 @ 35 lb/lado' },
      { id: 'w2', name: 'Press inclinado', sub: 'Incline Dumbbell Press', sets: 3, reps: 6, weight: 60, unit: 'lb', tag: 'strong', target: '3×6 @ 60 lb mancuernas' },
      { id: 'w3', name: 'Fondos en paralelas', sub: 'Dips · peso propio', sets: 3, reps: 5, weight: 0, unit: 'lb', tag: 'fire', target: '3×5 peso propio' },
      { id: 'w4', name: 'Aperturas máquina', sub: 'Chest Flys', sets: 3, reps: 10, weight: 120, unit: 'lb', tag: 'fire', target: '3×10 @ 120 lb' },
      { id: 'w5', name: 'Press tríceps polea', sub: 'Cable Pushdown', sets: 3, reps: 12, weight: 25, unit: 'lb', tag: 'fire', target: '3×12 @ 25 lb' },
      { id: 'w6', name: 'Tríceps sobre cabeza', sub: 'Overhead Triceps · polea', sets: 3, reps: 12, weight: 25, unit: 'lb', tag: 'fire', target: '3×12 @ 25 lb' },
      { id: 'w7', name: 'Curl francés tríceps', sub: 'French Press', sets: 4, reps: 10, weight: 50, unit: 'lb', tag: 'fire', target: '4 sets @ 50 lb' },
    ],
    cardio: null,
  },
  4: { // Jueves
    title: 'Pierna',
    subtitle: 'Isquios, glúteo y aductores',
    muscles: [],
    exercises: [
      { id: 'j1', name: 'Peso muerto rumano', sub: 'Romanian Deadlift', sets: 3, reps: 12, weight: 115, unit: 'lb', tag: 'fire', target: '3×12 @ 45+35 lb' },
      { id: 'j2', name: 'Curl isquiotibial', sub: 'Leg Curl máquina', sets: 3, reps: 12, weight: 120, unit: 'lb', tag: 'fire', target: '3×12 @ 120 lb' },
      { id: 'j3', name: 'Hip Thrust', sub: 'Con barra', sets: 3, reps: 10, weight: 115, unit: 'lb', tag: 'fire', target: '3×10 @ 45+35 lb' },
      { id: 'j4', name: 'Extensión de cadera', sub: 'Hip Extension máquina', sets: 3, reps: 12, weight: 35, unit: 'lb', tag: 'strong', target: '3×12 @ 35 lb' },
      { id: 'j5', name: 'Aducción máquina', sub: 'Afuera → adentro', sets: 3, reps: 15, weight: 120, unit: 'lb', tag: 'strong', target: '3×15 @ 120 lb' },
      { id: 'j6', name: 'Abducción máquina', sub: 'Adentro → afuera', sets: 3, reps: 15, weight: 120, unit: 'lb', tag: 'strong', target: '3×15 @ 120 lb' },
    ],
    cardio: null,
  },
  5: { // Viernes
    title: 'Tríceps y bíceps',
    subtitle: 'Brazo completo',
    muscles: [],
    exercises: [
      { id: 'v1', name: 'Curl con barra', sub: 'Barbell Curl', sets: 4, reps: 12, weight: 60, unit: 'lb', tag: 'strong', target: '4×12 @ 60 lb' },
      { id: 'v2', name: 'Curl francés', sub: 'French Press', sets: 4, reps: 12, weight: 60, unit: 'lb', tag: 'strong', target: '4×12 @ 60 lb' },
      { id: 'v3', name: 'Fondos máquina', sub: 'Dips asistidos', sets: 4, reps: 8, weight: 50, unit: 'lb', tag: 'strong', target: '4×8 @ 50 lb' },
      { id: 'v4', name: 'Curl predicador', sub: 'Preacher Curl', sets: 4, reps: 10, weight: 80, unit: 'lb', tag: 'strong', target: '4×10 @ 80 lb máquina' },
      { id: 'v5', name: 'Extensión polea', sub: 'Triceps Pushdown', sets: 3, reps: 12, weight: 55, unit: 'lb', tag: 'fire', target: '3×12 @ 55 lb' },
      { id: 'v6', name: 'Extensión sobre cabeza', sub: 'Overhead Extension', sets: 3, reps: 8, weight: 55, unit: 'lb', tag: 'fire', target: '3×8 @ 55 lb' },
      { id: 'v7', name: 'Curl banco inclinado', sub: 'Incline Dumbbell Curl', sets: 3, reps: 8, weight: 25, unit: 'lb', tag: 'fire', target: '3×8 @ 25 lb' },
      { id: 'v8', name: 'Curl martillo', sub: 'Hammer Curl', sets: 3, reps: 6, weight: 25, unit: 'lb', tag: 'fire', target: '3×6 @ 25 lb' },
    ],
    cardio: null,
  },
  6: { // Sábado
    title: 'Hombro y abdominales',
    subtitle: 'Core y deltoides',
    muscles: [],
    exercises: [
      { id: 's1', name: 'Press militar Smith', sub: 'Barbell Overhead Press', sets: 4, reps: 8, weight: 108, unit: 'lb', tag: 'fire', target: '4×8 @ 49 kg' },
      { id: 's2', name: 'Elevaciones laterales', sub: 'Dumbbell Lateral Raise', sets: 4, reps: 15, weight: 25, unit: 'lb', tag: 'fire', target: '4×15 @ 25 lb' },
      { id: 's3', name: 'Remo al cuello polea', sub: 'Upright Row', sets: 4, reps: 15, weight: 44, unit: 'lb', tag: 'fire', target: '4×15 @ 20 kg' },
      { id: 's4', name: 'Crunch abdominal', sub: 'Ab Crunch Machine', sets: 4, reps: 20, weight: 99, unit: 'lb', tag: 'fire', target: '4×20 @ 45 kg' },
      { id: 's5', name: 'Elevación de piernas', sub: 'Leg Raises · peso corporal', sets: 5, reps: 10, weight: 0, unit: 'lb', tag: 'fire', target: '5×10 peso propio' },
      { id: 's6', name: 'Giro ruso', sub: 'Oblicuos · pies elevados', sets: 3, reps: 20, weight: 25, unit: 'lb', tag: 'fire', target: '3×20 @ 25 lb' },
      { id: 's7', name: 'Plancha', sub: 'Plank', sets: 3, reps: 120, weight: 0, unit: 's', tag: 'fire', target: '3 × 2 min' },
    ],
    cardio: null,
  },
  0: { // Domingo - descanso
    title: 'Descanso',
    subtitle: 'Día libre',
    muscles: [],
    exercises: [],
    cardio: null,
    rest: true,
  },
};

window.DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
window.MONTH_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Mapa global id→ejercicio para lookups O(1) en toda la app
window._allExMeta = Object.values(window.WEEK_ROUTINE)
  .flatMap(d => d.exercises || [])
  .reduce((m, e) => { m[e.id] = e; return m; }, {});

// Catálogo de actividades físicas por defecto.
// kcalPerMin: gasto calórico por MINUTO para persona ~70 kg (basado en tablas MET).
// Los 4 primeros son actividades cardio destacadas: se muestran primero en el
// selector "Agregar actividad" y con quick-add en "Agregar ejercicio".
// Valores kcal/min según tablas MET estándar (compendium of physical activities):
//   Trotar (jog ~8 km/h, MET 7.0)     → ~8 kcal/min
//   Correr (run ~10 km/h, MET 9.8)    → ~11 kcal/min
//   Nadar (freestyle mod, MET 8.3)    → ~10 kcal/min
//   Patinar (in-line, MET 7.5)        → ~9 kcal/min
window.FEATURED_ACTIVITY_IDS = ['run', 'sprint', 'swim', 'skate'];
window.DEFAULT_ACTIVITIES = [
  { id: 'run',    name: 'Trotar',        icon: '🏃', type: 'time',      unit: 'min',   kcalPerMin: 8,  defaultVal: 20 },
  { id: 'sprint', name: 'Correr',        icon: '🏃‍♂️', type: 'time',    unit: 'min',   kcalPerMin: 11, defaultVal: 15 },
  { id: 'swim',   name: 'Nadar',         icon: '🏊', type: 'time',      unit: 'min',   kcalPerMin: 10, defaultVal: 30 },
  { id: 'skate',  name: 'Patinar',       icon: '🛼', type: 'time',      unit: 'min',   kcalPerMin: 9,  defaultVal: 30 },
  { id: 'walk',   name: 'Caminar',       icon: '🚶', type: 'time',      unit: 'min',   kcalPerMin: 4,  defaultVal: 20 },
  { id: 'bike',   name: 'Bicicleta',     icon: '🚴', type: 'time',      unit: 'min',   kcalPerMin: 8,  defaultVal: 30 },
  { id: 'dance',  name: 'Bailar',        icon: '💃', type: 'time',      unit: 'min',   kcalPerMin: 7,  defaultVal: 30 },
  { id: 'jump',   name: 'Saltar cuerda', icon: '🪢', type: 'time',      unit: 'min',   kcalPerMin: 12, defaultVal: 10 },
  { id: 'yoga',   name: 'Yoga',          icon: '🧘', type: 'time',      unit: 'min',   kcalPerMin: 3,  defaultVal: 30 },
  { id: 'plank',  name: 'Plank',         icon: '🏋️', type: 'sets_reps', unit: 's',     kcalPerMin: 4,  defaultVal: 30, sets: 3 },
  { id: 'pushup', name: 'Lagartijas',    icon: '💪', type: 'sets_reps', unit: 'reps',  kcalPerMin: 7,  defaultVal: 15, sets: 3 },
  { id: 'hiit',   name: 'HIIT',          icon: '⚡', type: 'rounds',    unit: 'rondas',kcalPerMin: 12, defaultVal: 4 },
];

window.ACTIVITY_VALUE_TYPES = [
  { key: 'time',       label: 'Tiempo',        unit: 'min'    },
  { key: 'sets_reps',  label: 'Series × Reps', unit: 'reps'   },
  { key: 'rounds',     label: 'Rondas',        unit: 'rondas' },
  { key: 'distance',   label: 'Distancia',     unit: 'km'     },
  { key: 'sets_time',  label: 'Series × Tiempo', unit: 's'    },
  { key: 'bodyweight', label: 'Peso corporal', unit: 'bw'     },
];
