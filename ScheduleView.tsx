
import React, { useMemo } from 'react';
import { GeneratedSchedule, DayOfWeek, ScheduleEntry, Therapist, SessionType, Team, ScheduleViewProps } from '../types';
import { TIME_SLOTS_H_MM, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END } from '../constants';
import { UserGroupIcon } from './icons/UserGroupIcon';
import { PencilIcon } from './icons/PencilIcon';

const timeToMinutes = (time: string): number => {
  if (!time || !time.includes(':')) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const generateDisplayTimeSlots = (): string[] => {
  const startMinutes = timeToMinutes(COMPANY_OPERATING_HOURS_START);
  const endMinutes = timeToMinutes(COMPANY_OPERATING_HOURS_END);
  const slots: string[] = [];
  for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
};
const displayTimeSlots = generateDisplayTimeSlots();

const getSessionTypeStyling = (sessionType: SessionType): { display: string; classes: string } => {
  switch (sessionType) {
    case 'ABA': return { display: 'ABA', classes: 'bg-blue-100 border-blue-300 text-blue-700' };
    case 'AlliedHealth_OT': return { display: 'OT', classes: 'bg-green-100 border-green-300 text-green-700' };
    case 'AlliedHealth_SLP': return { display: 'SLP', classes: 'bg-purple-100 border-purple-300 text-purple-700' };
    case 'IndirectTime': return { display: 'Lunch/Indirect', classes: 'bg-yellow-100 border-yellow-300 text-yellow-700' };
    default: return { display: sessionType, classes: 'bg-gray-100 border-gray-300 text-gray-700' };
  }
};

const getDayOfWeekFromDate = (date: Date | null): DayOfWeek | null => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return null;
    }
    const dayIndex = date.getDay();
    const daysMap: DayOfWeek[] = [ DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
    return daysMap[dayIndex];
};


