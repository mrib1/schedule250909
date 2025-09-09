
import { Client, AlliedHealthNeed } from '../types';

const CLIENTS_STORAGE_KEY = 'allyScheduler.clients';

// Initial default data is now empty
const initialDefaultClients: Client[] = [];

let _clients: Client[] = [];
const listeners: Array<(clients: Client[]) => void> = [];

const loadClients = () => {
  try {
    const storedClients = localStorage.getItem(CLIENTS_STORAGE_KEY);
    _clients = storedClients ? JSON.parse(storedClients) : initialDefaultClients;
  } catch (error) {
    console.warn("Error loading clients from localStorage:", error);
    _clients = initialDefaultClients; // Fallback to initial defaults (now empty)
  }
};

const persistClients = () => {
  try {
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(_clients));
    listeners.forEach(listener => listener([..._clients])); // Notify listeners with a new array instance
  } catch (error) {
    console.warn("Error persisting clients to localStorage:", error);
  }
};

// Load initial data
loadClients();

export const getClients = (): Client[] => {
  return [..._clients]; // Return a copy
};

export const addClient = (newClientData: Omit<Client, 'id'>): Client => {
  const clientWithId: Client = { ...newClientData, id: `c${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
  _clients = [..._clients, clientWithId];
  persistClients();
  return clientWithId; // Return the newly added client
};

export const updateClient = (updatedClient: Client): Client | undefined => {
  let foundClient: Client | undefined;
  _clients = _clients.map(c => {
    if (c.id === updatedClient.id) {
      foundClient = updatedClient;
      return updatedClient;
    }
    return c;
  });
  persistClients();
  return foundClient;
};

export const removeClient = (clientId: string): boolean => {
  const initialLength = _clients.length;
  _clients = _clients.filter(c => c.id !== clientId);
  const success = _clients.length < initialLength;
  if (success) persistClients();
  return success;
};

export const addOrUpdateBulkClients = (clientsToProcess: Partial<Client>[]): { addedCount: number; updatedCount: number } => {
  let addedCount = 0;
  let updatedCount = 0;

  clientsToProcess.forEach(clientData => {
    if (!clientData.name) return; // Skip if no name

    const existingClientIndex = _clients.findIndex(c => c.name.toLowerCase() === clientData.name!.toLowerCase());

    if (existingClientIndex !== -1) { // Update existing client
      const existingClient = _clients[existingClientIndex];
      _clients[existingClientIndex] = {
        ...existingClient,
        name: clientData.name, // Name is always from clientData for updates if provided
        teamId: clientData.teamId !== undefined ? clientData.teamId : existingClient.teamId,
        insuranceRequirements: clientData.insuranceRequirements !== undefined ? clientData.insuranceRequirements : existingClient.insuranceRequirements,
        alliedHealthNeeds: clientData.alliedHealthNeeds !== undefined ? clientData.alliedHealthNeeds : existingClient.alliedHealthNeeds,
      };
      updatedCount++;
    } else { // Add new client
      addClient({
        name: clientData.name,
        teamId: clientData.teamId || '', 
        insuranceRequirements: clientData.insuranceRequirements || [],
        alliedHealthNeeds: clientData.alliedHealthNeeds || [],
      });
      addedCount++;
    }
  });

  if (addedCount > 0 || updatedCount > 0) {
    persistClients(); // Persist once after all operations
  }
  return { addedCount, updatedCount };
};

export const removeClientsByNames = (clientNamesToRemove: string[]): { removedCount: number } => {
  const initialLength = _clients.length;
  const lowerCaseNamesToRemove = clientNamesToRemove.map(name => name.toLowerCase());
  
  _clients = _clients.filter(client => !lowerCaseNamesToRemove.includes(client.name.toLowerCase()));
  
  const removedCount = initialLength - _clients.length;
  if (removedCount > 0) {
    persistClients();
  }
  return { removedCount };
};


export const subscribeToClients = (listener: (clients: Client[]) => void): (() => void) => {
  listeners.push(listener);
  listener([..._clients]); // Initial call with a copy

  return () => { // Unsubscribe function
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

// Listen for storage changes from other tabs/windows
window.addEventListener('storage', (event) => {
  if (event.key === CLIENTS_STORAGE_KEY && event.newValue) {
    try {
      _clients = JSON.parse(event.newValue);
      listeners.forEach(listener => listener([..._clients]));
    } catch (error) {
      console.warn('Error parsing clients from storage event:', error);
    }
  }
});
