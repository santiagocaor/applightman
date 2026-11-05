// js/store.js
import { recordMonthKey } from './utils.js';

// Lee JSON de localStorage sin romper la app si el contenido está dañado
export function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const value = JSON.parse(raw);
        return value === null || value === undefined ? fallback : value;
    } catch (error) {
        console.warn(`Donnée locale illisible (${key}) :`, error);
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.warn(`Écriture locale impossible (${key}) :`, error);
        return false;
    }
}

function readArray(key) {
    const value = readJson(key, []);
    return Array.isArray(value) ? value : [];
}

// Google Sheets devuelve números cuando la celda es numérica: todo se pasa a texto en un solo lugar
function toText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

const RECORD_TEXT_FIELDS = ['uuid', 'id_item', 'description', 'categorie', 'tache', 'locataire', 'etage', 'num_bon', 'num_tache', 'num_soumission', 'note'];

function normalizeRecord(record) {
    const normalized = { ...record };
    RECORD_TEXT_FIELDS.forEach(field => {
        normalized[field] = toText(record[field]);
    });
    normalized.date = record.date || record.fecha || "";
    return normalized;
}

function normalizeItem(item) {
    return {
        ...item,
        id: toText(item.id),
        description: toText(item.description),
        categorie: toText(item.categorie)
    };
}

function normalizeOptions(options) {
    const source = options || {};
    const list = (value) => (Array.isArray(value) ? value : []);
    return {
        ...source,
        opciones: list(source.opciones).map(normalizeItem),
        inventory: list(source.inventory).map(normalizeItem),
        etage: list(source.etage).map(toText).filter(Boolean),
        tache: list(source.tache).map(toText).filter(Boolean),
        locataire: list(source.locataire).map(toText).filter(Boolean)
    };
}

export const CONFIG_KEY = "lightman_api_url";
export const TOKEN_KEY = "lightman_api_token";
// [FIX G-1] URL nunca se escribe en el código — el usuario debe configurarla en la pantalla de Configuración
export let apiUrl = localStorage.getItem(CONFIG_KEY) || "";
export let apiToken = localStorage.getItem(TOKEN_KEY) || "";

// Mock Data (solo para el modo de prueba sin URL configurada)
export const mockOptions = {
    opciones: [
        { id: "FC-01", description: "801014 TCP CF14/27K SPIRAL", categorie: "Flux Compact", prix: 4.50 },
        { id: "FC-02", description: "CF11/T2/27K/SPIRAL/E26", categorie: "Flux Compact", prix: 5.25 },
        { id: "LED-01", description: "Ampoule DEL 10 W", categorie: "Éclairage Général", prix: 8.00 }
    ],
    inventory: [
        { id: "FC-01", description: "801014 TCP CF14/27K SPIRAL", categorie: "Flux Compact", prix: 4.50, stock: 25, limite: 5 },
        { id: "FC-02", description: "CF11/T2/27K/SPIRAL/E26", categorie: "Flux Compact", prix: 5.25, stock: 18, limite: 5 },
        { id: "LED-01", description: "Ampoule DEL 10 W", categorie: "Éclairage Général", prix: 8.00, stock: 32, limite: 8 }
    ],
    etage: ["25", "24", "23", "22", "21", "20", "19", "18", "17", "16A", "16", "15", "14", "12", "11", "10", "9", "8", "7A", "7", "6", "5", "4", "3", "2", "1", "RDC", "SS1", "SS2", "SS3"],
    tache: ["Bon de travail", "Tournée"],
    locataire: ["Locataire A", "Locataire B", "Locataire C"]
};

export let appOptions = {
    opciones: [],
    etage: [],
    tache: [],
    locataire: [],
    inventory: []
};

export let records = [];
export let syncQueue = readArray('lightman_sync_queue');
export let editingRecordUuid = null;
export let dataInfo = readJson('lightman_data_info', { loaded: 0, total: 0 });

