// js/ui.js
import { getCategoryColor, escapeHtml, localDateString, parseRecordDate, sortRecords, groupHistory, orderHistoryItems, historyTotals, recordsToCsv, docReference, DOC_LABELS, visitSummary, recentReferences, etageKey } from './utils.js';
import * as store from './store.js';
import { deleteRecord } from './api.js';

export const elements = {
    form: document.getElementById('record-form'),
    loader: document.getElementById('loader'),
    loaderText: document.getElementById('loader-text'),
    configInput: document.getElementById('api-url'),
    configTokenInput: document.getElementById('api-token'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    connStatus: document.getElementById('connection-status'),
    syncBtn: document.getElementById('sync-btn'),
    dateInput: document.getElementById('date'),
    dateDisplay: document.getElementById('date-display'),
    catSelect: document.getElementById('categorie'),
    idInput: document.getElementById('id_item'),
    descSelect: document.getElementById('description'),
    quantiteInput: document.getElementById('quantite'),
    noteInput: document.getElementById('note'),
    tacheSelect: document.getElementById('tache'),
    groupBon: document.getElementById('group-bon'),
    groupSoumission: document.getElementById('group-soumission'),
    groupTacheNum: document.getElementById('group-tache-num'),
    locataireSelect: document.getElementById('locataire'),
    etageSelect: document.getElementById('etage'),
    numBonInput: document.getElementById('num_bon'),
    numSoumissionInput: document.getElementById('num_soumission'),
    numTacheInput: document.getElementById('num_tache'),
    historyContainer: document.getElementById('history-container'),
    syncBadge: document.getElementById('sync-badge'),
    syncStatus: document.getElementById('sync-status'),
    keepVisitInput: document.getElementById('keep-visit'),
    historySort: document.getElementById('history-sort'),
    recentRefs: document.getElementById('recent-refs'),
    visitSummary: document.getElementById('visit-summary'),
    historyGroupToggle: document.getElementById('history-group'),
    historyExportBtn: document.getElementById('btn-export-history'),
    historyActiveFilters: document.getElementById('history-active-filters'),
    filterMonth: document.getElementById('filter-month'),
    filterEtage: document.getElementById('filter-etage'),
    filterLocataire: document.getElementById('filter-locataire'),
    filterTache: document.getElementById('filter-tache'),
    filterCategorie: document.getElementById('filter-categorie'),
    filterDescription: document.getElementById('filter-description'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
    searchHistory: document.getElementById('search-history'),
    historySummary: document.getElementById('history-summary'),
    reloadAppBtn: document.getElementById('reload-app-btn'),
    
    statAvg: document.getElementById('stat-avg'),
    statTopEtage: document.getElementById('stat-top-etage'),
    statTopProduct: document.getElementById('stat-top-product'),
    statTotal: document.getElementById('stat-total'),
    statsDataNotice: document.getElementById('stats-data-notice'),

    filterHistoryMonth: document.getElementById('filter-history-month'),
    filterHistoryEtage: document.getElementById('filter-history-etage'),
    filterHistoryLocataire: document.getElementById('filter-history-locataire'),
    filterHistoryTache: document.getElementById('filter-history-tache'),
    filterHistoryCategorie: document.getElementById('filter-history-categorie'),
    clearHistoryFiltersBtn: document.getElementById('clear-history-filters-btn'),
    
    noteTextInput: document.getElementById('note-text'),
    saveNoteBtn: document.getElementById('save-note-btn'),
    notesListContainer: document.getElementById('notes-list-container')
};

const HISTORY_PAGE_SIZE = 150;
let lastFilteredHistory = [];
let historyVisibleCount = HISTORY_PAGE_SIZE;
let historyFilterKey = "";

// Cambia de vista y marca la pestaña activa, también para lectores de pantalla
export function setActiveView(targetId) {
    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.getAttribute('data-target') === targetId;
        item.classList.toggle('active', isActive);
        if (isActive) {
            item.setAttribute('aria-current', 'page');
        } else {
            item.removeAttribute('aria-current');
        }
    });
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === targetId);
    });
}

export function setConnectionStatus(text, isOk) {
    if (!elements.connStatus) return;
    elements.connStatus.textContent = text;
    elements.connStatus.className = `status-badge ${isOk ? 'success' : 'error'}`;
}

export function showToast(message, type = 'success', { actionLabel = '', onAction = null, duration = 0 } = {}) {
    const existing = document.getElementById('custom-toast');
    if (existing) existing.remove();

    const iconMap = {
        'success': 'check_circle',
        'error': 'cancel',
        'warning': 'warning',
        'info': 'info'
    };

    const toast = document.createElement('div');
    toast.id = 'custom-toast';
    toast.className = 'toast-container';
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <span aria-hidden="true" class="material-symbols-rounded toast-icon ${type}">${iconMap[type] || iconMap.info}</span>
        <span style="font-weight: 500; font-size: 0.95rem;">${escapeHtml(message)}</span>
        ${actionLabel ? `<button type="button" class="toast-action">${escapeHtml(actionLabel)}</button>` : ''}
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    let hideTimer = null;
    const dismiss = () => {
        clearTimeout(hideTimer);
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    };
    hideTimer = setTimeout(dismiss, duration || 3500);

    const actionButton = toast.querySelector('.toast-action');
    if (actionButton) {
        actionButton.addEventListener('click', () => {
            dismiss();
            if (onAction) onAction();
        });
    }
}

