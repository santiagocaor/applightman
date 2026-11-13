// js/store.js
import { recordMonthKey, monthInPeriod, setCategoryOrder, toDateOnly, isElevator, ELEVATOR_GROUP } from './utils.js';

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
    // Todas las fechas se guardan como "AAAA-MM-DD": gráficas, historial y formularios leen el mismo día
    normalized.date = toDateOnly(record.date || record.fecha);
    if (record.fecha !== undefined) normalized.fecha = toDateOnly(record.fecha);
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
        opciones: list(source.opciones).map(normalizeItem),
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
    etage: ["25", "24", "23", "22", "21", "20", "19", "18", "17", "16A", "16", "15", "14", "12", "11", "10", "9", "8", "7A", "7", "6", "5", "4", "3", "2", "1", "RDC", "SS1", "SS2", "SS3"],
    tache: ["Bon de travail", "Tournée"],
    locataire: ["Locataire A", "Locataire B", "Locataire C"]
};

export let appOptions = {
    opciones: [],
    etage: [],
    tache: [],
    locataire: []
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

// Orden de las categorías para sus colores: de la más usada (tono más oscuro) a la menos usada,
// contando todos los registros; después, las del catálogo sin registros. Como se cuenta todo,
// los filtros no cambian el color de una categoría.
function refreshCategoryOrder() {
    const totals = {};
    records.forEach(r => {
        const cat = String(r.categorie ?? '').trim();
        if (cat) totals[cat] = (totals[cat] || 0) + Number(r.quantite || 0);
    });
    const fromRecords = Object.keys(totals).sort((a, b) => totals[b] - totals[a] || a.localeCompare(b, 'fr'));
    const fromCatalog = appOptions.opciones.map(item => item.categorie);
    setCategoryOrder([...fromRecords, ...fromCatalog]);
}

export function setAppOptions(options) {
    appOptions = normalizeOptions(options);
    refreshCategoryOrder();
    // El catálogo de prueba nunca se guarda: solo se conserva el catálogo real
    if (apiUrl) writeJson('lightman_app_options', appOptions);
}

export function setRecords(newRecords) {
    records = (Array.isArray(newRecords) ? newRecords : []).map(normalizeRecord);
    refreshCategoryOrder();
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
    refreshCategoryOrder();
    return true;
}

export function loadLocalRecords() {
    records = readArray('lightman_local_records').map(normalizeRecord);
    refreshCategoryOrder();
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
        if (r.id_item !== merged.id_item && updatedRecord.prix === undefined) delete merged.prix;
        return merged;
    });
    persistRecords();

    syncQueue = syncQueue.map(r => toText(r.uuid) === uuid ? updatedLocalRecord : r);
    persistSyncQueue();

    let history = getHistory();
    history = history.map(r => r.uuid === uuid ? updatedLocalRecord : r);
    setHistory(history);
}

// Última comparación elegida en cada gráfica de Stats ("refs", "locataires"): se conserva para no volver a buscarla
// Borrador del formulario de Saisie: se conserva si la app se cierra o se recarga a medias.
// Un borrador de hace más de 12 horas se descarta.
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function getDraft(now = Date.now()) {
    const draft = readJson('lightman_draft', null);
    if (!draft || typeof draft !== 'object' || !draft.values || typeof draft.values !== 'object') return null;
    if (!(now - Number(draft.savedAt) <= DRAFT_MAX_AGE_MS)) return null;
    return draft.values;
}

export function setDraft(values) {
    writeJson('lightman_draft', { values, savedAt: Date.now() });
}

export function clearDraft() {
    try {
        localStorage.removeItem('lightman_draft');
    } catch (error) {
        console.warn("Impossible d'effacer le brouillon :", error);
    }
}

// El historial se muestra agrupado por bon o tournée salvo que se desactive
export function getHistoryGrouped() {
    return readJson('lightman_history_grouped', true) !== false;
}

export function setHistoryGrouped(value) {
    writeJson('lightman_history_grouped', Boolean(value));
}

// Si está activo, tras guardar se conservan los datos de la visita para anotar la línea siguiente
export function getKeepVisit() {
    return readJson('lightman_keep_visit', false) === true;
}

export function setKeepVisit(value) {
    writeJson('lightman_keep_visit', Boolean(value));
}

const compareKey = (name) => `lightman_compare_${name}`;

export function getCompareSelection(name = 'refs') {
    const value = readJson(compareKey(name), {});
    return { a: toText(value && value.a), b: toText(value && value.b) };
}

export function setCompareSelection(a, b, name = 'refs') {
    writeJson(compareKey(name), { a: toText(a), b: toText(b) });
}

// ------------------------------------------------------------
// Notas: se guardan en el teléfono y se copian en la pestaña "Notes" de Google Sheets.
// Cada cambio entra en una cola (guardar o borrar una nota). La cola se envía cuando hay conexión;
// al recibir las notas de la hoja, los cambios aún pendientes se vuelven a aplicar encima,
// así nada de lo hecho sin conexión se pierde y lo borrado en otro teléfono desaparece aquí también.
// ------------------------------------------------------------
const NOTES_KEY = 'lightman_notes';
const NOTES_QUEUE_KEY = 'lightman_notes_queue';
const NOTES_UPLOADED_KEY = 'lightman_notes_uploaded';

