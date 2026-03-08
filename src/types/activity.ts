export type BuiltInCategory = 
  | 'work'
  | 'coding'
  | 'meetings'
  | 'meals'
  | 'exercise'
  | 'sleep'
  | 'leisure'
  | 'social'
  | 'commute'
  | 'personal_care'
  | 'break'
  | 'other';

// ActivityCategory can be a built-in or any custom string
export type ActivityCategory = BuiltInCategory | (string & {});

export type ActivityIntent = 'start' | 'stop' | 'switch';

export interface Activity {
  id: string;
  description: string;
  category: ActivityCategory;
  startTime: string; // ISO string in IST
  endTime?: string; // ISO string in IST
  duration?: number; // in minutes
  isOngoing: boolean;
}

export interface DayData {
  date: string; // YYYY-MM-DD
  activities: Activity[];
}

export interface ParsedActivity {
  intent: ActivityIntent;
  description: string;
  category: ActivityCategory;
  startTime?: string; // ISO string if user specified a time
}

export interface DailyAnalysis {
  summary: string;
  redFlags: string[];
  greenFlags: string[];
  recommendations: string[];
}

const BUILT_IN_COLORS: Record<BuiltInCategory, string> = {
  work: 'hsl(var(--chart-1))',
  coding: 'hsl(var(--chart-2))',
  meetings: 'hsl(var(--chart-3))',
  meals: 'hsl(var(--chart-4))',
  exercise: 'hsl(var(--chart-5))',
  sleep: 'hsl(220 70% 50%)',
  leisure: 'hsl(280 70% 60%)',
  social: 'hsl(330 70% 60%)',
  commute: 'hsl(45 70% 50%)',
  personal_care: 'hsl(180 60% 50%)',
  break: 'hsl(150 60% 50%)',
  other: 'hsl(0 0% 60%)',
};

const BUILT_IN_LABELS: Record<BuiltInCategory, string> = {
  work: 'Work',
  coding: 'Coding',
  meetings: 'Meetings',
  meals: 'Meals',
  exercise: 'Exercise',
  sleep: 'Sleep',
  leisure: 'Leisure',
  social: 'Social',
  commute: 'Commute',
  personal_care: 'Personal Care',
  break: 'Break',
  other: 'Other',
};

// Custom categories stored in localStorage
const CUSTOM_CATEGORIES_KEY = 'time-tracker-custom-categories';

export interface CustomCategory {
  key: string;
  label: string;
  color: string;
}

// Predefined palette for custom categories
const CUSTOM_PALETTE = [
  'hsl(10 70% 55%)', 'hsl(80 60% 45%)', 'hsl(200 80% 50%)',
  'hsl(300 60% 55%)', 'hsl(160 70% 45%)', 'hsl(240 60% 60%)',
  'hsl(350 80% 55%)', 'hsl(120 50% 50%)', 'hsl(270 70% 55%)',
  'hsl(60 70% 50%)',
];

export const getCustomCategories = (): CustomCategory[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const addCustomCategory = (label: string): CustomCategory => {
  const customs = getCustomCategories();
  const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const existing = customs.find(c => c.key === key);
  if (existing) return existing;

  const color = CUSTOM_PALETTE[customs.length % CUSTOM_PALETTE.length];
  const newCat: CustomCategory = { key, label, color };
  customs.push(newCat);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customs));
  return newCat;
};

export const removeCustomCategory = (key: string) => {
  const customs = getCustomCategories().filter(c => c.key !== key);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customs));
};

// Dynamic accessors that include custom categories
export const getCategoryColor = (category: ActivityCategory): string => {
  if (category in BUILT_IN_COLORS) return BUILT_IN_COLORS[category as BuiltInCategory];
  const custom = getCustomCategories().find(c => c.key === category);
  return custom?.color || 'hsl(0 0% 60%)';
};

export const getCategoryLabel = (category: ActivityCategory): string => {
  if (category in BUILT_IN_LABELS) return BUILT_IN_LABELS[category as BuiltInCategory];
  const custom = getCustomCategories().find(c => c.key === category);
  return custom?.label || category;
};

export const getAllCategoryEntries = (): [string, string][] => {
  const entries: [string, string][] = Object.entries(BUILT_IN_LABELS);
  getCustomCategories().forEach(c => entries.push([c.key, c.label]));
  return entries;
};

// Keep these for backward compat but they only have built-in
export const CATEGORY_COLORS: Record<string, string> = new Proxy(BUILT_IN_COLORS as Record<string, string>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return getCategoryColor(prop);
  }
});

export const CATEGORY_LABELS: Record<string, string> = new Proxy(BUILT_IN_LABELS as Record<string, string>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return getCategoryLabel(prop);
  }
});
