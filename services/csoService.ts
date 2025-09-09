import {
  Client,
  Therapist,
  ScheduleEntry,
  Callout,
  DayOfWeek,
  BaseScheduleConfig,
  AlliedHealthNeed,
} from '../types';
import {
  timeToMinutes,
  minutesToTime,
  isTherapistAvailable,
  isClientAvailable,
  buildTherapistScheduleMap,
  buildClientScheduleMap,
  getDayOfWeekFromDate,
} from '../utils/scheduleUtils';
import { COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END } from '../constants';

// --- Type Definitions ---
export interface CSOResult {
  bestSchedule: ScheduleEntry[];
  bestFitness: number;
  generations: number;
}

interface CSOOptions {
  populationSize: number;
  maxGenerations: number;
  mutationRate: number;
  crossoverRate: number;
  elitismRate: number;
}

const defaultCSOOptions: CSOOptions = {
  populationSize: 100,
  maxGenerations: 500,
  mutationRate: 0.05,
  crossoverRate: 0.8,
  elitismRate: 0.1,
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function safelyGetPropertyLength(obj: any, prop: string): number {
  return (obj && obj[prop] ? obj[prop].length : 0);
}

// --- Main CSO Algorithm ---

export function runCsoAlgorithm(
  clients: Client[],
  therapists: Therapist[],
  selectedDate: Date,
  callouts: Callout[] | undefined | null,
  options: CSOOptions = defaultCSOOptions,
  initialSchedule: ScheduleEntry[] = [],
  baseScheduleConfigs: BaseScheduleConfig[] | undefined | null
): CSOResult {
  if (!clients || !Array.isArray(clients) || clients.length === 0) {
    console.error('CSO Algorithm Error: Invalid or empty clients input.');
    return { bestSchedule: [], bestFitness: 0, generations: 0 };
  }
  if (!therapists || !Array.isArray(therapists) || therapists.length === 0) {
    console.error('CSO Algorithm Error: Invalid or empty therapists input.');
    return { bestSchedule: [], bestFitness: 0, generations: 0 };
  }

  let population = createInitialPopulation(options.populationSize, clients, therapists, selectedDate, callouts, initialSchedule);
  let bestSchedule: ScheduleEntry[] = [];
  let bestFitness = -Infinity;

  for (let generation = 0; generation < options.maxGenerations; generation++) {
    // FIX: Pass all required arguments to calculateFitness
    const populationWithFitness = population.map(schedule => ({
      schedule,
      fitness: calculateFitness(schedule, clients, therapists, callouts, selectedDate)
    }));

    populationWithFitness.sort((a, b) => b.fitness - a.fitness);

    const currentBest = populationWithFitness[0];
    if (currentBest && currentBest.fitness > bestFitness) {
      bestFitness = currentBest.fitness;
      bestSchedule = currentBest.schedule;
    }

    const newPopulation: ScheduleEntry[][] = [];

    const eliteCount = Math.floor(options.populationSize * options.elitismRate);
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push(populationWithFitness[i].schedule);
    }
    
    while (newPopulation.length < options.populationSize) {
      const parent1 = selection(populationWithFitness);
      const parent2 = selection(populationWithFitness);
      let child = crossover(parent1, parent2, clients);
      child = mutate(child, clients, therapists, callouts, selectedDate, options);
      newPopulation.push(child);
    }
    population = newPopulation;
  }

  return {
    bestSchedule,
    bestFitness,
    generations: options.maxGenerations,
  };
}

// --- Fitness Calculation ---

