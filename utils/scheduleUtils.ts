import { Callout, ScheduleEntry, DayOfWeek } from '../types';
import { COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END } from '../constants';

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) {
    return 0;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const paddedHours = hours.toString().padStart(2, '0');
  const paddedMins = mins.toString().padStart(2, '0');
  return `${paddedHours}:${paddedMins}`;
}

export function isTimeWithinOperatingHours(time: string): boolean {
  const startMinutes = timeToMinutes(COMPANY_OPERATING_HOURS_START);
  const endMinutes = timeToMinutes(COMPANY_OPERATING_HOURS_END);
  const timeMinutes = timeToMinutes(time);
  return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
}

export function isDateAffectedByCalloutRange(selectedDate: Date, calloutStartDate: string, calloutEndDate: string): boolean {
  const selectedDateStr = selectedDate.toISOString().slice(0, 10);
  return selectedDateStr >= calloutStartDate && selectedDateStr <= calloutEndDate;
}

export function getDayOfWeekFromDate(date: Date): DayOfWeek {
  const days = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
  return days[date.getDay()];
}

export function buildTherapistScheduleMap(schedule: ScheduleEntry[]): Map<string, ScheduleEntry[]> {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of schedule) {
        if (!map.has(entry.therapistId)) {
            map.set(entry.therapistId, []);
        }
        map.get(entry.therapistId)?.push(entry);
    }
    return map;
}

export function buildClientScheduleMap(schedule: ScheduleEntry[]): Map<string, ScheduleEntry[]> {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of schedule) {
        if (entry.clientId) {
            if (!map.has(entry.clientId)) {
                map.set(entry.clientId, []);
            }
            map.get(entry.clientId)?.push(entry);
        }
    }
    return map;
}

export function isTherapistAvailable(
    schedule: ScheduleEntry[],
    therapistId: string,
    startTime: number,
    endTime: number,
    callouts: Callout[] | undefined,
    selectedDate: Date,
    currentSessionId?: string,
    therapistScheduleMap?: Map<string, ScheduleEntry[]>
): boolean {
    const effectiveTherapistScheduleMap = therapistScheduleMap || buildTherapistScheduleMap(schedule);
    const therapistSessions = effectiveTherapistScheduleMap.get(therapistId) || [];

    const conflictingSessions = therapistSessions.filter(session =>
        session.id !== currentSessionId &&
        ((timeToMinutes(session.startTime) < endTime && timeToMinutes(session.endTime) > startTime))
    );
    if (conflictingSessions.length > 0) return false;

    if (callouts) {
        const conflictingCallout = callouts.some(callout =>
            callout.entityId === therapistId &&
            isDateAffectedByCalloutRange(selectedDate, callout.startDate, callout.endDate) &&
            ((timeToMinutes(callout.startTime) < endTime && timeToMinutes(callout.endTime) > startTime))
        );
        if (conflictingCallout) return false;
    }

    return true;
}

export function isClientAvailable(
    schedule: ScheduleEntry[],
    clientId: string,
    startTime: number,
    endTime: number,
    callouts: Callout[] | undefined,
    selectedDate: Date,
    currentSessionId?: string,
    clientScheduleMap?: Map<string, ScheduleEntry[]>
): boolean {
    const effectiveClientScheduleMap = clientScheduleMap || buildClientScheduleMap(schedule);
    const clientSessions = effectiveClientScheduleMap.get(clientId) || [];

    const conflictingSessions = clientSessions.filter(session =>
        session.id !== currentSessionId &&
        ((timeToMinutes(session.startTime) < endTime && timeToMinutes(session.endTime) > startTime))
    );
    if (conflictingSessions.length > 0) return false;

    if (callouts) {
        const conflictingCallout = callouts.some(callout =>
            callout.entityId === clientId &&
            isDateAffectedByCalloutRange(selectedDate, callout.startDate, callout.endDate) &&
            ((timeToMinutes(callout.startTime) < endTime && timeToMinutes(callout.endTime) > startTime))
        );
        if (conflictingCallout) return false;
    }

    return true;
}