// Aviso tras guardar con "Annuler" unos segundos, que borra la línea recién guardada
export function showSavedToast(message, type, uuid) {
    showToast(message, type, uuid
        ? { actionLabel: 'Annuler', onAction: () => deleteRecord(uuid), duration: 8000 }
        : {});
}

export function showConfirm(message) {
    return new Promise((resolve) => {
        const existing = document.getElementById('custom-confirm');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'custom-confirm';
        overlay.className = 'confirm-overlay';

        // Se vuelve al control de origen al cerrar; el foco inicial va a "Annuler", la opción segura
        const previouslyFocused = document.activeElement;

        overlay.innerHTML = `
            <div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="custom-confirm-text">
                <div class="confirm-content">
                    <span aria-hidden="true" class="material-symbols-rounded confirm-icon">warning</span>
                    <p id="custom-confirm-text">${escapeHtml(message)}</p>
                </div>
                <div class="confirm-actions">
                    <button type="button" class="btn-cancel">Annuler</button>
                    <button type="button" class="btn-confirm">Confirmer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        setTimeout(() => overlay.classList.add('show'), 10);
        
        const cancelButton = overlay.querySelector('.btn-cancel');
        const confirmButton = overlay.querySelector('.btn-confirm');

        const close = (result) => {
            overlay.classList.remove('show');
            if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 300);
        };

        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(true));

        // Teclado: Escape cancela y Tab se queda dentro del diálogo
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                close(false);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                (document.activeElement === cancelButton ? confirmButton : cancelButton).focus();
            }
        });
        cancelButton.focus();
    });
}


export function showLoader(msg = "Chargement...") {
    if (!elements.loader) return;
    elements.loaderText.textContent = msg;
    elements.loader.classList.remove('hidden');
}

export function hideLoader() {
    if (!elements.loader) return;
    elements.loader.classList.add('hidden');
}

export function populateSelect(id, values) {
    const selectElement = document.getElementById(id);
    if (!selectElement) return;
    
    // Rellenar la lista no debe borrar lo que el usuario ya eligió
    const previousValue = selectElement.value;
    const placeholder = selectElement.options[0] ? selectElement.options[0].cloneNode(true) : null;
    selectElement.innerHTML = '';
    if (placeholder) selectElement.appendChild(placeholder);

    const uniqueValues = [...new Set((values || []).map(v => v !== undefined && v !== null ? String(v).trim() : '').filter(Boolean))];
    uniqueValues.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });

    if ([...selectElement.options].some(opt => opt.value === previousValue)) {
        selectElement.value = previousValue;
    }
}

// Los artículos con la misma descripción se distinguen por su ID
export function populateDescriptionSelect(opciones) {
    const selectElement = elements.descSelect;
    if (!selectElement) return;

    const previousDesc = selectElement.value;
    const previousId = elements.idInput ? elements.idInput.value : "";
    const placeholder = selectElement.options[0] ? selectElement.options[0].cloneNode(true) : null;
    selectElement.innerHTML = '';
    if (placeholder) selectElement.appendChild(placeholder);

    const seen = new Set();
    const items = (opciones || []).filter(opt => {
        const key = `${opt.description}\u0000${opt.id}`;
        if (!opt.description || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const descCounts = {};
    items.forEach(opt => {
        descCounts[opt.description] = (descCounts[opt.description] || 0) + 1;
    });

    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.description;
        opt.dataset.id = item.id;
        opt.textContent = descCounts[item.description] > 1 && item.id ? `${item.description} — ${item.id}` : item.description;
        selectElement.appendChild(opt);
    });

    selectDescription(previousDesc, previousId);
}

export function selectDescription(description, id) {
    if (!elements.descSelect) return;
    const options = [...elements.descSelect.options];
    const match = options.find(opt => opt.value === description && opt.dataset.id === id)
        || options.find(opt => opt.value === description);
    if (match) match.selected = true;
}

export function populateAllSelects() {
    if (!store.appOptions) return;

    populateSelect('tache', store.appOptions.tache || []);
    populateSelect('locataire', store.appOptions.locataire || []);
    populateSelect('etage', store.appOptions.etage || []);

    const allCategories = [...new Set(store.appOptions.opciones.map(opt => opt.categorie).filter(Boolean))];
    populateSelect('categorie', allCategories);

    const selectedCat = elements.catSelect ? elements.catSelect.value : "";
    populateDescriptionSelect(selectedCat
        ? store.appOptions.opciones.filter(opt => opt.categorie === selectedCat)
        : store.appOptions.opciones);

    if (elements.idInput && elements.descSelect && !elements.descSelect.value) elements.idInput.value = "";

    renderRecentRefs();
    restoreDraftIfEmpty();
}

export function updateDateDisplay() {
    if (!elements.dateDisplay || !elements.dateInput) return;
    const val = elements.dateInput.value;
    if (val) {
        const parts = val.split('-');
        if (parts.length === 3) {
            const year = parts[0];
            const monthIndex = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            
            const months = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
            
            elements.dateDisplay.textContent = `${day}-${months[monthIndex]}-${year}`;
            elements.dateDisplay.classList.remove('placeholder-active');
            return;
        }
    }
    elements.dateDisplay.textContent = "Sélectionnez la date";
    elements.dateDisplay.classList.add('placeholder-active');
}

// Aviso visible en el encabezado cuando no hay conexión o quedan registros sin enviar
function updateSyncStatus() {
    const pill = elements.syncStatus;
    if (!pill) return;
    const pending = store.syncQueue.length;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offline && pending === 0) {
        pill.classList.add('hidden-field');
        return;
    }
    const pendingText = `${pending} en attente`;
    const text = offline ? (pending > 0 ? `Hors ligne · ${pendingText}` : 'Hors ligne') : pendingText;
    pill.innerHTML = `<span aria-hidden="true" class="material-symbols-rounded">${offline ? 'cloud_off' : 'sync_problem'}</span><span>${escapeHtml(text)}</span>`;
    pill.title = offline ? 'Pas de connexion : les enregistrements seront envoyés au retour du réseau' : 'Toucher pour synchroniser maintenant';
    pill.classList.remove('hidden-field');
}

export function updateSyncBadge() {
    if (elements.syncBadge) {
        if (store.syncQueue.length > 0) {
            elements.syncBadge.textContent = store.syncQueue.length;
            elements.syncBadge.classList.remove('hidden');
        } else {
            elements.syncBadge.classList.add('hidden');
        }
    }
    updateSyncStatus();
}

export function shouldKeepVisit() {
    return Boolean(elements.keepVisitInput && elements.keepVisitInput.checked);
}

// ---------- Saisie: borrador, artículos recientes y resumen de la visita ----------
const DRAFT_FIELDS = ['date', 'tache', 'num_bon', 'num_soumission', 'num_tache', 'locataire', 'etage', 'categorie', 'description', 'id_item', 'quantite', 'note'];
const DRAFT_CONTENT_FIELDS = ['tache', 'num_bon', 'num_soumission', 'num_tache', 'locataire', 'etage', 'categorie', 'description', 'note'];
let draftTimer = null;
let restoringDraft = false;
let recentList = [];

function readFormValues() {
    const values = {};
    DRAFT_FIELDS.forEach(name => {
        const field = elements.form ? elements.form.elements[name] : null;
        values[name] = field ? String(field.value ?? '') : '';
    });
    return values;
}

function hasDraftContent(values) {
    return DRAFT_CONTENT_FIELDS.some(name => values[name]) || Boolean(values.quantite && values.quantite !== '1');
}

function cancelDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = null;
}

function saveDraftNow() {
    cancelDraftSave();
    if (!elements.form || restoringDraft || store.editingRecordUuid) return;
    const values = readFormValues();
    if (hasDraftContent(values)) {
        store.setDraft(values);
    } else {
        store.clearDraft();
    }
}

function scheduleDraftSave() {
    if (restoringDraft) return;
    cancelDraftSave();
    draftTimer = setTimeout(saveDraftNow, 400);
}

// Devuelve al formulario lo que se estaba escribiendo, solo si el formulario está vacío
function restoreDraftIfEmpty() {
    if (!elements.form || store.editingRecordUuid) return;
    if (hasDraftContent(readFormValues())) return;
    const draft = store.getDraft();
    if (!draft || !hasDraftContent(draft)) return;

    restoringDraft = true;
    try {
        if (draft.date && elements.dateInput) {
            elements.dateInput.value = draft.date;
            updateDateDisplay();
        }
        if (elements.locataireSelect) elements.locataireSelect.value = draft.locataire || '';
        if (elements.etageSelect) elements.etageSelect.value = draft.etage || '';
        if (elements.tacheSelect && draft.tache) {
            elements.tacheSelect.value = draft.tache;
            // El cambio de tarea muestra el campo de número correspondiente (y lo vacía): el número se pone después
            elements.tacheSelect.dispatchEvent(new Event('change'));
            if (elements.numBonInput) elements.numBonInput.value = draft.num_bon || '';
            if (elements.numSoumissionInput) elements.numSoumissionInput.value = draft.num_soumission || '';
            if (elements.numTacheInput) elements.numTacheInput.value = draft.num_tache || '';
        }
        if (elements.catSelect && draft.categorie) {
            elements.catSelect.value = draft.categorie;
            elements.catSelect.dispatchEvent(new Event('change'));
        }
        if (draft.description) {
            selectDescription(draft.description, draft.id_item || '');
            if (elements.idInput) elements.idInput.value = draft.id_item || '';
        }
        if (elements.quantiteInput && draft.quantite) elements.quantiteInput.value = draft.quantite;
        if (elements.noteInput) elements.noteInput.value = draft.note || '';
    } finally {
        restoringDraft = false;
    }
    updateVisitSummary();
    if (hasDraftContent(readFormValues())) showToast("Brouillon restauré.", "info");
}

// Los 5 últimos artículos guardados que siguen en el catálogo, como botones de un toque
function renderRecentRefs() {
    const container = elements.recentRefs;
    if (!container) return;
    const catalog = store.appOptions.opciones || [];
    recentList = recentReferences(store.getHistory(), 15)
        .map(entry => {
            const option = catalog.find(opt => (entry.id ? opt.id === entry.id : opt.description === entry.description));
            return option ? { id: option.id, description: option.description, categorie: option.categorie || entry.categorie } : null;
        })
        .filter(Boolean)
        .slice(0, 5);

    container.innerHTML = recentList.map((entry, index) =>
        `<button type="button" class="recent-chip" data-ref-index="${index}" title="${escapeHtml(entry.description)}">${escapeHtml(entry.description)}</button>`
    ).join('');
    const group = document.getElementById('recent-refs-group');
    if (group) group.classList.toggle('hidden-field', recentList.length === 0);
}

function applyRecentReference(entry) {
    if (!entry) return;
    if (elements.catSelect) {
        elements.catSelect.value = entry.categorie || '';
        elements.catSelect.dispatchEvent(new Event('change'));
    }
    if (!elements.descSelect) return;
    const option = [...elements.descSelect.options].find(opt => (entry.id ? opt.dataset.id === entry.id : opt.value === entry.description));
    if (option) {
        option.selected = true;
        elements.descSelect.dispatchEvent(new Event('change'));
    }
    // Los eventos de arriba no suben hasta el formulario: el borrador se actualiza aquí
    scheduleDraftSave();
}

// Lo ya anotado para el bon, la tournée o la soumission que se está escribiendo
function updateVisitSummary() {
    const el = elements.visitSummary;
    if (!el) return;
    const summary = visitSummary(store.getAllRecords(), {
        tache: elements.tacheSelect ? elements.tacheSelect.value : '',
        num_bon: elements.numBonInput ? elements.numBonInput.value : '',
        num_tache: elements.numTacheInput ? elements.numTacheInput.value : '',
        num_soumission: elements.numSoumissionInput ? elements.numSoumissionInput.value : '',
        date: elements.dateInput ? elements.dateInput.value : ''
    });
    if (!summary || summary.lines === 0) {
        el.classList.add('hidden-field');
        el.textContent = '';
        return;
    }
    el.textContent = `${DOC_LABELS[summary.kind]} #${summary.number} : ${pluralize(summary.lines, 'ligne')} et ${pluralize(summary.bulbs, 'ampoule')} déjà enregistrées ce jour-là.`;
    el.classList.remove('hidden-field');
}

export function initEntryForm() {
    if (!elements.form) return;
    const onFormChange = () => {
        updateVisitSummary();
        scheduleDraftSave();
    };
    elements.form.addEventListener('input', onFormChange);
    elements.form.addEventListener('change', onFormChange);
    if (elements.recentRefs) {
        elements.recentRefs.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-ref-index]');
            if (chip) applyRecentReference(recentList[Number(chip.dataset.refIndex)]);
        });
    }
}