function calculateFitness(
  schedule: ScheduleEntry[],
  clients: Client[],
  therapists: Therapist[],
  callouts: Callout[] | undefined | null,
  selectedDate: Date
): number {
  if (!schedule) return 0;

  const dayOfWeek = getDayOfWeekFromDate(selectedDate);
  const operatingHoursStart = timeToMinutes(COMPANY_OPERATING_HOURS_START);
  const operatingHoursEnd = timeToMinutes(COMPANY_OPERATING_HOURS_END);
  const therapistScheduleMap = buildTherapistScheduleMap(schedule);

  let needsMetScore = 0;
  let insuranceMismatch = 0;
  let locationMismatch = 0; 
  let certificationsMismatch = 0; 

  for (const entry of schedule) {
    if (!entry || !entry.clientId || !entry.therapistId || !entry.startTime || !entry.endTime) {
      continue;
    }

    const client = clients.find(c => c.id === entry.clientId);
    const therapist = therapists.find(t => t.id === entry.therapistId);
    if (!client || !therapist) continue;
    
    const clientInsurance = client.insuranceRequirements || [];
    const therapistInsurance = therapist.insuranceAccepted || [];
    if (safelyGetPropertyLength(client, 'insuranceRequirements') > 0 && !clientInsurance.some(req => therapistInsurance.includes(req))) {
        insuranceMismatch++;
    }

    const requiredCerts = client.requiredCertifications || [];
    const therapistCerts = therapist.certifications || [];
    if (safelyGetPropertyLength(client, 'requiredCertifications') > 0 && !requiredCerts.every(req => therapistCerts.includes(req))) {
      certificationsMismatch++;
    }
  }

  const scheduledMinutes = calculateScheduledMinutes(schedule);
  const gapMinutes = calculateGaps(schedule, therapistScheduleMap);
  const outsideAvailability = calculateOutsideAvailability(schedule, therapists, dayOfWeek, operatingHoursStart, operatingHoursEnd);
  const calloutConflicts = calculateCalloutConflicts(schedule, callouts);

  const fitness = 
      scheduledMinutes 
      - (gapMinutes * 0.5) 
      - (outsideAvailability * 100) 
      - (calloutConflicts * 100) 
      + (needsMetScore * 50) 
      - (insuranceMismatch * 20) 
      - (locationMismatch * 10) 
      - (certificationsMismatch * 20);

  return isNaN(fitness) ? 0 : fitness;
}

// --- Genetic Operators ---

function createInitialPopulation(
    populationSize: number, 
    clients: Client[], 
    therapists: Therapist[], 
    selectedDate: Date, 
    callouts: Callout[] | null, 
    initialSchedule: ScheduleEntry[]
): ScheduleEntry[][] {
    const population: ScheduleEntry[][] = [];
    const dayOfWeek = getDayOfWeekFromDate(selectedDate);
    const operatingHoursStart = timeToMinutes(COMPANY_OPERATING_HOURS_START);
    const operatingHoursEnd = timeToMinutes(COMPANY_OPERATING_HOURS_END);

    for (let i = 0; i < populationSize; i++) {
        let schedule: ScheduleEntry[] = [...initialSchedule];
        const tempTherapistScheduleMap = buildTherapistScheduleMap(schedule);
        const tempClientScheduleMap = buildClientScheduleMap(schedule);

        clients.forEach(client => {
            if (client && client.id && !tempClientScheduleMap.has(client.id)) {
                if (client.alliedHealthNeeds && Array.isArray(client.alliedHealthNeeds)) {
                    client.alliedHealthNeeds.forEach(need => {
                        const availableTherapists = therapists.filter(therapist => 
                            therapist.discipline === need.type &&
                            isTherapistAvailable(schedule, therapist.id!, operatingHoursStart, operatingHoursEnd, callouts, selectedDate, undefined, tempTherapistScheduleMap)
                        );

                        if (availableTherapists.length > 0) {
                            const therapist = availableTherapists[Math.floor(Math.random() * availableTherapists.length)];
                            const duration = need.durationMinutes;
                            const availability = therapist.availability.find(a => a.dayOfWeek === dayOfWeek);
                            if (availability) {
                                const availableStart = timeToMinutes(availability.startTime);
                                const availableEnd = timeToMinutes(availability.endTime) - duration;
                                if (availableEnd >= availableStart) {
                                    let startTime, endTime;
                                    let attempts = 0;
                                    do {
                                        startTime = Math.floor(Math.random() * (availableEnd - availableStart + 1)) + availableStart;
                                        endTime = startTime + duration;
                                        attempts++;
                                    } while (
                                        (!isTherapistAvailable(schedule, therapist.id, startTime, endTime, callouts, selectedDate, undefined, tempTherapistScheduleMap) ||
                                        !isClientAvailable(schedule, client.id, startTime, endTime, callouts, selectedDate, undefined, tempClientScheduleMap)) &&
                                        attempts < 100
                                    );

                                    if (attempts < 100) {
                                        const newEntry: ScheduleEntry = {
                                            id: generateId(),
                                            therapistId: therapist.id,
                                            clientId: client.id,
                                            startTime: minutesToTime(startTime),
                                            endTime: minutesToTime(endTime),
                                            date: selectedDate.toISOString().split('T')[0],
                                            discipline: therapist.discipline,
                                            isAbsence: false,
                                        };
                                        schedule.push(newEntry);
                                        if (!tempTherapistScheduleMap.has(therapist.id)) tempTherapistScheduleMap.set(therapist.id, []);
                                        tempTherapistScheduleMap.get(therapist.id)?.push(newEntry);
                                        if (!tempClientScheduleMap.has(client.id)) tempClientScheduleMap.set(client.id, []);
                                        tempClientScheduleMap.get(client.id)?.push(newEntry);
                                    }
                                }
                            }
                        }
                    });
                }
            }
        });
        population.push(schedule);
    }
    return population;
}

