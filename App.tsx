
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Client, Therapist, GeneratedSchedule, DayOfWeek, Team, ScheduleEntry, SessionType, BaseScheduleConfig, ValidationError, Callout, CalloutFormValues, AlliedHealthNeed, BulkOperationSummary, GAGenerationResult } from './types';
import { DAYS_OF_WEEK, PALETTE_ICON_SVG, TEAM_COLORS, ALL_THERAPIST_ROLES, ALL_SESSION_TYPES, TIME_SLOTS_H_MM, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END } from './constants';
import ClientForm from './components/ClientForm';
import TherapistForm from './components/TherapistForm';
import ScheduleView from './components/ScheduleView';
import LoadingSpinner from './components/LoadingSpinner';
import SettingsPanel from './components/SettingsPanel';
import AdminSettingsPanel from './components/AdminSettingsPanel';
import SessionModal from './components/SessionModal';
import BaseScheduleManager from './components/BaseScheduleManager';
import FilterControls from './components/FilterControls';
import { PlusIcon } from './components/icons/PlusIcon';
import { TrashIcon } from './components/icons/TrashIcon';
import { runCsoAlgorithm } from './services/csoService';
import { validateSessionEntry, validateFullSchedule, timeToMinutes, minutesToTime } from './utils/validationService';
import { CalendarIcon } from './components/icons/CalendarIcon';
import { UserGroupIcon } from './components/icons/UserGroupIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import { ClipboardDocumentListIcon } from './components/icons/ClipboardDocumentListIcon';
import { Cog8ToothIcon } from './components/icons/Cog8ToothIcon';
import { SparklesIcon } from './components/icons/SparklesIcon';

import * as clientService from './services/clientService';
import * as therapistService from './services/therapistService';
import * as teamService from './services/teamService';
import * as settingsService from './services/settingsService';
import * as baseScheduleService from './services/baseScheduleService';
import * as calloutService from './services/calloutService';


interface LoadingState {
  active: boolean;
  message: string;
}

