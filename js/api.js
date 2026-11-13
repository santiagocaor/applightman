// js/api.js
import * as store from './store.js';
import * as ui from './ui.js';
import * as charts from './charts.js';

// Apps Script puede tardar en arrancar, pero con mala señal la pantalla no debe quedar bloqueada
const REQUEST_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') throw new Error("Délai de connexion dépassé", { cause: error });
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function parseResponse(response) {
    if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error("Réponse invalide du serveur", { cause: error });
    }
    if (result.status !== 'success') throw new Error(result.message || 'Erreur serveur');
    return result;
}

async function postToApi(payload) {
    const body = store.apiToken ? { ...payload, token: store.apiToken } : payload;
    const response = await fetchWithTimeout(store.apiUrl, {
        method: 'POST',
        body: JSON.stringify(body)
    });
    return parseResponse(response);
}

// Con token los datos se piden por POST: así el token nunca viaja en la URL
async function requestCloudData() {
    if (store.apiToken) return postToApi({ action: 'getData' });
    const response = await fetchWithTimeout(store.apiUrl + "?action=getData");
    return parseResponse(response);
}

// Un fallo al dibujar una vista no debe impedir que se actualicen las demás
export function refreshViews() {
    [
        charts.populateFilters,
        charts.updateDashboard,
        ui.renderHistory
    ].forEach(render => {
        try {
            render();
        } catch (error) {
            console.error("Render Error:", error);
        }
    });
}

function setSyncIconSpinning(isSpinning) {
    const icon = ui.elements.syncBtn ? ui.elements.syncBtn.querySelector('.material-symbols-rounded') : null;
    if (icon) icon.classList.toggle('md-spin', isSpinning);
}

export async function fetchDataFromCloud(showBlockingLoader = true) {
    if (showBlockingLoader) {
        ui.showLoader("Synchronisation des données...");
    } else {
        setSyncIconSpinning(true);
    }

    try {
        const data = await requestCloudData();

        if (data.options) store.setAppOptions(data.options);
        store.setRecords(data.records || []);
        store.setDataInfo(store.records.length, data.totalRecords);
        store.removeSyncedFromQueue();

        // Un Apps Script antiguo no envía notas: entonces se quedan solo en el teléfono, como antes
        notesSupported = Array.isArray(data.notes);
        if (notesSupported) {
            store.applyServerNotes(data.notes);
            ui.renderNotes();
            syncNotes();
        }

        ui.updateSyncBadge();
        ui.setConnectionStatus("Connecté à Google Sheets", true);
        ui.populateAllSelects();
        refreshViews();
    } catch (error) {
        console.error("Fetch Error:", error);
        // Los datos reales que ya hay en el dispositivo se conservan: nunca se sustituyen por los de prueba
        ui.setConnectionStatus(`Connexion impossible : ${error.message}`, false);
        if (showBlockingLoader) {
            ui.showToast("Erreur de connexion à Google Sheets. Les données locales sont conservées.", "error");
        }
    } finally {
        if (showBlockingLoader) {
            ui.hideLoader();
        } else {
            setSyncIconSpinning(false);
        }
    }
}

// [FIX G-2] Se elimina mode:'no-cors' — ahora la app puede verificar si el guardado fue exitoso
export async function saveRecordToCloud(record) {
    if (!navigator.onLine) {
        addToOfflineQueue(record);
        return;
    }

    ui.showLoader("Enregistrement...");
    try {
        await postToApi({ action: 'addRecordsBatch', records: [record] });

        if (navigator.vibrate) navigator.vibrate([200]);
        ui.showSavedToast("Enregistrement réussi !", "success", record.uuid);
        store.addToHistory(record);
        store.setRecords([record, ...store.records]);
        ui.resetFormAndRefresh(ui.shouldKeepVisit());
        refreshViews();
    } catch (error) {
        console.error("Save Error:", error);
        addToOfflineQueue(record);
    } finally {
        ui.hideLoader();
    }
}

function addToOfflineQueue(record) {
    store.addToSyncQueue(record);
    ui.updateSyncBadge();
    store.addToHistory(record);
    ui.resetFormAndRefresh(ui.shouldKeepVisit());
    refreshViews();

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const reason = navigator.onLine ? "Serveur inaccessible" : "Hors ligne";
    ui.showSavedToast(`${reason} : Enregistrement sauvegardé localement. Il sera synchronisé dès que la connexion sera rétablie.`, "warning", record.uuid);
}

let isSyncing = false;