function selection(populationWithFitness: {schedule: ScheduleEntry[], fitness: number}[]): ScheduleEntry[] {
    const totalFitness = populationWithFitness.reduce((sum, ind) => sum + Math.max(0, ind.fitness), 0);
    if (totalFitness === 0) {
      return populationWithFitness[Math.floor(Math.random() * populationWithFitness.length)].schedule;
    }
    let randomPoint = Math.random() * totalFitness;
    for (const individual of populationWithFitness) {
      randomPoint -= Math.max(0, individual.fitness);
      if (randomPoint <= 0) {
        return individual.schedule;
      }
    }
    return populationWithFitness[populationWithFitness.length - 1].schedule;
}

function crossover(parent1: ScheduleEntry[], parent2: ScheduleEntry[], clients: Client[]): ScheduleEntry[] {
    const child: ScheduleEntry[] = [];
    if (!parent1 || !parent2) return [];

    const clientEntriesMap: Map<string, ScheduleEntry[]> = new Map();
    [...parent1, ...parent2].forEach(entry => {
        if (entry && entry.clientId) {
            if (!clientEntriesMap.has(entry.clientId)) {
                clientEntriesMap.set(entry.clientId, []);
            }
            clientEntriesMap.get(entry.clientId)!.push(entry);
        }
    });

    clients.forEach(client => {
        if (clientEntriesMap.has(client.id)) {
            const entries = clientEntriesMap.get(client.id);
            if (entries && entries.length > 0) {
                const chosenEntry = entries[Math.floor(Math.random() * entries.length)];
                if (chosenEntry && !child.some(c => c.id === chosenEntry.id)) {
                    child.push(chosenEntry);
                }
            }
        }
    });
    return child;
}

