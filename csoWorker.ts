// csoWorker.ts
import { Client, Therapist, GeneratedSchedule, DayOfWeek, Callout, BaseScheduleConfig } from '@/types';
import { validateFullSchedule, timeToMinutes, sessionsOverlap, isDateAffectedByCalloutRange } from '@/utils/validationService';
import { COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END } from '@/constants';
import {
    CONFLICT_PENALTY,
    CREDENTIAL_MISMATCH_PENALTY,
    CALLOUT_OVERLAP_PENALTY,
    CLIENT_COVERAGE_GAP_PENALTY,
    MISSING_LUNCH_PENALTY,
    SESSION_DURATION_PENALTY,
    MD_MEDICAID_LIMIT_PENALTY,
    BCBA_DIRECT_TIME_PENALTY,
    UNMET_AH_NEED_PENALTY,
    BASE_SCHEDULE_DEVIATION_PENALTY,
    TEAM_ALIGNMENT_PENALTY,
    MAX_NOTES_PENALTY,
    LUNCH_OUTSIDE_WINDOW_PENALTY
} from '@/services/csoConstants'; // FIX: Use alias path

// Helper functions
const getClientById = (clients: Client[], id: string) => clients.find(c => c.id === id);
const getTherapistById = (therapists: Therapist[], id: string) => therapists.find(t => t.id === id);

function calculateFitness(
    schedule: GeneratedSchedule,
    clients: Client[],
    therapists: Therapist[],
    selectedDate: Date,
    callouts: Callout[],
    baseScheduleForDay?: BaseScheduleConfig | null
): number {
    let fitness = 0;
    const errors = validateFullSchedule(schedule, clients, therapists, selectedDate, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END, callouts);

    errors.forEach(error => {
        switch (error.ruleId) {
            case "CLIENT_TIME_CONFLICT":
            case "THERAPIST_TIME_CONFLICT":
                fitness += CONFLICT_PENALTY; 
                break;
            case "INSURANCE_MISMATCH":
                fitness += CREDENTIAL_MISMATCH_PENALTY; 
                break;
            case "SESSION_OVERLAPS_CALLOUT":
                fitness += CALLOUT_OVERLAP_PENALTY; 
                break;
            case "MISSING_LUNCH_BREAK":
                fitness += MISSING_LUNCH_PENALTY; 
                break;
            case "ABA_DURATION_TOO_SHORT":
            case "ABA_DURATION_TOO_LONG":
                fitness += SESSION_DURATION_PENALTY; 
                break;
            case "MD_MEDICAID_LIMIT_VIOLATED":
                fitness += MD_MEDICAID_LIMIT_PENALTY; 
                break;
            case "BCBA_NO_DIRECT_TIME":
                fitness += BCBA_DIRECT_TIME_PENALTY; 
                break;
            case "CLIENT_COVERAGE_GAP_AT_TIME":
                fitness += CLIENT_COVERAGE_GAP_PENALTY; 
                break;
            case "MAX_NOTES_EXCEEDED":
                fitness += MAX_NOTES_PENALTY; 
                break;
            case "LUNCH_OUTSIDE_WINDOW":
                fitness += LUNCH_OUTSIDE_WINDOW_PENALTY; 
                break;
            default:
                fitness += 50;
                break;
        }
    });

    if (baseScheduleForDay?.schedule) {
        const validBaseSessions = baseScheduleForDay.schedule.filter(bs =>
            !callouts.some(co => (co.entityId === bs.clientId || co.entityId === bs.therapistId) &&
                isDateAffectedByCalloutRange(selectedDate, co.startDate, co.endDate) &&
                sessionsOverlap(bs.startTime, bs.endTime, co.startTime, co.endTime))
        );
        const deviationCount = validBaseSessions.filter(bs =>
            !schedule.some(s => s.clientId === bs.clientId && s.therapistId === bs.therapistId && s.startTime === bs.startTime)
        ).length;
        fitness += deviationCount * BASE_SCHEDULE_DEVIATION_PENALTY;
    }
    
    schedule.forEach(entry => {
        if (entry.clientId) {
            const client = getClientById(clients, entry.clientId);
            const therapist = getTherapistById(therapists, entry.therapistId);
            if (client && therapist && client.teamId && therapist.teamId && client.teamId !== therapist.teamId) {
                fitness += TEAM_ALIGNMENT_PENALTY;
            }
        }
    });
    
    clients.forEach(client => {
        client.alliedHealthNeeds.forEach(need => {
            const scheduledCount = schedule.filter(s => s.clientId === client.id && s.sessionType.includes(need.type)).length;
            if (scheduledCount === 0) {
                fitness += UNMET_AH_NEED_PENALTY;
            }
        });
    });

    return fitness;
}

self.onmessage = function(event) {
    const { schedule, clients, therapists, selectedDate, callouts, baseScheduleForDay } = event.data;

    try {
        const fitness = calculateFitness(schedule, clients, therapists, new Date(selectedDate), callouts, baseScheduleForDay);
        self.postMessage({ status: 'success', fitness: fitness, schedule: schedule });
    } catch (error: any) {
        self.postMessage({ status: 'error', message: error.message, schedule: schedule });
    }
};