const ScheduleView: React.FC<ScheduleViewProps> = ({
    schedule,          // This is now filteredSchedule from App.tsx
    therapists: therapistsToDisplay, // This is now displayedTherapists from App.tsx
    availableTeams,
    scheduledFullDate,
    onMoveScheduleEntry,
    onOpenEditSessionModal,
    onOpenAddSessionModal
}) => {

  if (!scheduledFullDate) {
    return (
        <div className="text-center py-10">
            <UserGroupIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-xl text-slate-500">Please select a date and generate a schedule.</p>
        </div>
    );
  }

  const scheduledDayOfWeek = getDayOfWeekFromDate(scheduledFullDate);
  if (!scheduledDayOfWeek) {
     return (
        <div className="text-center py-10">
            <p className="text-xl text-red-500">Error: Invalid date selected for schedule view.</p>
        </div>
    );
  }

  // Filter the schedule for the current day being viewed. This is an additional local filter.
  // The main filtering by therapist/client is done in App.tsx
  const daySchedule = schedule.filter(entry => entry.day === scheduledDayOfWeek);

  const teamsData = useMemo(() => {
    return therapistsToDisplay.reduce((acc, therapist) => {
      const teamId = therapist.teamId || 'UnassignedTeam'; // Use a consistent key for unassigned
      if (!acc[teamId]) {
          const teamInfo = availableTeams.find(t => t.id === teamId);
          acc[teamId] = {
            therapists: [],
            color: teamInfo?.color || '#E2E8F0', // slate-200 for unassigned
            name: teamInfo?.name || 'Unassigned'
          };
      }
      acc[teamId].therapists.push(therapist);
      acc[teamId].therapists.sort((a,b) => a.name.localeCompare(b.name));
      return acc;
    }, {} as Record<string, { therapists: Therapist[]; color?: string; name: string }>);
  }, [therapistsToDisplay, availableTeams]);


  const sortedTeamIds = useMemo(() => Object.keys(teamsData).sort((a, b) => {
    const teamAName = teamsData[a].name;
    const teamBName = teamsData[b].name;
    if (teamAName === 'Unassigned') return 1;
    if (teamBName === 'Unassigned') return -1;
    return teamAName.localeCompare(teamBName);
  }), [teamsData]);

  const formattedDate = scheduledFullDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if (therapistsToDisplay.length === 0) {
     return (
      <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
        <h3 className="text-2xl font-semibold text-blue-600 mb-4 pb-2 border-b-2 border-blue-200">{formattedDate}</h3>
        <p className="text-slate-500 italic">No therapists match the current filters for {formattedDate}, or no therapists have been added.</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent<HTMLTableCellElement>, entry: ScheduleEntry) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ entryId: entry.id })); // Pass only ID
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-50', 'cursor-grabbing');
  };

  const handleDragEnd = (e: React.DragEvent<HTMLTableCellElement>) => {
     e.currentTarget.classList.remove('opacity-50', 'cursor-grabbing');
  };

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('bg-sky-100');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.currentTarget.classList.remove('bg-sky-100');
  };

  const handleDrop = (e: React.DragEvent<HTMLTableCellElement>, targetTherapistId: string, targetTimeSlot: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-sky-100');
    const draggedDataJson = e.dataTransfer.getData('application/json');
    if (draggedDataJson) {
      const { entryId } = JSON.parse(draggedDataJson);
      if (entryId) {
        onMoveScheduleEntry(entryId, targetTherapistId, targetTimeSlot);
      }
    }
  };


  return (
    <div className="space-y-8 mt-6">
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg border border-slate-200 overflow-x-auto">
        <table className="min-w-full border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100">
              <th className="sticky left-0 bg-slate-100 p-2 border border-slate-300 text-sm font-medium text-slate-600 w-24 z-10">Time</th>
              {sortedTeamIds.map(teamId => (
                <th key={teamId}
                    colSpan={teamsData[teamId].therapists.length}
                    className="p-2 border border-slate-300 text-sm font-medium text-center"
                    style={{ backgroundColor: teamsData[teamId].color, color: teamsData[teamId].color === '#E2E8F0' ? '#1E293B' : 'white' }}>
                  {teamsData[teamId].name}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50">
                <th className="sticky left-0 bg-slate-50 p-2 border border-slate-300 text-sm font-medium text-slate-600 w-24 z-10"></th>
                {sortedTeamIds.map(teamId => (
                    teamsData[teamId].therapists.map(therapist => (
                    <th key={therapist.id} className="p-2 border border-slate-300 text-sm font-medium text-slate-600 min-w-[150px]">
                        {therapist.name}
                    </th>
                    ))
                ))}
            </tr>
          </thead>
          <tbody>
            {displayTimeSlots.map(timeSlot => {
              const currentTimeSlotStartMinutes = timeToMinutes(timeSlot);
              return (
                <tr key={timeSlot}>
                  <td className="sticky left-0 bg-white p-2 border border-slate-300 text-xs text-slate-500 text-center font-medium w-24 z-10 h-8">{timeSlot}</td>
                   {sortedTeamIds.map(teamId => (
                    teamsData[teamId].therapists.map(therapist => {
                        const entryForCell = daySchedule.find(entry =>
                        entry.therapistId === therapist.id &&
                        timeToMinutes(entry.startTime) === currentTimeSlotStartMinutes
                        );

                        if (entryForCell) {
                            const entryStartMinutes = timeToMinutes(entryForCell.startTime);
                            const entryEndMinutes = timeToMinutes(entryForCell.endTime);
                            const durationMinutes = entryEndMinutes - entryStartMinutes;
                            const rowSpan = Math.max(1, Math.ceil(durationMinutes / 15));
                            const styling = getSessionTypeStyling(entryForCell.sessionType);

                            return (
                                <td key={entryForCell.id} // Use unique entry ID for key
                                    className={`p-1.5 border border-slate-200 text-xs relative group cursor-pointer hover:ring-2 hover:ring-blue-400 ${styling.classes}`}
                                    rowSpan={rowSpan}
                                    draggable="true"
                                    onDragStart={(e) => handleDragStart(e, entryForCell)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => onOpenEditSessionModal(entryForCell)}
                                    title={`Click to edit: ${entryForCell.clientName || styling.display} with ${entryForCell.therapistName}`}
                                    aria-label={`Session: ${entryForCell.clientName || styling.display} with ${entryForCell.therapistName} from ${entryForCell.startTime} to ${entryForCell.endTime}. Click to edit or drag to move.`}
                                >
                                <div className="font-semibold truncate">{entryForCell.clientName || 'N/A'}</div>
                                <div className="text-[10px] uppercase">{styling.display}</div>
                                <div className="text-[10px]">{entryForCell.startTime} - {entryForCell.endTime}</div>
                                <PencilIcon className="w-3 h-3 absolute top-1 right-1 text-slate-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                                </td>
                            );
                        }

                        const isCoveredByPrior = daySchedule.some(entry =>
                            entry.therapistId === therapist.id &&
                            timeToMinutes(entry.startTime) < currentTimeSlotStartMinutes &&
                            timeToMinutes(entry.endTime) > currentTimeSlotStartMinutes
                        );

                        if (isCoveredByPrior) return null;

                        return (
                            <td
                                key={`${therapist.id}-${timeSlot}-empty`}
                                className="p-2 border border-slate-200 h-8 hover:bg-sky-50 transition-colors cursor-pointer group"
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, therapist.id, timeSlot)}
                                onClick={() => onOpenAddSessionModal(therapist.id, therapist.name, timeSlot, scheduledDayOfWeek)}
                                title={`Add session for ${therapist.name} at ${timeSlot}`}
                                aria-label={`Empty slot for ${therapist.name} at ${timeSlot}. Click to add or drag a session here.`}
                            >
                              <span className="opacity-0 group-hover:opacity-100 text-sky-500 text-xs">+ Add</span>
                            </td>
                        );
                    })
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
         {daySchedule.length === 0 && therapistsToDisplay.length > 0 && (
             <p className="text-slate-500 italic text-center py-4">No sessions match the current filters for {formattedDate}, or no sessions are scheduled. Click on a cell to add manually.</p>
         )}
      </div>
    </div>
  );
};

export default ScheduleView;