export function setEditingRecordUuid(uuid) {
    editingRecordUuid = uuid;
}

export function setApiUrl(url) {
    apiUrl = url;
    if (url) {
        localStorage.setItem(CONFIG_KEY, url);
    } else {
        localStorage.removeItem(CONFIG_KEY);
    }
}

export function setApiToken(token) {
    apiToken = token;
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

// Los registros del modo de prueba no deben mezclarse con la caché de Google Sheets
function persistRecords() {
    writeJson(apiUrl ? 'lightman_cloud_records' : 'lightman_local_records', records);
}

function persistSyncQueue() {
    writeJson('lightman_sync_queue', syncQueue);
}

export function setAppOptions(options) {
    appOptions = normalizeOptions(options);
    // El catálogo de prueba nunca se guarda: solo se conserva el catálogo real
    if (apiUrl) writeJson('lightman_app_options', appOptions);
}

export function setRecords(newRecords) {
    records = (Array.isArray(newRecords) ? newRecords : []).map(normalizeRecord);
    persistRecords();
}

export function setDataInfo(loaded, total) {
    dataInfo = { loaded, total: total || loaded };
    writeJson('lightman_data_info', dataInfo);
}

// Carga el catálogo y los registros guardados; devuelve false si no hay datos válidos
export function loadCachedData() {
    const cachedOptions = readJson('lightman_app_options', null);
    const cachedRecords = readJson('lightman_cloud_records', null);
    if (!cachedOptions || !Array.isArray(cachedRecords)) return false;
    appOptions = normalizeOptions(cachedOptions);
    records = cachedRecords.map(normalizeRecord);
    return true;
}

export function loadLocalRecords() {
    records = readArray('lightman_local_records').map(normalizeRecord);
}

// Registros en la nube más los pendientes de sincronizar, sin repetir ninguno
export function getAllRecords() {
    const syncedUuids = new Set(records.map(r => r.uuid));
    const pending = syncQueue
        .filter(r => !syncedUuids.has(toText(r.uuid)))
        .map(r => ({ ...normalizeRecord(r), isPending: true }));
    return [...pending, ...records];
}

export function updateSyncQueue(queue) {
    syncQueue = queue;
    persistSyncQueue();
}

export function addToSyncQueue(record) {
    syncQueue.push(record);
    persistSyncQueue();
}

export function isPendingRecord(uuid) {
    return syncQueue.some(r => toText(r.uuid) === uuid);
}

// Saca de la cola los registros que el servidor ya confirmó; lo agregado mientras tanto sigue pendiente
export function markRecordsSynced(sentRecords) {
    const sentUuids = new Set(sentRecords.map(r => toText(r.uuid)));
    const knownUuids = new Set(records.map(r => r.uuid));
    const newRecords = sentRecords.filter(r => !knownUuids.has(toText(r.uuid))).map(normalizeRecord);
    records = [...newRecords, ...records];
    persistRecords();
    syncQueue = syncQueue.filter(r => !sentUuids.has(toText(r.uuid)));
    persistSyncQueue();
}

// Si un registro ya llegó a la hoja (p. ej. tras un timeout), deja de estar pendiente
export function removeSyncedFromQueue() {
    const syncedUuids = new Set(records.map(r => r.uuid));
    const remaining = syncQueue.filter(r => !syncedUuids.has(toText(r.uuid)));
    if (remaining.length !== syncQueue.length) {
        syncQueue = remaining;
        persistSyncQueue();
    }
}

export function addRecordLocally(record) {
    records = [normalizeRecord(record), ...records];
    persistRecords();
}

export function getHistory() {
    return readArray('lightman_history');
}

export function setHistory(history) {
    writeJson('lightman_history', history);
}

export function addToHistory(record) {
    let history = getHistory();
    history.unshift(record);
    if (history.length > 50) history.pop(); // Mantener solo los últimos 50
    setHistory(history);
}

export function deleteRecordLocally(uuid) {
    // Eliminar de los registros en memoria principal
    records = records.filter(r => r.uuid !== uuid);
    persistRecords();

    // Eliminar de la cola de sincronización
    syncQueue = syncQueue.filter(r => toText(r.uuid) !== uuid);
    persistSyncQueue();

    // Eliminar del historial
    let history = getHistory();
    history = history.filter(r => r.uuid !== uuid);
    setHistory(history);
}

export function editRecordLocally(uuid, updatedRecord) {
    const updatedLocalRecord = { ...updatedRecord, date: updatedRecord.fecha, uuid: uuid };

    // Conserva los campos que el formulario no maneja; el precio guardado solo vale para el mismo artículo
    records = records.map(r => {
        if (r.uuid !== uuid) return r;
        const merged = normalizeRecord({ ...r, ...updatedLocalRecord });
        if (r.id_item !== merged.id_item) delete merged.prix;
        return merged;
    });
    persistRecords();

    syncQueue = syncQueue.map(r => toText(r.uuid) === uuid ? updatedLocalRecord : r);
    persistSyncQueue();

    let history = getHistory();
    history = history.map(r => r.uuid === uuid ? updatedLocalRecord : r);
    setHistory(history);
}

export function getNotes() {
    return readArray('lightman_notes');
}

export function addNote(noteText, color = 'note-blue') {
    const notes = getNotes();
    const newNote = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'note-' + Date.now(),
        text: noteText,
        timestamp: new Date().toISOString(),
        color: color,
        completed: false
    };
    notes.unshift(newNote);
    writeJson('lightman_notes', notes);
    return newNote;
}

