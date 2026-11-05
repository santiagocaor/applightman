// js/ui.js
import { getCategoryColor, escapeHtml, localDateString, parseRecordDate } from './utils.js';
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
    statPrice: document.getElementById('stat-price'),
    statUnitAvg: document.getElementById('stat-unit-avg'),
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

const HISTORY_PAGE_SIZE = 200;
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

export function showToast(message, type = 'success') {
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
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
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

export function updateSyncBadge() {
    if (elements.syncBadge) {
        if (store.syncQueue.length > 0) {
            elements.syncBadge.textContent = store.syncQueue.length;
            elements.syncBadge.classList.remove('hidden');
        } else {
            elements.syncBadge.classList.add('hidden');
        }
    }
}

export function resetFormAndRefresh() {
    if (elements.form) elements.form.reset();
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
}

export function renderHistory() {
    if (!elements.historyContainer) return;
    
    let history = store.getAllRecords();

    history.sort((a, b) => {
        const dateA = parseRecordDate(a.fecha || a.date || 0).getTime();
        const dateB = parseRecordDate(b.fecha || b.date || 0).getTime();
        return dateB - dateA;
    });
    
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
    
    const searchVal = elements.searchHistory ? elements.searchHistory.value.trim().toLowerCase() : "";
    if (searchVal !== "") {
        const searchTerms = searchVal.split(/\s+/);
        
        history = history.filter(r => {
            const foundOpt = store.appOptions.opciones.find(opt => opt.id === r.id_item);
            const resolvedDesc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || "");
            
            const desc = String(resolvedDesc).toLowerCase();
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
    
    if (elements.historySummary) {
        elements.historySummary.textContent = `Total: ${history.length} remplacement${history.length !== 1 ? 's' : ''}`;
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
    const filterKey = JSON.stringify([
        searchVal,
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
    const remainingCount = Math.max(0, history.length - historyVisibleCount);

    elements.historyContainer.innerHTML = history.slice(0, historyVisibleCount).map((r, index) => {
        let dateStr;
        try {
            const d = parseRecordDate(r.fecha || r.date);
            if (!isNaN(d)) {
                const months = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
                dateStr = `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
            } else {
                dateStr = r.fecha || r.date || "-";
            }
        } catch(e) {
            dateStr = r.fecha || r.date || "-";
        }

        const num = r.num_tache || r.num_bon || r.num_soumission;
        const detailsVal = num ? `#${num}` : "-";

        const foundOpt = store.appOptions.opciones.find(opt => opt.id === r.id_item);
        const displayDesc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || r.id_item || 'N/A');

        const catColor = getCategoryColor(r.categorie);

        return `
            <div class="pro-history-card history-item-animate" style="animation-delay: ${Math.min(index * 0.05, 0.5)}s; border-left: 4px solid ${catColor}; position: relative;">
                <div class="pro-card-header" style="display: flex; flex-direction: column; gap: 0.5rem; padding-right: 2.5rem;">
                    <div style="display: flex; align-items: flex-start;">
                        <h3 class="pro-desc" style="margin: 0; line-height: 1.3; display: flex; align-items: center; gap: 0.35rem;">
                            <span aria-hidden="true" class="material-symbols-rounded" style="color: var(--primary); font-size: 1.15rem; flex-shrink: 0;">lightbulb</span>
                            ${escapeHtml(displayDesc)}
                        </h3>
                    </div>
                    
                    <div class="pro-qty-badge" style="position: absolute; top: 1rem; right: 1rem; width: 34px; height: 34px; box-shadow: none;">
                        <span class="qty-val" style="font-size: 1rem; font-weight: 700;">${escapeHtml(r.quantite)}</span>
                    </div>
                    
                    <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem; color: var(--primary);">build</span> ${escapeHtml(r.tache || 'N/A')}
                        </span>
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem; color: var(--primary);">apartment</span> ${escapeHtml(r.locataire || '-')}
                        </span>
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem; flex-wrap: wrap;">
                        <span class="pro-id-badge" style="height: 28px; padding: 0 0.65rem; border-radius: 14px; display: inline-flex; justify-content: center; align-items: center; white-space: nowrap; gap: 0.3rem;">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 0.95rem;">qr_code_scanner</span> ${escapeHtml(r.id_item || '-')}
                        </span>
                        
                        <div role="img" aria-label="${r.isPending ? 'En attente de synchronisation' : 'Synchronisé'}" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; ${r.isPending ? 'background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);' : 'background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2);'}" title="${r.isPending ? 'En attente de synchronisation' : 'Synchronisé'}">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">${r.isPending ? 'cloud_upload' : 'cloud_done'}</span>
                        </div>
                        ${r.uuid ? `
                        <button class="icon-btn edit-btn" data-uuid="${escapeHtml(r.uuid)}" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: var(--primary); padding: 0; display: flex; align-items: center; justify-content: center;" title="Modifier" aria-label="Modifier cet enregistrement">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">edit</span>
                        </button>
                        <button class="icon-btn delete-btn" data-uuid="${escapeHtml(r.uuid)}" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: var(--error); padding: 0; display: flex; align-items: center; justify-content: center;" title="Supprimer" aria-label="Supprimer cet enregistrement">
                            <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1rem;">delete</span>
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="pro-card-body">
                    <div class="pro-meta-grid">
                        <div class="pro-meta-item">
                            <span aria-hidden="true" class="material-symbols-rounded">domain</span>
                            <div>
                                <span class="meta-label">Étage</span>
                                <span class="meta-value">${r.etage !== undefined && r.etage !== null && r.etage !== "" ? escapeHtml(r.etage) : '-'}</span>
                            </div>
                        </div>
                        <div class="pro-meta-item">
                            <span aria-hidden="true" class="material-symbols-rounded">tag</span>
                            <div>
                                <span class="meta-label">Num. Tâche</span>
                                <span class="meta-value">${escapeHtml(detailsVal)}</span>
                            </div>
                        </div>
                        <div class="pro-meta-item">
                            <span aria-hidden="true" class="material-symbols-rounded">local_offer</span>
                            <div>
                                <span class="meta-label">Catégorie</span>
                                <span class="meta-value">${escapeHtml(r.categorie || '-')}</span>
                            </div>
                        </div>
                        <div class="pro-meta-item">
                            <span aria-hidden="true" class="material-symbols-rounded">calendar_today</span>
                            <div>
                                <span class="meta-label">Date</span>
                                <span class="meta-value">${escapeHtml(dateStr)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${r.note ? `
                <div class="pro-card-footer">
                    <div class="pro-note">
                        <p>${escapeHtml(r.note)}</p>
                    </div>
                </div>` : ''}
            </div>
        `;
    }).join('') + (remainingCount > 0 ? `
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
