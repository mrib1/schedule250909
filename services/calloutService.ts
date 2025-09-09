import { Callout } from '../types';
import { timeToMinutes } from '../utils/validationService';

const CALLOUTS_STORAGE_KEY = 'allyScheduler.callouts';

let _callouts: Callout[] = [];
const listeners: Array<(callouts: Callout[]) => void> = [];

const loadCallouts = () => {
  try {
    const storedCallouts = localStorage.getItem(CALLOUTS_STORAGE_KEY);
    _callouts = storedCallouts ? JSON.parse(storedCallouts) : [];
  } catch (error) {
    console.warn("Error loading callouts from localStorage:", error);
    _callouts = [];
  }
};

const persistCallouts = () => {
  try {
    // Sort before persisting
    const sortedCallouts = [..._callouts].sort((a,b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime() || 
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    _callouts = sortedCallouts;
    localStorage.setItem(CALLOUTS_STORAGE_KEY, JSON.stringify(_callouts));
    listeners.forEach(listener => listener([..._callouts]));
  } catch (error) {
    console.warn("Error persisting callouts to localStorage:", error);
  }
};

loadCallouts();

export const getCallouts = (): Callout[] => {
  return [..._callouts];
};

export const addCalloutEntry = (newCallout: Omit<Callout, 'id'>): Callout[] => {
  const calloutWithId: Callout = { ...newCallout, id: `callout-${Date.now()}` };
  _callouts = [..._callouts, calloutWithId];
  persistCallouts(); // This will also sort
  return [..._callouts];
};

export const removeCalloutEntry = (calloutId: string): Callout[] => {
  _callouts = _callouts.filter(co => co.id !== calloutId);
  persistCallouts();
  return [..._callouts];
};

// If you need to update callouts (not currently implemented in UI but good for service layer)
export const updateCalloutEntry = (updatedCallout: Callout): Callout[] => {
  _callouts = _callouts.map(co => (co.id === updatedCallout.id ? updatedCallout : co));
  persistCallouts(); // This will also sort
  return [..._callouts];
};


export const subscribeToCallouts = (listener: (callouts: Callout[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._callouts]);

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

window.addEventListener('storage', (event) => {
  if (event.key === CALLOUTS_STORAGE_KEY && event.newValue) {
    try {
      _callouts = JSON.parse(event.newValue);
      // Ensure sorting if loaded from storage event, as other tab might not sort
       _callouts.sort((a,b) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime() || 
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );
      listeners.forEach(listener => listener([..._callouts]));
    } catch (error) {
      console.warn('Error parsing callouts from storage event:', error);
    }
  }
});
