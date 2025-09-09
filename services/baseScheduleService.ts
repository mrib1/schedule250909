
import { BaseScheduleConfig, DayOfWeek, ScheduleEntry, GeneratedSchedule } from '../types';

const BASESCHEDULES_STORAGE_KEY = 'allyScheduler.baseSchedules';
const generateScheduleEntryId = () => `schedEntry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Initial default data is now empty
const initialDefaultBaseSchedules: BaseScheduleConfig[] = [];

let _baseSchedules: BaseScheduleConfig[] = [];
const listeners: Array<(schedules: BaseScheduleConfig[]) => void> = [];

const ensureEntryIds = (schedule: GeneratedSchedule | null): GeneratedSchedule | null => {
  if (!schedule) return null;
  return schedule.map(entry => ({ ...entry, id: entry.id || generateScheduleEntryId() }));
};

const loadBaseSchedules = () => {
  try {
    const storedBaseSchedules = localStorage.getItem(BASESCHEDULES_STORAGE_KEY);
    const parsedSchedules: BaseScheduleConfig[] = storedBaseSchedules ? JSON.parse(storedBaseSchedules) : initialDefaultBaseSchedules;
    _baseSchedules = parsedSchedules.map(bs => ({
        ...bs,
        schedule: ensureEntryIds(bs.schedule)
    }));
  } catch (error) {
    console.warn("Error loading base schedules from localStorage:", error);
    _baseSchedules = initialDefaultBaseSchedules.map(bs => ({
        ...bs,
        schedule: ensureEntryIds(bs.schedule)
    }));
  }
};

const persistBaseSchedules = () => {
  try {
    const schedulesToPersist = _baseSchedules.map(bs => ({
        ...bs,
        schedule: ensureEntryIds(bs.schedule)
    }));
    localStorage.setItem(BASESCHEDULES_STORAGE_KEY, JSON.stringify(schedulesToPersist));
    // Notify listeners with schedule that also has ensured IDs
    listeners.forEach(listener => listener([..._baseSchedules.map(bs => ({...bs, schedule: ensureEntryIds(bs.schedule)}))]));
  } catch (error) {
    console.warn("Error persisting base schedules to localStorage:", error);
  }
};

loadBaseSchedules();

export const getBaseSchedules = (): BaseScheduleConfig[] => {
  return [..._baseSchedules.map(bs => ({...bs, schedule: ensureEntryIds(bs.schedule)}))];
};

export const updateBaseSchedules = (updatedSchedules: BaseScheduleConfig[]): BaseScheduleConfig[] => {
  _baseSchedules = updatedSchedules.map(bs => ({...bs, schedule: ensureEntryIds(bs.schedule)}));
  persistBaseSchedules();
  return [..._baseSchedules];
};

export const subscribeToBaseSchedules = (listener: (schedules: BaseScheduleConfig[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._baseSchedules.map(bs => ({...bs, schedule: ensureEntryIds(bs.schedule)}))]);

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

window.addEventListener('storage', (event) => {
  if (event.key === BASESCHEDULES_STORAGE_KEY && event.newValue) {
    try {
      const parsedSchedules: BaseScheduleConfig[] = JSON.parse(event.newValue);
      _baseSchedules = parsedSchedules.map(bs => ({...bs, schedule: ensureEntryIds(bs.schedule)}));
      listeners.forEach(listener => listener([..._baseSchedules]));
    } catch (error) {
      console.warn('Error parsing base schedules from storage event:', error);
    }
  }
});