function mutate(
  schedule: ScheduleEntry[], 
  clients: Client[], 
  therapists: Therapist[], 
  callouts: Callout[] | null, 
  selectedDate: Date, 
  options: CSOOptions
): ScheduleEntry[] {
    if (!schedule) return [];
    
    const mutatedSchedule = [...schedule];
    if (Math.random() < options.mutationRate && mutatedSchedule.length > 0) {
        const mutationIndex = Math.floor(Math.random() * mutatedSchedule.length);
        const entryToMutate = mutatedSchedule[mutationIndex];
        if (!entryToMutate) return mutatedSchedule;

        const client = clients.find(c => c.id === entryToMutate.clientId);
        const originalTherapist = therapists.find(t => t.id === entryToMutate.therapistId);
        if (client && originalTherapist) {
            const need = (client.alliedHealthNeeds && Array.isArray(client.alliedHealthNeeds))
                ? client.alliedHealthNeeds.find(n => n.type === originalTherapist.discipline)
                : undefined;
            if (need) {
                const availableTherapists = therapists.filter(therapist => therapist.discipline === need.type);
                if (availableTherapists.length > 0) {
                    const newTherapist = availableTherapists[Math.floor(Math.random() * availableTherapists.length)];
                    const duration = need.durationMinutes;
                    const dayOfWeek = getDayOfWeekFromDate(selectedDate);
                    const availability = (newTherapist?.availability)
                        ? newTherapist.availability.find(a => a.dayOfWeek === dayOfWeek)
                        : undefined;
                    if (availability) {
                        const availableStart = timeToMinutes(availability.startTime);
                        const availableEnd = timeToMinutes(availability.endTime) - duration;
                        if (availableEnd >= availableStart) {
                            const startTime = Math.floor(Math.random() * (availableEnd - availableStart + 1)) + availableStart;
                            const endTime = startTime + duration;
                            mutatedSchedule[mutationIndex] = { ...entryToMutate, therapistId: newTherapist.id, startTime: minutesToTime(startTime), endTime: minutesToTime(endTime) };
                        }
                    }
                }
            }
        }
    }
    return mutatedSchedule;
}


// --- Fitness Calculation Helpers ---

function calculateScheduledMinutes(schedule: ScheduleEntry[]): number {
    return schedule.reduce((total, entry) => {
        if (entry && entry.startTime && entry.endTime) {
            return total + (timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime));
        }
        return total;
    }, 0);
}

function calculateGaps(schedule: ScheduleEntry[], therapistScheduleMap: Map<string, ScheduleEntry[]>): number {
    let gaps = 0;
    therapistScheduleMap.forEach(sessions => {
        if (sessions && sessions.length > 1) {
            sessions.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
            for (let i = 0; i < sessions.length - 1; i++) {
                if (sessions[i].endTime && sessions[i + 1].startTime) {
                    const gap = timeToMinutes(sessions[i + 1].startTime) - timeToMinutes(sessions[i].endTime);
                    if (gap > 0) gaps += gap;
                }
            }
        }
    });
    return gaps;
}

function calculateOutsideAvailability(schedule: ScheduleEntry[], therapists: Therapist[], dayOfWeek: DayOfWeek, _operatingHoursStart: number, _operatingHoursEnd: number): number {
    let outsideAvailability = 0;
    for (const entry of schedule) {
        if (!entry || !entry.therapistId || !entry.startTime || !entry.endTime) continue;
        const therapist = therapists.find(t => t.id === entry.therapistId);
        if (!therapist) continue;
        const therapistAvailability = therapist.availability.find(a => a.dayOfWeek === dayOfWeek);
        const startTimeMinutes = timeToMinutes(entry.startTime);
        const endTimeMinutes = timeToMinutes(entry.endTime);
        if (!therapistAvailability || startTimeMinutes < timeToMinutes(therapistAvailability.startTime) || endTimeMinutes > timeToMinutes(therapistAvailability.endTime)) {
            outsideAvailability++;
        }
    }
    return outsideAvailability;
}

function calculateCalloutConflicts(schedule: ScheduleEntry[], callouts: Callout[] | null): number {
    let calloutConflicts = 0;
    if (callouts) {
        for (const entry of schedule) {
            if (!entry || !entry.clientId || !entry.therapistId) continue;
            if (callouts.some(c => c.entityId === entry.therapistId || c.entityId === entry.clientId)) {
                calloutConflicts++;
            }
        }
    }
    return calloutConflicts;
}