// [FIX G-2] Se verifica la respuesta del servidor — antes se asumía éxito siempre
export async function syncOfflineQueue() {
    if (isSyncing || store.syncQueue.length === 0 || !store.apiUrl || !navigator.onLine) return false;

    const batch = [...store.syncQueue];
    isSyncing = true;
    ui.showLoader(`Synchronisation de ${batch.length} éléments...`);

    try {
        await postToApi({ action: 'addRecordsBatch', records: batch });

        store.markRecordsSynced(batch);
        ui.updateSyncBadge();
        refreshViews();
        if (navigator.vibrate) navigator.vibrate([200]);
        ui.showToast("Synchronisation réussie !", "success");

        setTimeout(() => fetchDataFromCloud(false), 1000);
        return true;
    } catch (error) {
        console.error("Sync Error:", error);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        ui.showToast("Erreur lors de la synchronisation. Veuillez réessayer plus tard.", "error");
        return false;
    } finally {
        isSyncing = false;
        ui.hideLoader();
    }
}

let notesSupported = false;
let isSyncingNotes = false;

// Envía a la hoja los cambios de notas pendientes. Sin conexión, sin URL o con un Apps Script que aún
// no conoce las notas, la cola espera. Las notas siguen visibles y editables en el teléfono en todo momento.
export async function syncNotes() {
    if (isSyncingNotes || !notesSupported || store.notesQueue.length === 0 || !store.apiUrl || !navigator.onLine) return;

    const batch = [...store.notesQueue];
    const lastSeq = Math.max(...batch.map(item => item.seq || 0));
    isSyncingNotes = true;
    try {
        const result = await postToApi({
            action: 'syncNotes',
            operations: batch.map(({ op, id, note }) => (op === 'save' ? { op, id, note } : { op, id }))
        });
        store.markNotesSynced(lastSeq);
        if (Array.isArray(result.notes)) {
            store.applyServerNotes(result.notes);
            ui.renderNotes();
        }
    } catch (error) {
        // Se reintenta en la próxima sincronización; la nota ya está guardada en el teléfono
        console.error("Notes Sync Error:", error);
        return;
    } finally {
        isSyncingNotes = false;
    }
    // Lo que se cambió mientras se enviaba sale en un segundo envío
    if (store.notesQueue.length > 0) syncNotes();
}

// [FIX G-2] Se verifica la respuesta del servidor — antes se asumía éxito siempre
export async function deleteRecord(uuid) {
    // Un registro pendiente o del modo de prueba solo existe en este dispositivo
    if (!store.apiUrl || store.isPendingRecord(uuid)) {
        store.deleteRecordLocally(uuid);
        ui.updateSyncBadge();
        refreshViews();
        ui.showToast("Suppression réussie !", "success");
        return;
    }

    if (!navigator.onLine) {
        ui.showToast("Vous devez être en ligne pour supprimer un enregistrement.", "warning");
        return;
    }

    ui.showLoader("Suppression...");
    try {
        await postToApi({ action: 'deleteRecord', uuid: uuid });

        if (navigator.vibrate) navigator.vibrate([200]);
        ui.showToast("Suppression réussie !", "success");

        store.deleteRecordLocally(uuid);
        refreshViews();
    } catch (error) {
        console.error("Delete Error:", error);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        ui.showToast(`Erreur lors de la suppression : ${error.message}`, "error");
    } finally {
        ui.hideLoader();
    }
}

// [FIX G-2] Se verifica la respuesta del servidor — antes se asumía éxito siempre
export async function editRecord(uuid, updatedRecord) {
    // Un registro pendiente o del modo de prueba solo existe en este dispositivo
    if (!store.apiUrl || store.isPendingRecord(uuid)) {
        store.editRecordLocally(uuid, updatedRecord);
        store.setEditingRecordUuid(null);
        ui.resetFormAndRefresh();
        refreshViews();
        ui.showToast("Modification réussie !", "success");
        return;
    }

    if (!navigator.onLine) {
        ui.showToast("Vous devez être en ligne pour modifier un enregistrement.", "warning");
        return;
    }

    ui.showLoader("Modification...");
    try {
        await postToApi({ action: 'editRecord', uuid: uuid, record: updatedRecord });

        if (navigator.vibrate) navigator.vibrate([200]);
        ui.showToast("Modification réussie !", "success");

        store.editRecordLocally(uuid, updatedRecord);

        store.setEditingRecordUuid(null);
        ui.resetFormAndRefresh();
        refreshViews();
    } catch (error) {
        console.error("Edit Error:", error);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        ui.showToast(`Erreur lors de la modification : ${error.message}`, "error");
    } finally {
        ui.hideLoader();
    }
}