// Helper to generate unique IDs for schedule entries
const generateScheduleEntryId = () => `schedEntry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const App: React.FC = () => {
  const [availableTeams, setAvailableTeams] = useState<Team[]>(teamService.getTeams());
  const [availableInsuranceQualifications, setAvailableInsuranceQualifications] = useState<string[]>(settingsService.getInsuranceQualifications());
  const [clients, setClients] = useState<Client[]>(clientService.getClients());
  const [therapists, setTherapists] = useState<Therapist[]>(therapistService.getTherapists());
  const [baseSchedules, setBaseSchedules] = useState<BaseScheduleConfig[]>(baseScheduleService.getBaseSchedules());
  const [callouts, setCallouts] = useState<Callout[]>(calloutService.getCallouts());

  const [schedule, setSchedule] = useState<GeneratedSchedule | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({ active: false, message: 'Processing...' });
  const [error, setError] = useState<ValidationError[] | null>(null);
  const [gaStatusMessage, setGaStatusMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'clients' | 'therapists' | 'schedule' | 'baseSchedules' | 'callouts' | 'settings' | 'adminSettings'>('clients');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<ScheduleEntry | null>(null);
  const [newSessionSlotDetails, setNewSessionSlotDetails] = useState<{ therapistId: string; therapistName: string; startTime: string; day: DayOfWeek } | null>(null);

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  const [bulkOperationSummary, setBulkOperationSummary] = useState<BulkOperationSummary | null>(null);

  const getCurrentDateString = () => new Date().toISOString().split('T')[0];

  const [calloutForm, setCalloutForm] = useState<CalloutFormValues>({
    entityType: 'client',
    entityId: '',
    startDate: selectedDate ? selectedDate.toISOString().split('T')[0] : getCurrentDateString(),
    endDate: selectedDate ? selectedDate.toISOString().split('T')[0] : getCurrentDateString(),
    startTime: '09:00',
    endTime: '17:00',
    reason: ''
  });

  useEffect(() => {
    const unsubClients = clientService.subscribeToClients(setClients);
    const unsubTherapists = therapistService.subscribeToTherapists(setTherapists);
    const unsubTeams = teamService.subscribeToTeams(setAvailableTeams);
    const unsubQualifications = settingsService.subscribeToInsuranceQualifications(setAvailableInsuranceQualifications);
    const unsubBaseSchedules = baseScheduleService.subscribeToBaseSchedules(setBaseSchedules);
    const unsubCallouts = calloutService.subscribeToCallouts(setCallouts);
    return () => {
      unsubClients(); unsubTherapists(); unsubTeams(); unsubQualifications(); unsubBaseSchedules(); unsubCallouts();
    };
  }, []);


  useEffect(() => {
    if (selectedDate) {
        const dateString = selectedDate.toISOString().split('T')[0];
        setCalloutForm(prev => ({...prev, startDate: dateString, endDate: dateString}));
    } else {
        const todayString = getCurrentDateString();
        setCalloutForm(prev => ({...prev, startDate: todayString, endDate: todayString}));
    }
  }, [selectedDate]);


  const handleAddClient = () => { setError(null); clientService.addClient({ name: 'New Client', teamId: '', insuranceRequirements: [], alliedHealthNeeds: [] }); };
  const handleUpdateClient = (updatedClient: Client) => clientService.updateClient(updatedClient);
  const handleRemoveClient = (clientId: string) => clientService.removeClient(clientId);
  const handleAddTherapist = () => { setError(null); therapistService.addTherapist({ name: 'New Therapist', teamId: '', qualifications: [], canProvideAlliedHealth: [] }); };
  const handleUpdateTherapist = (updatedTherapist: Therapist) => therapistService.updateTherapist(updatedTherapist);
  const handleRemoveTherapist = (therapistId: string) => therapistService.removeTherapist(therapistId);
  const handleUpdateTeams = (updatedTeams: Team[]) => teamService.updateTeams(updatedTeams);
  const handleUpdateInsuranceQualifications = (updatedIQs: string[]) => settingsService.updateInsuranceQualifications(updatedIQs);


  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const dateString = event.target.value;
    setError(null); setGaStatusMessage(null);
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number);
      setSelectedDate(new Date(year, month - 1, day));
      setSchedule(null);
    } else {
      setSelectedDate(null); setSchedule(null);
    }
  };

  const handleMoveScheduleEntry = useCallback((
    draggedEntryId: string, newTherapistId: string, newStartTime: string
  ) => {
    setError(null);
    setGaStatusMessage(null);

    setSchedule(prevSchedule => {
      if (!prevSchedule || !selectedDate) return prevSchedule;

      const originalDraggedEntry = prevSchedule.find(entry => entry.id === draggedEntryId);
      if (!originalDraggedEntry) return prevSchedule; // Entry not found

      const newTherapist = therapists.find(t => t.id === newTherapistId);
      if (!newTherapist) return prevSchedule; // New therapist not found

      const durationMinutes = timeToMinutes(originalDraggedEntry.endTime) - timeToMinutes(originalDraggedEntry.startTime);
      const newEndTime = minutesToTime(timeToMinutes(newStartTime) + durationMinutes);
      
      const proposedNewEntry: ScheduleEntry = {
        ...originalDraggedEntry,
        therapistId: newTherapistId,
        therapistName: newTherapist.name,
        startTime: newStartTime,
        endTime: newEndTime,
      };

      const scheduleWithoutOriginal = prevSchedule.filter(entry => entry.id !== draggedEntryId);
      const newUpdatedSchedule = [...scheduleWithoutOriginal, proposedNewEntry];

      const validationErrors = validateFullSchedule(newUpdatedSchedule, clients, therapists, selectedDate, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END, callouts);
      if (validationErrors.length > 0) {
        setError(validationErrors);
      } else {
        setError(null);
      }
      return newUpdatedSchedule;
    });
  }, [clients, therapists, selectedDate, callouts]);

  const handleOpenEditSessionModal = (entry: ScheduleEntry) => { setError(null); setGaStatusMessage(null); setSessionToEdit(entry); setNewSessionSlotDetails(null); setIsSessionModalOpen(true); };
  
  const handleOpenAddSessionModal = (therapistId: string, therapistName: string, startTime: string, day: DayOfWeek) => {
    setError(null); 
    setGaStatusMessage(null); 
    setNewSessionSlotDetails({ therapistId, therapistName, startTime, day }); 
    setSessionToEdit(null); 
    setIsSessionModalOpen(true); 
  };
  const handleCloseSessionModal = () => { setIsSessionModalOpen(false); setSessionToEdit(null); setNewSessionSlotDetails(null); };

  const handleSaveSession = (entryToSave: ScheduleEntry) => {
    setGaStatusMessage(null);
    setError(null);

    setSchedule(prevSchedule => {
        const baseSchedule = prevSchedule ? [...prevSchedule] : [];
        let newUpdatedSchedule;

        // Ensure entryToSave has an ID
        const finalEntryToSave = { ...entryToSave, id: entryToSave.id || generateScheduleEntryId() };

        if (sessionToEdit) { // Editing existing session
            newUpdatedSchedule = baseSchedule.map(e => e.id === sessionToEdit.id ? finalEntryToSave : e);
        } else { // Adding new session
            newUpdatedSchedule = [...baseSchedule, finalEntryToSave];
        }

        if (selectedDate) {
            const validationErrors = validateFullSchedule(newUpdatedSchedule, clients, therapists, selectedDate, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END, callouts);
            if (validationErrors.length > 0) {
                setError(validationErrors);
            } else {
                setError(null);
            }
        } else {
            setError([{ruleId: "MISSING_DATE_FOR_VALIDATION", message: "Cannot validate schedule as no date is selected."}]);
        }
        return newUpdatedSchedule;
    });
    handleCloseSessionModal();
  };

  const handleDeleteSession = (sessionToDelete: ScheduleEntry) => {
    setGaStatusMessage(null);
    setError(null);
    setSchedule(prevSchedule => {
      if (!prevSchedule) return null;
      
      const newUpdatedSchedule = prevSchedule.filter(entry => entry.id !== sessionToDelete.id);

      if (selectedDate) {
        const validationErrors = validateFullSchedule(newUpdatedSchedule, clients, therapists, selectedDate, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END, callouts);
        if (validationErrors.length > 0) {
            setError(validationErrors);
        } else {
            setError(null);
        }
      } else {
          setError([{ruleId: "MISSING_DATE_FOR_VALIDATION", message: "Cannot validate schedule as no date is selected."}]);
      }
      return newUpdatedSchedule;
    });
    handleCloseSessionModal();
  };

  const handleAddBaseScheduleConfig = () => { setError(null); baseScheduleService.updateBaseSchedules([...baseScheduleService.getBaseSchedules(), { id: `bs-${Date.now()}`, name: 'New Base Schedule', appliesToDays: [], schedule: null }]); };
  const handleUpdateBaseScheduleConfigName = (id: string, newName: string) => { baseScheduleService.updateBaseSchedules(baseScheduleService.getBaseSchedules().map(bs => bs.id === id ? { ...bs, name: newName } : bs)); };
  const handleUpdateBaseScheduleConfigDays = (id: string, newDays: DayOfWeek[]) => { baseScheduleService.updateBaseSchedules(baseScheduleService.getBaseSchedules().map(bs => bs.id === id ? { ...bs, appliesToDays: newDays } : bs)); };
  const handleDeleteBaseScheduleConfig = (id: string) => { baseScheduleService.updateBaseSchedules(baseScheduleService.getBaseSchedules().filter(bs => bs.id !== id)); };

  const handleSetCurrentGeneratedScheduleAsBase = (baseScheduleId: string) => {
    setError(null); setGaStatusMessage(null);
    if (schedule && selectedDate) {
      // Ensure all schedule entries have IDs before saving to base
      const scheduleWithIds = schedule.map(entry => ({...entry, id: entry.id || generateScheduleEntryId() }));
      const updatedConfigs = baseScheduleService.getBaseSchedules().map(bs => bs.id === baseScheduleId ? { ...bs, schedule: [...scheduleWithIds] } : bs);
      baseScheduleService.updateBaseSchedules(updatedConfigs);
      alert('Current generated schedule has been set as the base schedule.');
    } else { alert('No schedule currently generated or date not selected to set as base.'); }
  };

  const handleViewBaseSchedule = (baseScheduleId: string) => {
    setError(null); setGaStatusMessage(null);
    const baseConfig = baseScheduleService.getBaseSchedules().find(bs => bs.id === baseScheduleId);
    if (baseConfig && baseConfig.schedule) {
      // Ensure all schedule entries from base have IDs when loading
      const scheduleWithIds = baseConfig.schedule.map(entry => ({...entry, id: entry.id || generateScheduleEntryId() }));
      setSchedule([...scheduleWithIds]);
      const today = new Date();
      let newSelectedDate = null;
      for (let i = 0; i < 7; i++) {
          const tempDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
          const dayOfWeekName = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY][tempDate.getDay()];
          if (baseConfig.appliesToDays.includes(dayOfWeekName)) { newSelectedDate = tempDate; break; }
      }
      setSelectedDate(newSelectedDate || today);

      if (newSelectedDate) {
          const validationErrors = validateFullSchedule(scheduleWithIds, clients, therapists, newSelectedDate, COMPANY_OPERATING_HOURS_START, COMPANY_OPERATING_HOURS_END, callouts);
          if (validationErrors.length > 0) {
              setError(validationErrors);
          } else {
              setError(null);
          }
      }
      setActiveTab('schedule');
    } else { alert('This base schedule has no schedule data set.'); }
  };

  const handleCalloutFormChange = (field: keyof CalloutFormValues, value: string) => {
    setCalloutForm(prev => {
        const newState = { ...prev, [field]: value };
        if (field === 'entityType') {
            newState.entityId = '';
        }
        return newState;
    });
  };

  const handleAddCallout = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    let { entityType, entityId, startDate, endDate, startTime, endTime, reason } = calloutForm;
    if (!entityId || !startDate || !startTime || !endTime) { setError([{ruleId: "MISSING_CALLOUT_FIELDS", message: "Please fill in Entity, Start Date, Start Time, and End Time for the callout."}]); return; }
    if (!endDate || new Date(endDate) < new Date(startDate)) endDate = startDate;
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) { setError([{ruleId: "INVALID_CALLOUT_TIME_ORDER", message: "Callout end time must be after start time."}]); return; }

    const sourceList = entityType === 'client' ? clients : therapists;
    const entityName = sourceList.find(item => item.id === entityId)?.name;

    if (!entityName) { setError([{ruleId: "CALLOUT_ENTITY_NOT_FOUND", message: `Selected ${entityType} not found for callout.`}]); return; }

    calloutService.addCalloutEntry({ entityType, entityId, entityName, startDate, endDate, startTime, endTime, reason });
    setCalloutForm(prev => ({ ...prev, entityId: '', startTime: '09:00', endTime: '17:00', reason: '' }));
  };
  const handleRemoveCallout = (calloutId: string) => calloutService.removeCalloutEntry(calloutId);

  const processGAGenerationResult = (result: GAGenerationResult, context: 'Generation' | 'Optimization') => {
    setGaStatusMessage(result.statusMessage);

    if (result.schedule) {
      // Ensure all GA-generated schedule entries have IDs
      const scheduleWithIds = result.schedule.map(entry => ({...entry, id: entry.id || generateScheduleEntryId() }));
      setSchedule(scheduleWithIds);
      if (result.finalValidationErrors.length > 0) {
         setError(result.finalValidationErrors.map(err => ({ ...err, message: `Final Schedule Info (Gen: ${result.generations}, Fitness: ${result.bestFitness.toFixed(2)}): ${err.message}` })));
      } else {
          setError(null);
      }
      if (result.success) {
           setGaStatusMessage(prev => `${prev || ''} Main rules satisfied.`);
      } else {
           setGaStatusMessage(prev => `${prev || ''} Main rules might not be fully satisfied. Best fitness: ${result.bestFitness.toFixed(2)}.`);
      }
      setActiveTab('schedule');
    } else {
      setError([{ ruleId: `GA_NO_FINAL_SCHEDULE_${context.toUpperCase()}`, message: result.statusMessage || `GA could not ${context.toLowerCase()} a viable schedule. Best fitness: ${result.bestFitness.toFixed(2)}.` }]);
      setSchedule(null);
    }
  };

  const handleGenerateScheduleWithGA = useCallback(async () => {
    if (!selectedDate) { setError([{ ruleId: "MISSING_DATE", message: "Please select a date." }]); return; }
    if (clients.length === 0 || therapists.length === 0) { setError([{ ruleId: "MISSING_DATA", message: "Add clients and therapists." }]); return; }

    setLoadingState({ active: true, message: 'Running CSO Algorithm...' });
    setError(null); setSchedule(null); setGaStatusMessage(null);

    try {
      const result: GAGenerationResult = await runCsoAlgorithm(clients, therapists, selectedDate, callouts);
      processGAGenerationResult(result, 'Generation');
    } catch (e: any) {
      console.error("Error in CSO schedule generation process:", e);
      setError([{ ruleId: "CSO_GENERATION_ERROR", message: e.message || "An unexpected error occurred during CSO schedule generation." }]);
      setSchedule(null);
      setGaStatusMessage(`Error: ${e.message || "Unknown error during CSO generation."}`);
    } finally {
      setLoadingState({ active: false, message: 'Processing...' });
    }
  }, [clients, therapists, selectedDate, callouts]);

  const handleOptimizeCurrentScheduleWithGA = useCallback(async () => {
    if (!selectedDate || !schedule) {
        setError([{ ruleId: "MISSING_DATA_FOR_CSO_OPTIMIZE", message: "A date must be selected and a schedule must be loaded to optimize." }]);
        return;
    }
    if (clients.length === 0 || therapists.length === 0) {
        setError([{ ruleId: "MISSING_CLIENT_THERAPIST_FOR_CSO_OPTIMIZE", message: "Cannot optimize without client and therapist data." }]);
        return;
    }

    setLoadingState({ active: true, message: 'Optimizing current schedule...' });
    setGaStatusMessage(null); 

    try {
        // Ensure schedule entries being passed to GA have IDs
        const scheduleWithIds = schedule.map(entry => ({...entry, id: entry.id || generateScheduleEntryId() }));
        const result: GAGenerationResult = await runCsoAlgorithm(
            clients,
            therapists,
            selectedDate,
            callouts,
            scheduleWithIds 
        );
        processGAGenerationResult(result, 'Optimization');
    } catch (e: any) {
        console.error("Error in CSO schedule optimization process:", e);
        setError([{ ruleId: "CSO_OPTIMIZATION_ERROR", message: e.message || "An unexpected error occurred during CSO schedule optimization." }]);
        setGaStatusMessage(`Error during CSO optimization: ${e.message || "Unknown error."}`);
    } finally {
        setLoadingState({ active: false, message: 'Processing...' });
    }
  }, [schedule, selectedDate, clients, therapists, callouts]);


  const handleTeamFilterChange = (ids: string[]) => setSelectedTeamIds(ids);
  const handleTherapistFilterChange = (ids: string[]) => setSelectedTherapistIds(ids);
  const handleClientFilterChange = (ids: string[]) => setSelectedClientIds(ids);
  const handleClearFilters = () => { setSelectedTeamIds([]); setSelectedTherapistIds([]); setSelectedClientIds([]); };

  const displayedTherapists = useMemo(() => {
    let result = [...therapists];
    if (selectedTeamIds.length > 0) {
        result = result.filter(t => t.teamId && selectedTeamIds.includes(t.teamId));
    }
    if (selectedTherapistIds.length > 0) {
        result = result.filter(t => selectedTherapistIds.includes(t.id));
    }
    return result.sort((a,b) => a.name.localeCompare(b.name));
  }, [therapists, selectedTeamIds, selectedTherapistIds]);

  const displayedSchedule = useMemo(() => {
    if (!schedule) return null;

    const visibleTherapistIds = new Set(displayedTherapists.map(t => t.id));

    let filteredEntries = schedule.filter(entry => {
        // Entry must belong to a therapist that is currently visible
        if (!visibleTherapistIds.has(entry.therapistId)) {
            return false;
        }

        // If client filters are active, apply them
        if (selectedClientIds.length > 0) {
            // If the entry has no client (e.g., lunch), keep it (therapist filter already passed).
            if (entry.clientId === null) return true;
            // If entry has a client, it must be in the selected list.
            return selectedClientIds.includes(entry.clientId);
        }
        return true; // Pass if no client filter is active
    });

    return filteredEntries;
  }, [schedule, selectedClientIds, displayedTherapists]);


  const handleBulkUpdateClients = async (file: File, action: 'ADD_UPDATE' | 'REMOVE'): Promise<BulkOperationSummary> => {
    setLoadingState({active: true, message: "Processing client CSV..."}); setBulkOperationSummary(null); setError(null);
    let summary: BulkOperationSummary = { processedRows: 0, addedCount: 0, updatedCount: 0, removedCount: 0, errorCount: 0, errors: [], newlyAddedSettings: { insuranceRequirements: [] }};
    try {
        const text = await file.text();
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        if (rows.length <= 1) throw new Error("CSV file is empty or has only a header row.");
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        summary.processedRows = rows.length - 1;
        const clientsToProcess: Partial<Client>[] = [];
        const clientNamesToRemove: string[] = [];
        const newInsuranceRequirementsFound = new Set<string>();
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(',');
            const rowData: Record<string, string> = headers.reduce((obj, header, index) => { obj[header] = values[index]?.trim() || ''; return obj; }, {} as Record<string, string>);
            if (!rowData.action || (rowData.action.toUpperCase() !== 'ADD_UPDATE' && rowData.action.toUpperCase() !== 'REMOVE')) { summary.errors.push({ rowNumber: i + 1, message: "Missing or invalid ACTION column.", rowData: rows[i] }); summary.errorCount++; continue; }
            if (!rowData.name) { summary.errors.push({ rowNumber: i + 1, message: "Missing 'name' column.", rowData: rows[i] }); summary.errorCount++; continue; }
            if (rowData.action.toUpperCase() === 'ADD_UPDATE' && action === 'ADD_UPDATE') {
                const clientTeam = availableTeams.find(t => t.name.toLowerCase() === rowData.teamname?.toLowerCase());
                let insuranceReqs: string[] | undefined = rowData.insurancerequirements !== undefined ? (rowData.insurancerequirements ? rowData.insurancerequirements.split(';').map(s => s.trim()).filter(s => s) : []) : undefined;
                if(insuranceReqs) insuranceReqs.forEach(req => newInsuranceRequirementsFound.add(req));
                let ahNeeds: AlliedHealthNeed[] | undefined = rowData.alliedhealthneeds !== undefined ? (rowData.alliedhealthneeds ? rowData.alliedhealthneeds.split(';').map(needStr => { const [type, freqStr, durStr] = needStr.split(':').map(s => s.trim()); return (type === 'OT' || type === 'SLP') && freqStr && durStr ? { type, frequencyPerWeek: parseInt(freqStr) || 1, durationMinutes: parseInt(durStr) || 30 } as AlliedHealthNeed : null; }).filter(n => n) as AlliedHealthNeed[] : []) : undefined;
                const partialClient: Partial<Client> = { name: rowData.name };
                if (clientTeam !== undefined || rowData.teamname !== undefined) partialClient.teamId = clientTeam?.id;
                if (insuranceReqs !== undefined) partialClient.insuranceRequirements = insuranceReqs;
                if (ahNeeds !== undefined) partialClient.alliedHealthNeeds = ahNeeds;
                clientsToProcess.push(partialClient);
            } else if (rowData.action.toUpperCase() === 'REMOVE' && action === 'REMOVE') clientNamesToRemove.push(rowData.name);
        }
        if (action === 'ADD_UPDATE' && clientsToProcess.length > 0) { const result = clientService.addOrUpdateBulkClients(clientsToProcess); summary.addedCount = result.addedCount; summary.updatedCount = result.updatedCount; }
        else if (action === 'REMOVE' && clientNamesToRemove.length > 0) { const result = clientService.removeClientsByNames(clientNamesToRemove); summary.removedCount = result.removedCount; }
        const currentIQs = settingsService.getInsuranceQualifications();
        const allIQs = Array.from(new Set([...currentIQs, ...Array.from(newInsuranceRequirementsFound)]));
        if (allIQs.length > currentIQs.length) { settingsService.updateInsuranceQualifications(allIQs); summary.newlyAddedSettings!.insuranceRequirements = Array.from(newInsuranceRequirementsFound).filter(iq => !currentIQs.includes(iq)); }
    } catch (e: any) { summary.errors.push({ rowNumber: 0, message: `File processing error: ${e.message}` }); summary.errorCount++; }
    finally { setLoadingState({active:false, message:''}); setBulkOperationSummary(summary); }
    return summary;
  };

  const handleBulkUpdateTherapists = async (file: File, action: 'ADD_UPDATE' | 'REMOVE'): Promise<BulkOperationSummary> => {
    setLoadingState({active: true, message: "Processing therapist CSV..."}); setBulkOperationSummary(null); setError(null);
    let summary: BulkOperationSummary = { processedRows: 0, addedCount: 0, updatedCount: 0, removedCount: 0, errorCount: 0, errors: [], newlyAddedSettings: { qualifications: [] } };
    try {
        const text = await file.text();
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        if (rows.length <= 1) throw new Error("CSV file is empty or has only a header row.");
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        summary.processedRows = rows.length - 1;
        const therapistsToProcess: Partial<Omit<Therapist, 'canCoverIndirect'>>[] = [];
        const therapistNamesToRemove: string[] = [];
        const newQualificationsFound = new Set<string>();
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(',');
            const rowData: Record<string, string> = headers.reduce((obj, header, index) => { obj[header] = values[index]?.trim() || ''; return obj; }, {} as Record<string, string>);
            if (!rowData.action || (rowData.action.toUpperCase() !== 'ADD_UPDATE' && rowData.action.toUpperCase() !== 'REMOVE')) { summary.errors.push({ rowNumber: i + 1, message: "Missing or invalid ACTION column.", rowData: rows[i] }); summary.errorCount++; continue; }
            if (!rowData.name) { summary.errors.push({ rowNumber: i + 1, message: "Missing 'name' column.", rowData: rows[i] }); summary.errorCount++; continue; }
            if (rowData.action.toUpperCase() === 'ADD_UPDATE' && action === 'ADD_UPDATE') {
                const therapistTeam = availableTeams.find(t => t.name.toLowerCase() === rowData.teamname?.toLowerCase());
                let qualifications: string[] | undefined = rowData.qualifications !== undefined ? (rowData.qualifications ? rowData.qualifications.split(';').map(s => s.trim()).filter(s => s) : []) : undefined;
                if(qualifications) qualifications.forEach(q => newQualificationsFound.add(q));
                let canProvideAH: AlliedHealthNeed['type'][] | undefined = rowData.canprovidealliedhealth !== undefined ? (rowData.canprovidealliedhealth ? rowData.canprovidealliedhealth.split(';').map(s => s.trim().toUpperCase() as AlliedHealthNeed['type']).filter(s => s === 'OT' || s === 'SLP') : []) : undefined;
                const partialTherapist: Partial<Omit<Therapist, 'canCoverIndirect'>> = { name: rowData.name };
                if (therapistTeam !== undefined || rowData.teamname !== undefined) partialTherapist.teamId = therapistTeam?.id;
                if (qualifications !== undefined) partialTherapist.qualifications = qualifications;
                if (canProvideAH !== undefined) partialTherapist.canProvideAlliedHealth = canProvideAH;
                therapistsToProcess.push(partialTherapist);
            } else if (rowData.action.toUpperCase() === 'REMOVE' && action === 'REMOVE') therapistNamesToRemove.push(rowData.name);
        }
        if (action === 'ADD_UPDATE' && therapistsToProcess.length > 0) { const result = therapistService.addOrUpdateBulkTherapists(therapistsToProcess); summary.addedCount = result.addedCount; summary.updatedCount = result.updatedCount; }
        else if (action === 'REMOVE' && therapistNamesToRemove.length > 0) { const result = therapistService.removeTherapistsByNames(therapistNamesToRemove); summary.removedCount = result.removedCount; }
        const currentIQs = settingsService.getInsuranceQualifications();
        const allCombinedQuals = Array.from(new Set([...currentIQs, ...Array.from(newQualificationsFound)]));
        if (allCombinedQuals.length > currentIQs.length) { settingsService.updateInsuranceQualifications(allCombinedQuals); summary.newlyAddedSettings!.qualifications = Array.from(newQualificationsFound).filter(iq => !currentIQs.includes(iq)); }
    } catch (e: any) { summary.errors.push({ rowNumber: 0, message: `File processing error: ${e.message}` }); summary.errorCount++; }
    finally { setLoadingState({active:false, message:''}); setBulkOperationSummary(summary); }
    return summary;
  };

  const TabButton: React.FC<{tabName: typeof activeTab, label: string, icon: React.ReactNode}> = ({tabName, label, icon}) => ( <button onClick={() => { setError(null); setBulkOperationSummary(null); setGaStatusMessage(null); setActiveTab(tabName);}} className={`flex items-center space-x-2 px-3 sm:px-4 py-3 font-medium rounded-t-lg transition-colors duration-150 whitespace-nowrap ${activeTab === tabName ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-200 hover:text-blue-500'}`}> {icon} <span className="hidden sm:inline">{label}</span> <span className="sm:hidden text-xs">{label.split(' ')[0]}</span> </button> );
  const getFormattedDate = (date: Date | null): string => date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date';
  const getInputFormattedDate = (date: Date | null): string => date ? `${new Date(date.getFullYear(), date.getMonth(), date.getDate()).getFullYear()}-${String(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getMonth() + 1).padStart(2, '0')}-${String(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getDate()).padStart(2, '0')}` : '';
  const PaletteIconComponent = () => (<span dangerouslySetInnerHTML={{ __html: PALETTE_ICON_SVG }} />);
  const ErrorDisplay: React.FC<{ errors: ValidationError[] | null, title?: string }> = ({ errors, title = "Error" }) => { if (!errors || errors.length === 0) return null; return ( <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md shadow" role="alert"> <p className="font-bold mb-2">{title}</p> <ul className="list-disc list-inside space-y-1 text-sm"> {errors.map((err, index) => ( <li key={index}><strong className="capitalize">{err.ruleId.replace(/_/g, ' ').toLowerCase()}:</strong> {err.message}</li> ))} </ul> </div> ); };

  const getCurrentCalloutEntityList = useCallback(() => {
    if (calloutForm.entityType === 'client') {
        return clients.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
    } else { // 'therapist'
        return therapists.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [calloutForm.entityType, clients, therapists]);

  const formatCalloutDateDisplay = (startDateString: string, endDateString: string): string => { const s = new Date(startDateString + 'T00:00:00'), e = new Date(endDateString + 'T00:00:00'), o: Intl.DateTimeFormatOptions={weekday:'short',year:'numeric',month:'short',day:'numeric'}; return (startDateString === endDateString || !endDateString) ? s.toLocaleDateString('en-US',o) : `${s.toLocaleDateString('en-US',o)} to ${e.toLocaleDateString('en-US',o)}`; };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-sky-100 flex flex-col">
      <header className="bg-blue-700 text-white shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ABA Harmony Scheduler (CSO)</h1>
          <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-2 md:space-x-3">
             <div className="flex items-center space-x-2 bg-blue-600 px-3 py-1.5 rounded-md">
                <label htmlFor="scheduleDate" className="text-sm font-medium text-blue-100">Schedule for:</label>
                <input type="date" id="scheduleDate" value={getInputFormattedDate(selectedDate)} onChange={handleDateChange} className="bg-blue-50 text-blue-700 p-1.5 rounded-md border border-blue-300 focus:ring-2 focus:ring-white text-sm"/>
            </div>
            <button
              onClick={handleGenerateScheduleWithGA}
              disabled={loadingState.active || clients.length === 0 || therapists.length === 0 || !selectedDate}
              className="bg-green-500 hover:bg-green-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 sm:px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 flex items-center space-x-2"
              aria-live="polite"
              title={!selectedDate ? "Please select a date first" : (clients.length === 0 || therapists.length === 0 ? "Add clients and therapists first" : `Generate schedule for ${getFormattedDate(selectedDate)} using CSO Algorithm`)}
            >
              {loadingState.active && loadingState.message.toLowerCase().includes("cso") ? <LoadingSpinner size="sm" /> : <CalendarIcon className="w-5 h-5" />}
              <span className="text-sm sm:text-base">{loadingState.active && loadingState.message.toLowerCase().includes("cso") ? loadingState.message : `Generate for ${getFormattedDate(selectedDate)}`}</span>
            </button>
            <button
              onClick={handleOptimizeCurrentScheduleWithGA}
              disabled={loadingState.active || !schedule || !selectedDate || clients.length === 0 || therapists.length === 0}
              className="bg-purple-500 hover:bg-purple-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 sm:px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 flex items-center space-x-2"
              aria-live="polite"
              title={!schedule || !selectedDate ? "Load or generate a schedule first" : (clients.length === 0 || therapists.length === 0 ? "Client/Therapist data missing" : "Optimize current schedule with CSO Algorithm")}
            >
              {loadingState.active && loadingState.message.toLowerCase().includes("optimizing") ? <LoadingSpinner size="sm" /> : <SparklesIcon className="w-5 h-5" />}
              <span className="text-sm sm:text-base">{loadingState.active && loadingState.message.toLowerCase().includes("optimizing") ? loadingState.message : "Evolve Current"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-grow">
        <div className="bg-white p-1 sm:p-2 rounded-lg shadow-xl mb-8">
          <div className="flex border-b border-slate-200 overflow-x-auto">
            <TabButton tabName="clients" label="Clients" icon={<UserGroupIcon className="w-5 h-5" />} /> <TabButton tabName="therapists" label="Therapists" icon={<UserGroupIcon className="w-5 h-5" />} /> <TabButton tabName="schedule" label="View Schedule" icon={<ClockIcon className="w-5 h-5" />} /> <TabButton tabName="baseSchedules" label="Base Schedules" icon={<ClipboardDocumentListIcon className="w-5 h-5" />} /> <TabButton tabName="callouts" label="Callouts" icon={<ClipboardDocumentListIcon className="w-5 h-5" />} /> <TabButton tabName="settings" label="Settings" icon={<PaletteIconComponent />} /> <TabButton tabName="adminSettings" label="Admin" icon={<Cog8ToothIcon className="w-5 h-5" />} />
          </div>
          <div className="p-3 sm:p-4 md:p-6">
            {activeTab !== 'schedule' && activeTab !== 'adminSettings' && !isSessionModalOpen && <ErrorDisplay errors={error} title="Configuration Alert" />}
            {activeTab === 'schedule' && !isSessionModalOpen && <ErrorDisplay errors={error} title="Schedule Validation Info" />}
            {activeTab === 'schedule' && gaStatusMessage && <p className={`text-sm p-3 rounded-md my-4 ${error && error.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{gaStatusMessage}</p>}
            {activeTab === 'adminSettings' && bulkOperationSummary && bulkOperationSummary.errorCount > 0 && <ErrorDisplay errors={bulkOperationSummary.errors.map(e => ({ruleId: `ROW_${e.rowNumber}`, message: `${e.message} ${e.rowData ? `(Data: ${e.rowData.substring(0,100)}...)` : ''}`}))} title="Bulk Operation Issues"/>}

            {activeTab === 'clients' && ( <div> <div className="flex justify-between items-center mb-6"> <h2 className="text-xl sm:text-2xl font-semibold text-slate-700">Manage Clients</h2> <button onClick={handleAddClient} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-md transition-colors duration-150 flex items-center space-x-2"> <PlusIcon className="w-5 h-5" /><span>Add Client</span></button> </div> <div className="space-y-6"> {clients.map(client => (<ClientForm key={client.id} client={client} therapists={therapists} availableTeams={availableTeams} availableInsuranceQualifications={availableInsuranceQualifications} onUpdate={handleUpdateClient} onRemove={handleRemoveClient} />))} {clients.length === 0 && <p className="text-slate-500 text-center py-4">No clients added yet.</p>} </div> </div> )}
            {activeTab === 'therapists' && ( <div> <div className="flex justify-between items-center mb-6"> <h2 className="text-xl sm:text-2xl font-semibold text-slate-700">Manage Therapists</h2> <button onClick={handleAddTherapist} className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-md transition-colors duration-150 flex items-center space-x-2"> <PlusIcon className="w-5 h-5" /><span>Add Therapist</span></button> </div> <div className="space-y-6"> {therapists.map(therapist => (<TherapistForm key={therapist.id} therapist={therapist} availableTeams={availableTeams} availableInsuranceQualifications={availableInsuranceQualifications} onUpdate={handleUpdateTherapist} onRemove={handleRemoveTherapist} />))} {therapists.length === 0 && <p className="text-slate-500 text-center py-4">No therapists added yet.</p>} </div> </div> )}
            {activeTab === 'schedule' && ( <div className="flex flex-col"> <h2 className="text-xl sm:text-2xl font-semibold text-slate-700 mb-4"> Schedule {selectedDate && `for ${selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`} </h2> <FilterControls allTeams={availableTeams} allTherapists={therapists} allClients={clients} selectedTeamIds={selectedTeamIds} selectedTherapistIds={selectedTherapistIds} selectedClientIds={selectedClientIds} onTeamFilterChange={handleTeamFilterChange} onTherapistFilterChange={handleTherapistFilterChange} onClientFilterChange={handleClientFilterChange} onClearFilters={handleClearFilters} /> {loadingState.active && <div className="flex justify-center items-center py-10"><LoadingSpinner /><span className="ml-3 text-slate-600">{loadingState.message}</span></div>} {!loadingState.active && displayedSchedule && displayedTherapists && <ScheduleView schedule={displayedSchedule} therapists={displayedTherapists} availableTeams={availableTeams} scheduledFullDate={selectedDate} onMoveScheduleEntry={handleMoveScheduleEntry} onOpenEditSessionModal={handleOpenEditSessionModal} onOpenAddSessionModal={handleOpenAddSessionModal} />} {!loadingState.active && displayedSchedule && displayedSchedule.length === 0 && (!error || error.length === 0 || (error && !error.some(e => e.message.toLowerCase().includes("ga-generated schedule is invalid")))) && <p className="text-slate-500 text-center py-10">No schedule entries match filters for {selectedDate ? getFormattedDate(selectedDate) : 'selected date'}, or the algorithm returned empty/invalid. Check messages above.</p>} {!loadingState.active && !displayedSchedule && !error && <p className="text-slate-500 text-center py-10">Select a date & "Generate Schedule". Then apply filters.</p>} </div> )}
            {activeTab === 'settings' && (<SettingsPanel availableTeams={availableTeams} availableInsuranceQualifications={availableInsuranceQualifications} onUpdateTeams={handleUpdateTeams} onUpdateInsuranceQualifications={handleUpdateInsuranceQualifications}/>)}
            {activeTab === 'baseSchedules' && (<BaseScheduleManager baseSchedules={baseSchedules} onAddConfig={handleAddBaseScheduleConfig} onUpdateConfigName={handleUpdateBaseScheduleConfigName} onUpdateConfigDays={handleUpdateBaseScheduleConfigDays} onDeleteConfig={handleDeleteBaseScheduleConfig} onSetAsBase={handleSetCurrentGeneratedScheduleAsBase} onViewBase={handleViewBaseSchedule} currentGeneratedScheduleIsSet={schedule !== null && schedule.length > 0}/>)}
            {activeTab === 'adminSettings' && ( <AdminSettingsPanel availableTeams={availableTeams} onBulkUpdateClients={handleBulkUpdateClients} onBulkUpdateTherapists={handleBulkUpdateTherapists} onUpdateInsuranceQualifications={handleUpdateInsuranceQualifications} /> )}
            {activeTab === 'callouts' && ( <div> <h2 className="text-xl sm:text-2xl font-semibold text-slate-700 mb-6">Manage Callouts/Unavailability</h2> <form onSubmit={handleAddCallout} className="bg-slate-50 p-4 sm:p-6 rounded-lg shadow-md border border-slate-200 mb-8 space-y-4"> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label htmlFor="calloutEntityType" className="block text-sm font-medium text-slate-600 mb-1">Entity Type</label> <select id="calloutEntityType" value={calloutForm.entityType} onChange={(e) => handleCalloutFormChange('entityType', e.target.value)} className="form-select block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"> <option value="client">Client</option> <option value="therapist">Therapist</option> </select> </div> <div> <label htmlFor="calloutEntityId" className="block text-sm font-medium text-slate-600 mb-1">Select {calloutForm.entityType === 'client' ? 'Client' : 'Therapist'}</label> <select key={calloutForm.entityType} id="calloutEntityId" value={calloutForm.entityId} onChange={(e) => handleCalloutFormChange('entityId', e.target.value)} required className="form-select block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"> <option value="">-- Select --</option> {getCurrentCalloutEntityList().map(entity => (<option key={entity.id} value={entity.id}>{entity.name}</option>))} </select> </div> </div> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label htmlFor="calloutStartDate" className="block text-sm font-medium text-slate-600 mb-1">Start Date</label> <input type="date" id="calloutStartDate" value={calloutForm.startDate} onChange={(e) => handleCalloutFormChange('startDate', e.target.value)} required className="form-input block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/> </div> <div> <label htmlFor="calloutEndDate" className="block text-sm font-medium text-slate-600 mb-1">End Date (Optional)</label> <input type="date" id="calloutEndDate" value={calloutForm.endDate || ''} onChange={(e) => handleCalloutFormChange('endDate', e.target.value)} className="form-input block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"/> <p className="text-xs text-slate-500 mt-1">Leave blank or same as Start Date for a single-day callout.</p> </div> </div> <div className="grid grid-cols-2 gap-4"> <div> <label htmlFor="calloutStartTime" className="block text-sm font-medium text-slate-600 mb-1">Start Time</label> <select id="calloutStartTime" value={calloutForm.startTime} onChange={(e) => handleCalloutFormChange('startTime', e.target.value)} required className="form-select block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"> {TIME_SLOTS_H_MM.map(ts => <option key={`co-start-${ts}`} value={ts}>{ts}</option>)} </select> </div> <div> <label htmlFor="calloutEndTime" className="block text-sm font-medium text-slate-600 mb-1">End Time</label> <select id="calloutEndTime" value={calloutForm.endTime} onChange={(e) => handleCalloutFormChange('endTime', e.target.value)} required className="form-select block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"> {TIME_SLOTS_H_MM.map(ts => <option key={`co-end-${ts}`} value={ts}>{ts}</option>)} </select> </div> </div> <div> <label htmlFor="calloutReason" className="block text-sm font-medium text-slate-600 mb-1">Reason (Optional)</label> <input type="text" id="calloutReason" value={calloutForm.reason || ''} onChange={(e) => handleCalloutFormChange('reason', e.target.value)} className="form-input block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., Doctor's Appointment"/> </div> <button type="submit" className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-md transition-colors duration-150 flex items-center space-x-2"> <PlusIcon className="w-5 h-5"/><span>Add Callout</span> </button> </form> <div className="mt-8"> <h3 className="text-lg font-semibold text-slate-700 mb-3">Recorded Callouts</h3> {callouts.length === 0 ? (<p className="text-slate-500">No callouts recorded yet.</p>) : ( <ul className="space-y-3"> {callouts.map(co => ( <li key={co.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-white rounded-md border border-slate-200 shadow-sm space-y-2 sm:space-y-0"> <div> <span className="font-semibold text-slate-800">{co.entityName}</span> ({co.entityType}) <br/> <span className="text-sm text-slate-600"> {formatCalloutDateDisplay(co.startDate, co.endDate)} from {co.startTime} to {co.endTime} </span> {co.reason && <p className="text-xs text-slate-500 italic">Reason: {co.reason}</p>} </div> <button onClick={() => handleRemoveCallout(co.id)} className="text-red-500 hover:text-red-700 transition-colors self-start sm:self-center" aria-label="Remove Callout"> <TrashIcon className="w-5 h-5"/> </button> </li> ))} </ul> )} </div> </div> )}
          </div>
        </div>
      </main>

      {isSessionModalOpen && ( <SessionModal isOpen={isSessionModalOpen} onClose={handleCloseSessionModal} onSave={handleSaveSession} onDelete={sessionToEdit ? handleDeleteSession : undefined} sessionData={sessionToEdit} newSessionSlot={newSessionSlotDetails} clients={clients} therapists={therapists} availableSessionTypes={ALL_SESSION_TYPES} timeSlots={TIME_SLOTS_H_MM} currentSchedule={schedule || []} currentError={error} clearError={() => setError(null)} /> )}
      <footer className="bg-blue-700 text-blue-100 py-4 text-center text-sm"> <p>&copy; {new Date().getFullYear()} ABA Harmony Scheduler. CSO Enhanced Scheduling.</p> </footer>
    </div>
  );
};

export default App;
