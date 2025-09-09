
import { Team } from '../types';
import { TEAM_COLORS } from '../constants';

const TEAMS_STORAGE_KEY = 'allyScheduler.teams';

// Initial default data is now empty
const initialDefaultTeams: Team[] = [];

let _teams: Team[] = [];
const listeners: Array<(teams: Team[]) => void> = [];

const loadTeams = () => {
  try {
    const storedTeams = localStorage.getItem(TEAMS_STORAGE_KEY);
    _teams = storedTeams ? JSON.parse(storedTeams) : initialDefaultTeams;
  } catch (error) {
    console.warn("Error loading teams from localStorage:", error);
    _teams = initialDefaultTeams;
  }
};

const persistTeams = () => {
  try {
    localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(_teams));
    listeners.forEach(listener => listener([..._teams]));
  } catch (error) {
    console.warn("Error persisting teams to localStorage:", error);
  }
};

loadTeams();

export const getTeams = (): Team[] => {
  return [..._teams];
};

export const updateTeams = (updatedTeams: Team[]): Team[] => {
  _teams = updatedTeams;
  persistTeams();
  return [..._teams];
};

export const subscribeToTeams = (listener: (teams: Team[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._teams]);

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

window.addEventListener('storage', (event) => {
  if (event.key === TEAMS_STORAGE_KEY && event.newValue) {
    try {
      _teams = JSON.parse(event.newValue);
      listeners.forEach(listener => listener([..._teams]));
    } catch (error) {
      console.warn('Error parsing teams from storage event:', error);
    }
  }
});
