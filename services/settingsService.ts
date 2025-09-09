
import { ALL_THERAPIST_ROLES } from '../constants';
const QUALIFICATIONS_STORAGE_KEY = 'allyScheduler.insuranceQualifications';

// Initial default data is now empty
const initialDefaultInsuranceQualifications: string[] = [];

let _qualifications: string[] = [];
const listeners: Array<(qualifications: string[]) => void> = [];

const loadQualifications = () => {
  try {
    const storedQualifications = localStorage.getItem(QUALIFICATIONS_STORAGE_KEY);
    _qualifications = storedQualifications ? JSON.parse(storedQualifications) : initialDefaultInsuranceQualifications;
  } catch (error) {
    console.warn("Error loading qualifications from localStorage:", error);
    _qualifications = initialDefaultInsuranceQualifications;
  }
};

const persistQualifications = () => {
  try {
    // Sort and deduplicate before persisting
    const uniqueSortedQualifications = Array.from(new Set(_qualifications)).sort((a,b) => a.localeCompare(b));
    _qualifications = uniqueSortedQualifications;
    localStorage.setItem(QUALIFICATIONS_STORAGE_KEY, JSON.stringify(_qualifications));
    listeners.forEach(listener => listener([..._qualifications]));
  } catch (error) {
    console.warn("Error persisting qualifications to localStorage:", error);
  }
};

loadQualifications();

export const getInsuranceQualifications = (): string[] => {
  return [..._qualifications];
};

export const updateInsuranceQualifications = (updatedQualifications: string[]): string[] => {
  // Replace the current list with the provided one, then sort and deduplicate.
  // This ensures that when a filtered list (due to a removal in UI) is passed,
  // the service correctly reflects the removal.
  _qualifications = Array.from(new Set(updatedQualifications)).sort((a,b) => a.localeCompare(b));
  persistQualifications();
  return [..._qualifications];
};

export const subscribeToInsuranceQualifications = (listener: (qualifications: string[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._qualifications]);

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

window.addEventListener('storage', (event) => {
  if (event.key === QUALIFICATIONS_STORAGE_KEY && event.newValue) {
    try {
      _qualifications = JSON.parse(event.newValue);
       _qualifications = Array.from(new Set(_qualifications)).sort((a,b) => a.localeCompare(b));
      listeners.forEach(listener => listener([..._qualifications]));
    } catch (error) {
      console.warn('Error parsing qualifications from storage event:', error);
    }
  }
});