export function resetFormAndRefresh(keepVisit = false) {
    // Lo escrito ya se guardó o se descartó: el borrador anterior ya no vale
    cancelDraftSave();
    store.clearDraft();

    // form.reset() también desmarca la casilla: su estado se conserva
    const keepChecked = shouldKeepVisit();
    const visit = keepVisit ? {
        date: elements.dateInput ? elements.dateInput.value : '',
        tache: elements.tacheSelect ? elements.tacheSelect.value : '',
        numBon: elements.numBonInput ? elements.numBonInput.value : '',
        numSoumission: elements.numSoumissionInput ? elements.numSoumissionInput.value : '',
        numTache: elements.numTacheInput ? elements.numTacheInput.value : '',
        locataire: elements.locataireSelect ? elements.locataireSelect.value : '',
        etage: elements.etageSelect ? elements.etageSelect.value : ''
    } : null;

    if (elements.form) elements.form.reset();
    if (elements.keepVisitInput) elements.keepVisitInput.checked = keepChecked;
    if (elements.dateInput) {
        elements.dateInput.value = localDateString();
        updateDateDisplay();
    }
    if (elements.groupBon) elements.groupBon.classList.add('hidden-field');
    if (elements.groupSoumission) elements.groupSoumission.classList.add('hidden-field');
    if (elements.groupTacheNum) elements.groupTacheNum.classList.add('hidden-field');
    if (elements.numBonInput) elements.numBonInput.required = false;
    if (elements.numSoumissionInput) elements.numSoumissionInput.required = false;
    if (elements.numTacheInput) elements.numTacheInput.required = false;
    if (elements.descSelect) {
        elements.descSelect.innerHTML = '<option value="" disabled selected>Sélectionnez une description</option>';
    }
    
    populateAllSelects();
    
    if (visit) restoreVisit(visit);

    // Reset edit state
    store.setEditingRecordUuid(null);
    if (elements.form) {
        const submitBtn = elements.form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">save</span> Enregistrer';
        }
        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }

    if (visit) saveDraftNow();
    updateVisitSummary();
}