export let notesQueue = readArray(NOTES_QUEUE_KEY);
let notesListener = null;

// app.js se suscribe para enviar la cola en cuanto cambia una nota
export function onNotesChanged(listener) {
    notesListener = listener;
}

function writeNotes(notes) {
    writeJson(NOTES_KEY, notes);
}

// Solo queda la última operación de cada nota; seq ordena las operaciones para saber cuáles ya se enviaron
function queueNoteOperation(operation) {
    const seq = notesQueue.reduce((max, item) => Math.max(max, item.seq || 0), 0) + 1;
    notesQueue = [...notesQueue.filter(item => item.id !== operation.id), { ...operation, seq }];
    writeJson(NOTES_QUEUE_KEY, notesQueue);
    if (notesListener) notesListener();
}

function queueNoteSave(note) {
    queueNoteOperation({ op: 'save', id: note.id, note });
}

// Lo enviado y confirmado sale de la cola; lo que se cambió mientras tanto (seq mayor) sigue pendiente
export function markNotesSynced(lastSeq) {
    notesQueue = notesQueue.filter(item => (item.seq || 0) > lastSeq);
    writeJson(NOTES_QUEUE_KEY, notesQueue);
}

function applyNoteOperations(notes, operations) {
    let result = [...notes];
    operations.forEach(item => {
        result = result.filter(note => note.id !== item.id);
        if (item.op === 'save' && item.note) result.unshift(item.note);
    });
    return result;
}

function normalizeNote(note) {
    return {
        id: toText(note.id),
        text: toText(note.text),
        color: toText(note.color) || 'note-blue',
        completed: note.completed === true || /^(true|vrai|1)$/i.test(toText(note.completed)),
        timestamp: toText(note.timestamp) || new Date().toISOString()
    };
}

// Notas recibidas de la hoja: pasan a ser las del teléfono, con los cambios pendientes aplicados encima.
// La primera vez, las notas que solo estaban en este teléfono se ponen en la cola para subirlas.
export function applyServerNotes(serverNotes) {
    const fromSheet = (Array.isArray(serverNotes) ? serverNotes : []).map(normalizeNote).filter(note => note.id);
    if (!readJson(NOTES_UPLOADED_KEY, false)) {
        const known = new Set(fromSheet.map(note => note.id));
        getNotes().filter(note => !known.has(note.id)).forEach(note => {
            const seq = notesQueue.reduce((max, item) => Math.max(max, item.seq || 0), 0) + 1;
            if (!notesQueue.some(item => item.id === note.id)) notesQueue.push({ op: 'save', id: note.id, note, seq });
        });
        writeJson(NOTES_QUEUE_KEY, notesQueue);
        writeJson(NOTES_UPLOADED_KEY, true);
    }
    const merged = applyNoteOperations(fromSheet, notesQueue)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    writeNotes(merged);
    return merged;
}

export function getNotes() {
    return readArray(NOTES_KEY);
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
    writeNotes(notes);
    queueNoteSave(newNote);
    return newNote;
}

export let editingNoteId = null;

export function setEditingNoteId(id) {
    editingNoteId = id;
}

export function deleteNote(id) {
    writeNotes(getNotes().filter(n => n.id !== id));
    queueNoteOperation({ op: 'delete', id });
}

function updateNote(id, change) {
    let changed = null;
    writeNotes(getNotes().map(n => {
        if (n.id !== id) return n;
        changed = { ...n, ...change(n) };
        return changed;
    }));
    if (changed) queueNoteSave(changed);
}

export function editNote(id, newText, newColor) {
    updateNote(id, n => ({ text: newText, color: newColor || n.color }));
}

export function toggleNoteCompletion(id) {
    updateNote(id, n => ({ completed: !n.completed }));
}

export function clearCompletedNotes() {
    const completed = getNotes().filter(n => n.completed);
    writeNotes(getNotes().filter(n => !n.completed));
    completed.forEach(n => queueNoteOperation({ op: 'delete', id: n.id }));
}

// [FIX M-7] Función centralizada de filtrado — usada por charts.js y ui.js para evitar duplicación de lógica
export function filterRecords(records, { month = 'all', etage = 'all', tache = 'all', locataire = 'all', categorie = 'all', description = 'all' } = {}) {
    let filtered = [...records];

    if (month !== 'all') {
        filtered = filtered.filter(r => monthInPeriod(recordMonthKey(r), month));
    }

    if (etage !== 'all') {
        // "Ascenseurs" agrupa todas las cabinas (ASC. # n); cualquier otro valor es un piso exacto
        filtered = etage === ELEVATOR_GROUP
            ? filtered.filter(r => isElevator(r.etage))
            : filtered.filter(r => String(r.etage).trim() === etage);
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