export let editingNoteId = null;

export function setEditingNoteId(id) {
    editingNoteId = id;
}

export function deleteNote(id) {
    let notes = getNotes();
    notes = notes.filter(n => n.id !== id);
    writeJson('lightman_notes', notes);
}

export function editNote(id, newText, newColor) {
    let notes = getNotes();
    notes = notes.map(n => n.id === id ? { ...n, text: newText, color: newColor || n.color } : n);
    writeJson('lightman_notes', notes);
}

export function toggleNoteCompletion(id) {
    let notes = getNotes();
    notes = notes.map(n => n.id === id ? { ...n, completed: !n.completed } : n);
    writeJson('lightman_notes', notes);
}

export function clearCompletedNotes() {
    let notes = getNotes();
    notes = notes.filter(n => !n.completed);
    writeJson('lightman_notes', notes);
}

// [FIX M-7] Función centralizada de filtrado — usada por charts.js y ui.js para evitar duplicación de lógica
export function filterRecords(records, { month = 'all', etage = 'all', tache = 'all', locataire = 'all', categorie = 'all', description = 'all' } = {}) {
    let filtered = [...records];

    if (month !== 'all') {
        filtered = filtered.filter(r => recordMonthKey(r) === month);
    }

    if (etage !== 'all') {
        filtered = filtered.filter(r => String(r.etage).trim() === etage);
    }

    if (tache !== 'all') {
        filtered = filtered.filter(r => r.tache === tache);
    }

    if (locataire !== 'all') {
        filtered = filtered.filter(r => String(r.locataire || "").trim() === locataire);
    }

    if (categorie !== 'all') {
        filtered = filtered.filter(r => {
            let recCat = r.categorie;
            if (!recCat && r.id_item) {
                const foundOpt = appOptions.opciones.find(opt => opt.id === r.id_item);
                if (foundOpt) recCat = foundOpt.categorie;
            }
            return recCat === categorie;
        });
    }

    if (description !== 'all') {
        filtered = filtered.filter(r => {
            const idKey = r.id_item || 'Inconnu';
            const foundOpt = appOptions.opciones.find(opt => opt.id === idKey);
            const desc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || idKey);
            return desc === description;
        });
    }

    return filtered;
}