// Devuelve al formulario los datos de la visita para anotar otra línea del mismo bon o tournée
function restoreVisit(visit) {
    if (elements.dateInput && visit.date) {
        elements.dateInput.value = visit.date;
        updateDateDisplay();
    }
    if (elements.locataireSelect) elements.locataireSelect.value = visit.locataire;
    if (elements.etageSelect) elements.etageSelect.value = visit.etage;
    if (elements.tacheSelect && visit.tache) {
        elements.tacheSelect.value = visit.tache;
        // El cambio de tarea muestra el campo de número correspondiente (y lo vacía): el número se pone después
        elements.tacheSelect.dispatchEvent(new Event('change'));
        if (elements.numBonInput) elements.numBonInput.value = visit.numBon;
        if (elements.numSoumissionInput) elements.numSoumissionInput.value = visit.numSoumission;
        if (elements.numTacheInput) elements.numTacheInput.value = visit.numTache;
    }
}

const HISTORY_MONTH_NAMES = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function formatHistoryDate(value) {
    try {
        const d = parseRecordDate(value);
        if (!isNaN(d)) return `${d.getDate()} ${HISTORY_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    } catch (error) {
        console.warn("Date illisible :", error);
    }
    return String(value || "-");
}

// Descripción visible de un registro (la del catálogo si existe)
function historyDescription(record) {
    const foundOpt = store.appOptions.opciones.find(opt => opt.id === record.id_item);
    return (foundOpt && foundOpt.description) ? foundOpt.description : (record.description || record.id_item || 'N/A');
}

function historyActionsHtml(r) {
    const pendingLabel = r.isPending ? 'En attente de synchronisation' : 'Synchronisé';
    const syncStyle = r.isPending
        ? 'background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);'
        : 'background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2);';
    return `
        <div class="hr-actions">
            <div role="img" aria-label="${pendingLabel}" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; ${syncStyle}" title="${pendingLabel}">
                <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">${r.isPending ? 'cloud_upload' : 'cloud_done'}</span>
            </div>
            ${r.uuid ? `
            <button class="icon-btn edit-btn" data-uuid="${escapeHtml(r.uuid)}" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: var(--primary); padding: 0; display: flex; align-items: center; justify-content: center;" title="Modifier" aria-label="Modifier cet enregistrement">
                <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">edit</span>
            </button>
            <button class="icon-btn delete-btn" data-uuid="${escapeHtml(r.uuid)}" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: var(--error); padding: 0; display: flex; align-items: center; justify-content: center;" title="Supprimer" aria-label="Supprimer cet enregistrement">
                <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">delete</span>
            </button>` : ''}
        </div>`;
}

// Un dato de la tarjeta (icono + texto) en su propia casilla, para que no se mezcle con los demás
function historyFact(icon, text, extraClass = '') {
    if (!text) return '';
    return `<li class="hr-fact${extraClass ? ` ${extraClass}` : ''}"><span aria-hidden="true" class="material-symbols-rounded">${icon}</span><span>${escapeHtml(text)}</span></li>`;
}

// Tarjeta de una línea del historial: referencia y cantidad arriba, cada dato en su casilla y,
// abajo, la nota y los botones. Dentro de una visita agrupada se omite lo que ya dice la cabecera.
function historyRowHtml(r, inGroup) {
    const doc = docReference(r);
    const docText = doc ? `${DOC_LABELS[doc.kind]}${doc.number ? ` ${doc.number}` : ''}` : String(r.tache ?? '').trim();
    const etage = etageKey(r);
    const etageText = etage ? `Étage ${etage}` : '';
    const category = [r.categorie, r.id_item].map(v => String(v ?? '').trim()).filter(Boolean).join(' · ');
    const qty = Number(r.quantite || 0);
    const facts = inGroup
        ? [historyFact('layers', etageText), historyFact('local_offer', category)]
        : [
            historyFact('receipt_long', docText, 'hr-fact-doc'),
            historyFact('event', formatHistoryDate(r.fecha || r.date)),
            historyFact('apartment', String(r.locataire ?? '').trim()),
            historyFact('layers', etageText),
            historyFact('local_offer', category)
        ];

    return `
        <div class="history-row" style="border-left-color: ${getCategoryColor(r.categorie)};">
            <div class="hr-head">
                <div class="hr-desc">${escapeHtml(historyDescription(r))}</div>
                <span class="hr-qty" title="Quantité" aria-label="${qty} ampoule${qty > 1 ? 's' : ''}">${escapeHtml(r.quantite)}</span>
            </div>
            <ul class="hr-facts">${facts.join('')}</ul>
            <div class="hr-foot">
                ${r.note ? `<p class="hr-note"><span aria-hidden="true" class="material-symbols-rounded">notes</span><span>${escapeHtml(r.note)}</span></p>` : '<span></span>'}
                ${historyActionsHtml(r)}
            </div>
        </div>`;
}

// Cabecera de una visita (bon, tournée o soumission) con todas sus líneas dentro
function historyGroupHtml(group, open) {
    const dateLabel = group.day ? formatHistoryDate(group.day) : '';
    const etageText = group.etages.length > 0 ? `Étage${group.etages.length > 1 ? 's' : ''} ${group.etages.join(', ')}` : '';
    const count = group.lines.length;
    return `
        <details class="history-group"${open ? ' open' : ''}>
            <summary>
                <div class="hg-main">
                    <span class="hg-title">${escapeHtml(DOC_LABELS[group.kind])} ${escapeHtml(group.number)}</span>
                    <ul class="hr-facts">${[
                        historyFact('event', dateLabel),
                        historyFact('apartment', group.locataires.join(', ')),
                        historyFact('layers', etageText)
                    ].join('')}</ul>
                </div>
                <div class="hg-side">
                    <span class="hr-qty" title="Ampoules">${group.total}</span>
                    <span class="hg-lines">${count} lignes</span>
                </div>
            </summary>
            <div class="hg-body">${group.lines.map(line => historyRowHtml(line, true)).join('')}</div>
        </details>`;
}

// Contador en el título de Filtres y barra fija con los filtros puestos (selectores y búsqueda)
function updateHistoryActiveFilters(searchText) {
    const defs = [
        [elements.filterHistoryMonth, 'Période'],
        [elements.filterHistoryEtage, 'Étage'],
        [elements.filterHistoryLocataire, 'Locataire'],
        [elements.filterHistoryTache, 'Tâche'],
        [elements.filterHistoryCategorie, 'Catégorie']
    ];
    const selects = defs
        .filter(([control]) => control && control.value !== 'all')
        .map(([control, label]) => `${label} : ${control.selectedOptions[0] ? control.selectedOptions[0].textContent : control.value}`);
    const active = searchText ? [...selects, `Recherche : ${searchText}`] : selects;

    const count = document.getElementById('history-filters-count');
    if (count) {
        count.textContent = selects.length;
        count.classList.toggle('hidden-field', selects.length === 0);
    }

    const bar = elements.historyActiveFilters;
    if (!bar) return;
    bar.classList.toggle('hidden-field', active.length === 0);
    bar.innerHTML = active.length === 0 ? '' : `<span>Filtres actifs :</span>${active.map(text => `<span class="filter-chip">${escapeHtml(text)}</span>`).join('')}<button type="button" data-clear-history-filters>Réinitialiser</button>`;
}

function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

// Filtros plegables (cerrados de inicio en pantallas pequeñas), orden y agrupación recordados
export function initHistoryControls() {
    const toggle = document.getElementById('btn-toggle-history-filters');
    const body = document.getElementById('history-filters-body');
    const chevron = document.getElementById('history-filters-chevron');
    if (toggle && body) {
        const setOpen = (open) => {
            body.classList.toggle('hidden-field', !open);
            toggle.setAttribute('aria-expanded', String(open));
            if (chevron) chevron.textContent = open ? 'expand_less' : 'expand_more';
        };
        setOpen(!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches));
        toggle.addEventListener('click', () => setOpen(body.classList.contains('hidden-field')));
    }

    if (elements.historyGroupToggle) {
        elements.historyGroupToggle.checked = store.getHistoryGrouped();
        elements.historyGroupToggle.addEventListener('change', () => {
            store.setHistoryGrouped(elements.historyGroupToggle.checked);
            renderHistory();
        });
    }
    if (elements.historySort) elements.historySort.addEventListener('change', renderHistory);
    if (elements.historyExportBtn) elements.historyExportBtn.addEventListener('click', exportHistoryCsv);
}

// Descarga lo que se está viendo (con los filtros y la búsqueda actuales) como archivo CSV
export function exportHistoryCsv() {
    if (lastFilteredHistory.length === 0) {
        showToast("Aucun enregistrement à exporter.", "warning");
        return;
    }
    const csv = recordsToCsv(lastFilteredHistory, historyDescription);
    // El BOM hace que Excel lea bien los acentos
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lightman-historique-${localDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${pluralize(lastFilteredHistory.length, 'ligne exportée', 'lignes exportées')}.`, "success");
}

