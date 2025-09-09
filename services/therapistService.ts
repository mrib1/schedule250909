
import { Therapist, AlliedHealthServiceType } from '../types';

const THERAPISTS_STORAGE_KEY = 'allyScheduler.therapists';

// Initial default data is now empty
const initialDefaultTherapists: Omit<Therapist, 'id'>[] = [];


let _therapists: Therapist[] = [];
const listeners: Array<(therapists: Therapist[]) => void> = [];

const loadTherapists = () => {
  try {
    const storedTherapists = localStorage.getItem(THERAPISTS_STORAGE_KEY);
    if (storedTherapists) {
      _therapists = JSON.parse(storedTherapists).map((t: any) => {
        // Ensure canCoverIndirect is removed if it exists from old data
        const { canCoverIndirect, ...rest } = t;
        return rest;
      });
    } else {
      _therapists = initialDefaultTherapists.map((t, index) => ({ ...t, id: `t${Date.now()}-${index}` }));
    }
  } catch (error) {
    console.warn("Error loading therapists from localStorage:", error);
    _therapists = initialDefaultTherapists.map((t, index) => ({ ...t, id: `t${Date.now()}-${index}` }));
  }
};

const persistTherapists = () => {
  try {
    localStorage.setItem(THERAPISTS_STORAGE_KEY, JSON.stringify(_therapists));
    listeners.forEach(listener => listener([..._therapists]));
  } catch (error) {
    console.warn("Error persisting therapists to localStorage:", error);
  }
};

loadTherapists();

export const getTherapists = (): Therapist[] => {
  return [..._therapists];
};

export const addTherapist = (newTherapistData: Omit<Therapist, 'id'>): Therapist => {
  // Ensure canCoverIndirect is not part of newTherapistData if passed due to old type hints
  const { canCoverIndirect, ...restOfData } = newTherapistData as any; 
  const therapistWithId: Therapist = { ...(restOfData as Omit<Therapist, 'id'>), id: `t${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
  _therapists = [..._therapists, therapistWithId];
  persistTherapists();
  return therapistWithId;
};

export const updateTherapist = (updatedTherapist: Therapist): Therapist | undefined => {
  let foundTherapist: Therapist | undefined;
  // Ensure canCoverIndirect is removed if it exists from old data being updated
  const { canCoverIndirect, ...restOfUpdatedTherapist } = updatedTherapist as any;
  const cleanUpdatedTherapist = restOfUpdatedTherapist as Therapist;

  _therapists = _therapists.map(t => {
    if (t.id === cleanUpdatedTherapist.id) {
      foundTherapist = cleanUpdatedTherapist;
      return cleanUpdatedTherapist;
    }
    return t;
  });
  persistTherapists();
  return foundTherapist;
};

export const removeTherapist = (therapistId: string): boolean => {
  const initialLength = _therapists.length;
  _therapists = _therapists.filter(t => t.id !== therapistId);
  const success = _therapists.length < initialLength;
  if (success) persistTherapists();
  return success;
};

export const addOrUpdateBulkTherapists = (therapistsToProcess: Partial<Omit<Therapist, 'canCoverIndirect'>>[]): { addedCount: number; updatedCount: number } => {
  let addedCount = 0;
  let updatedCount = 0;

  therapistsToProcess.forEach(therapistData => {
    if (!therapistData.name) return; // Skip if no name

    // Remove canCoverIndirect from incoming data if it exists
    const { canCoverIndirect, ...cleanTherapistData } = therapistData as any;

    const existingTherapistIndex = _therapists.findIndex(t => t.name.toLowerCase() === cleanTherapistData.name!.toLowerCase());

    if (existingTherapistIndex !== -1) { // Update existing therapist
      const existingTherapist = _therapists[existingTherapistIndex];
      _therapists[existingTherapistIndex] = {
        ...existingTherapist,
        name: cleanTherapistData.name, // Name always from therapistData for updates
        teamId: cleanTherapistData.teamId !== undefined ? cleanTherapistData.teamId : existingTherapist.teamId,
        qualifications: cleanTherapistData.qualifications !== undefined ? cleanTherapistData.qualifications : existingTherapist.qualifications,
        // canCoverIndirect removed
        canProvideAlliedHealth: cleanTherapistData.canProvideAlliedHealth !== undefined ? cleanTherapistData.canProvideAlliedHealth : existingTherapist.canProvideAlliedHealth,
      };
      updatedCount++;
    } else { // Add new therapist
      addTherapist({ // addTherapist now expects Omit<Therapist, 'id'> which already excludes canCoverIndirect
        name: cleanTherapistData.name,
        teamId: cleanTherapistData.teamId || '',
        qualifications: cleanTherapistData.qualifications || [],
        // canCoverIndirect removed
        canProvideAlliedHealth: cleanTherapistData.canProvideAlliedHealth || [],
      });
      addedCount++;
    }
  });

  if (addedCount > 0 || updatedCount > 0) {
    persistTherapists();
  }
  return { addedCount, updatedCount };
};

export const removeTherapistsByNames = (therapistNamesToRemove: string[]): { removedCount: number } => {
  const initialLength = _therapists.length;
  const lowerCaseNamesToRemove = therapistNamesToRemove.map(name => name.toLowerCase());

  _therapists = _therapists.filter(therapist => !lowerCaseNamesToRemove.includes(therapist.name.toLowerCase()));
  
  const removedCount = initialLength - _therapists.length;
  if (removedCount > 0) {
    persistTherapists();
  }
  return { removedCount };
};

export const subscribeToTherapists = (listener: (therapists: Therapist[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._therapists]); 

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

window.addEventListener('storage', (event) => {
  if (event.key === THERAPISTS_STORAGE_KEY && event.newValue) {
    try {
      _therapists = JSON.parse(event.newValue).map((t: any) => {
        const { canCoverIndirect, ...rest } = t; // Remove if present from old data
        return rest;
      });
      listeners.forEach(listener => listener([..._therapists]));
    } catch (error) {
      console.warn('Error parsing therapists from storage event:', error);
    }
  }
});