export function renderHistory() {
    if (!elements.historyContainer) return;

    const sortMode = elements.historySort ? elements.historySort.value : 'date-desc';
    let history = sortRecords(store.getAllRecords(), sortMode);

    // [FIX M-7] Usar la función centralizada de filtrado en lugar de duplicar la lógica
    if (elements.filterHistoryMonth) {
        history = store.filterRecords(history, {
            month: elements.filterHistoryMonth.value,
            etage: elements.filterHistoryEtage ? elements.filterHistoryEtage.value : 'all',
            locataire: elements.filterHistoryLocataire ? elements.filterHistoryLocataire.value : 'all',
            tache: elements.filterHistoryTache ? elements.filterHistoryTache.value : 'all',
            categorie: elements.filterHistoryCategorie ? elements.filterHistoryCategorie.value : 'all'
        });
    }

    const searchText = elements.searchHistory ? elements.searchHistory.value.trim() : "";
    const searchVal = searchText.toLowerCase();
    if (searchVal !== "") {
        const searchTerms = searchVal.split(/\s+/);

        history = history.filter(r => {
            const desc = String(historyDescription(r)).toLowerCase();
            const id = String(r.id_item || "").toLowerCase();
            const etage = String(r.etage || "").trim().toLowerCase();
            const locataire = String(r.locataire || "").toLowerCase();
            const numTache = String(r.num_tache || "").toLowerCase();
            const numBon = String(r.num_bon || "").toLowerCase();
            const numSoumission = String(r.num_soumission || "").toLowerCase();
            const categorie = String(r.categorie || "").toLowerCase();
            const tache = String(r.tache || "").toLowerCase();
            const note = String(r.note || "").toLowerCase();

            return searchTerms.every(term => {
                const isNumeric = !isNaN(term) && term.trim() !== "";
                const matchEtage = isNumeric ? (etage === term) : etage.includes(term);

                return desc.includes(term) ||
                       id.includes(term) ||
                       matchEtage ||
                       numTache.includes(term) ||
                       numBon.includes(term) ||
                       numSoumission.includes(term) ||
                       locataire.includes(term) ||
                       categorie.includes(term) ||
                       tache.includes(term) ||
                       note.includes(term);
            });
        });
    }

    lastFilteredHistory = history;
    updateHistoryActiveFilters(searchText);

    if (elements.historySummary) {
        const totals = historyTotals(history);
        const parts = [pluralize(totals.lines, 'ligne'), pluralize(totals.bulbs, 'ampoule')];
        if (totals.bons > 0) parts.push(`${pluralize(totals.bons, 'bon')} de travail`);
        if (totals.tournees > 0) parts.push(pluralize(totals.tournees, 'tournée'));
        elements.historySummary.textContent = parts.join(' · ');
    }

    if (history.length === 0) {
        elements.historyContainer.innerHTML = `
            <div class="empty-state-container">
                <span aria-hidden="true" class="material-symbols-rounded empty-icon">search</span>
                <p class="empty-text">Aucun enregistrement correspondant.</p>
            </div>
        `;
        return;
    }

    // Se dibuja por tramos: los totales y filtros siguen contando todos los registros
    const grouped = store.getHistoryGrouped();
    const filterKey = JSON.stringify([
        searchVal,
        sortMode,
        grouped,
        elements.filterHistoryMonth?.value,
        elements.filterHistoryEtage?.value,
        elements.filterHistoryLocataire?.value,
        elements.filterHistoryTache?.value,
        elements.filterHistoryCategorie?.value
    ]);
    if (filterKey !== historyFilterKey) {
        historyFilterKey = filterKey;
        historyVisibleCount = HISTORY_PAGE_SIZE;
    }

    const items = grouped
        ? orderHistoryItems(groupHistory(history), sortMode)
        : history.map(record => ({ type: 'single', record, total: Number(record.quantite || 0) }));
    const remainingCount = Math.max(0, items.length - historyVisibleCount);

    elements.historyContainer.innerHTML = items.slice(0, historyVisibleCount).map(item =>
        item.type === 'group' ? historyGroupHtml(item, searchVal !== '') : historyRowHtml(item.record, false)
    ).join('') + (remainingCount > 0 ? `
        <button type="button" id="history-show-more" class="btn-secondary" style="width: 100%;">
            <span aria-hidden="true" class="material-symbols-rounded">expand_more</span> Afficher plus (${remainingCount} restants)
        </button>
    ` : '');

    const showMoreBtn = document.getElementById('history-show-more');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', () => {
            historyVisibleCount += HISTORY_PAGE_SIZE;
            renderHistory();
        });
    }

    // Agregar eventos a botones de eliminar
    const deleteBtns = elements.historyContainer.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const uuid = btn.getAttribute('data-uuid');
            const confirmed = await showConfirm("Voulez-vous vraiment supprimer cet enregistrement ?");
            if (confirmed) {
                await deleteRecord(uuid);
            }
        });
    });

    // Agregar eventos a botones de editar
    const editBtns = elements.historyContainer.querySelectorAll('.edit-btn');
    editBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const uuid = btn.getAttribute('data-uuid');
            const record = store.getAllRecords().find(r => r.uuid === uuid);

            if (record) {
                store.setEditingRecordUuid(uuid);
                // Switch view to saisie (registro)
                setActiveView('view-registro');
                
                // Populate form
                const targetDate = record.fecha || record.date;
                const parsedDate = targetDate ? parseRecordDate(targetDate) : null;
                if (elements.dateInput && parsedDate && !isNaN(parsedDate)) {
                    elements.dateInput.value = localDateString(parsedDate);
                    updateDateDisplay();
                }
                if (elements.etageSelect) elements.etageSelect.value = record.etage;
                if (elements.locataireSelect) elements.locataireSelect.value = record.locataire || "";
                if (elements.tacheSelect) {
                    elements.tacheSelect.value = record.tache;
                    elements.tacheSelect.dispatchEvent(new Event('change'));
                }
                if (elements.numTacheInput) elements.numTacheInput.value = record.num_tache || "";
                if (elements.numBonInput) elements.numBonInput.value = record.num_bon || "";
                if (elements.numSoumissionInput) elements.numSoumissionInput.value = record.num_soumission || "";
                
                let recordCat = record.categorie || "";
                let recordDesc = record.description || "";
                
                if (record.id_item) {
                    const foundOpt = store.appOptions.opciones.find(opt => opt.id === record.id_item);
                    if (foundOpt) {
                        recordCat = foundOpt.categorie || recordCat;
                        recordDesc = foundOpt.description || recordDesc;
                    }
                }

                if (elements.catSelect) {
                    elements.catSelect.value = recordCat;
                    elements.catSelect.dispatchEvent(new Event('change'));
                }
                if (elements.descSelect) {
                    selectDescription(recordDesc, record.id_item || "");
                    elements.descSelect.dispatchEvent(new Event('change'));

                    // Set ID explicitly after description triggers
                    if (elements.idInput) {
                        elements.idInput.value = record.id_item || "";
                    }
                } else if (elements.idInput) {
                    elements.idInput.value = record.id_item || "";
                }

                if (elements.quantiteInput) elements.quantiteInput.value = record.quantite || 1;
                if (elements.noteInput) elements.noteInput.value = record.note || "";
                
                // Change submit button text
                const submitBtn = elements.form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">save</span> Modifier';
                }
                
                // Show cancel button
                let cancelBtn = document.getElementById('cancel-edit-btn');
                if (!cancelBtn) {
                    cancelBtn = document.createElement('button');
                    cancelBtn.id = 'cancel-edit-btn';
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn-secondary';
                    cancelBtn.style.marginTop = '10px';
                    cancelBtn.style.width = '100%';
                    cancelBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">close</span> Annuler la modification';
                    cancelBtn.addEventListener('click', () => {
                        resetFormAndRefresh();
                        // Volver a historique
                        setActiveView('view-historique');
                    });
                    if (submitBtn && submitBtn.parentNode) {
                        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
                    }
                }
                if (cancelBtn) cancelBtn.style.display = 'block';
                
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

export function renderNotes() {
    if (!elements.notesListContainer) return;
    
    const notes = store.getNotes();
    
    if (notes.length === 0) {
        elements.notesListContainer.innerHTML = '<p class="help-text">Aucune note pour le moment.</p>';
        return;
    }
    
    elements.notesListContainer.innerHTML = notes.map(note => {
        const dateObj = new Date(note.timestamp);
        const dateStr = dateObj.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        const noteColorClass = note.color || 'note-blue';
        const completedClass = note.completed ? 'note-completed' : '';
        const checkedAttr = note.completed ? 'checked' : '';
        
        return `
            <div class="card note-item ${escapeHtml(noteColorClass)} ${completedClass}" style="margin-bottom: 0.75rem; padding: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" class="note-checkbox" data-id="${escapeHtml(note.id)}" ${checkedAttr} aria-label="Marquer la note comme terminée" style="width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-size: 0.75rem; color: var(--text-secondary);"><span aria-hidden="true" class="material-symbols-rounded">schedule</span> ${dateStr}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="icon-btn edit-note-btn" data-id="${escapeHtml(note.id)}" style="width: 28px; height: 28px; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: var(--primary); padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%;" title="Modifier" aria-label="Modifier la note">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 0.8rem;">edit</span>
                        </button>
                        <button class="icon-btn delete-note-btn" data-id="${escapeHtml(note.id)}" style="width: 28px; height: 28px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: var(--error); padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%;" title="Supprimer" aria-label="Supprimer la note">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 0.8rem;">delete</span>
                        </button>
                    </div>
                </div>
                <p class="note-content" style="margin: 0; font-size: 0.95rem; line-height: 1.4; white-space: pre-wrap;">${escapeHtml(note.text)}</p>
            </div>
        `;
    }).join('');
    
    // Add delete event listeners
    const deleteBtns = elements.notesListContainer.querySelectorAll('.delete-note-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const confirmed = await showConfirm("Voulez-vous vraiment supprimer cette note ?");
            if (confirmed) {
                store.deleteNote(id);
                renderNotes();
                showToast("Note supprimée", "success");
            }
        });
    });

    // Add edit event listeners
    const editBtns = elements.notesListContainer.querySelectorAll('.edit-note-btn');
    editBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            const note = store.getNotes().find(n => String(n.id) === String(id));
            
            const noteInput = document.getElementById('note-text');
            const saveBtn = document.getElementById('save-note-btn');
            
            if (note && noteInput && saveBtn) {
                store.setEditingNoteId(id);
                noteInput.value = note.text;
                saveBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">save</span> Modifier la Note';
                
                const noteColor = note.color || 'note-blue';
                const colorRadio = document.querySelector(`input[name="note_color"][value="${noteColor}"]`);
                if (colorRadio) colorRadio.checked = true;
                
                let cancelBtn = document.getElementById('cancel-edit-note-btn');
                if (!cancelBtn) {
                    cancelBtn = document.createElement('button');
                    cancelBtn.id = 'cancel-edit-note-btn';
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn-secondary';
                    cancelBtn.style.marginTop = '10px';
                    cancelBtn.style.width = '100%';
                    cancelBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">close</span> Annuler la modification';
                    cancelBtn.addEventListener('click', () => {
                        store.setEditingNoteId(null);
                        noteInput.value = '';
                        saveBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">save</span> Enregistrer la Note';
                        const defaultColor = document.querySelector('input[name="note_color"][value="note-blue"]');
                        if (defaultColor) defaultColor.checked = true;
                        cancelBtn.style.display = 'none';
                    });
                    saveBtn.parentNode.insertBefore(cancelBtn, saveBtn.nextSibling);
                }
                cancelBtn.style.display = 'block';
                
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch(err) {
                    window.scrollTo(0, 0);
                }
                
                // Focus the textarea
                noteInput.focus();
            }
        });
    });
}
