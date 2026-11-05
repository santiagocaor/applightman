// app.js
import * as store from './store.js';
import * as ui from './ui.js';
import * as charts from './charts.js';
import * as api from './api.js';
import { generateUUID, debounce, localDateString, parsePrice } from './utils.js';

const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('lightman_theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const activeTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', activeTheme);
        this.updateIcon(activeTheme === 'dark');
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('lightman_theme')) {
                const newSystemTheme = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newSystemTheme);
                this.updateIcon(e.matches);
            }
        });
        
        const themeButton = document.getElementById('theme-btn');
        if (themeButton) {
            themeButton.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('lightman_theme', newTheme);
                this.updateIcon(newTheme === 'dark');
                
                setTimeout(() => {
                    charts.updateDashboard();
                }, 0);
            });
        }
    },
    
    updateIcon(isDark) {
        const themeButton = document.getElementById('theme-btn');
        if (themeButton) themeButton.setAttribute('aria-pressed', String(isDark));

        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        if (isDark) {
            themeToggle.style.color = '#fbbf24';
            themeToggle.style.filter = 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.95))';
            themeToggle.className = 'material-symbols-rounded';
            themeToggle.textContent = 'lightbulb';
        } else {
            themeToggle.style.color = '';
            themeToggle.style.filter = '';
            themeToggle.className = 'material-symbols-rounded';
            themeToggle.textContent = 'lightbulb';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }
    
    if (ui.elements.dateInput) {
        ui.elements.dateInput.value = localDateString();
        ui.updateDateDisplay();
    }

    // Los controles se conectan primero: un dato inesperado no debe dejar la app sin respuesta
    setupEventListeners();
    window.addEventListener('online', () => api.syncOfflineQueue());

    try {
        loadInitialData();
    } catch (error) {
        console.error("Startup Error:", error);
        ui.showToast("Certaines données n'ont pas pu être affichées.", "error");
    }
});

function loadInitialData() {
    ui.updateSyncBadge();
    ui.renderNotes();

    if (!store.apiUrl) {
        store.setAppOptions(store.mockOptions);
        store.loadLocalRecords();
        ui.populateAllSelects();
        api.refreshViews();
        return;
    }

    if (ui.elements.configInput) ui.elements.configInput.value = store.apiUrl;
    if (ui.elements.configTokenInput) ui.elements.configTokenInput.value = store.apiToken;
    ui.setConnectionStatus("Configuré. Connexion...", true);

    const hasCachedData = store.loadCachedData();
    if (hasCachedData) {
        ui.populateAllSelects();
        api.refreshViews();
    }
    startCloudSync(hasCachedData);
}

// Lo pendiente de una sesión anterior se envía al abrir la app, antes de pedir los datos
async function startCloudSync(hasCachedData) {
    const synced = store.syncQueue.length > 0 && await api.syncOfflineQueue();
    if (!synced) api.fetchDataFromCloud(!hasCachedData);
}

function createRipple(event) {
    const button = event.currentTarget;
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${clientX - rect.left - radius}px`;
    circle.style.top = `${clientY - rect.top - radius}px`;
    circle.classList.add('ripple-effect');

    const ripple = button.querySelector('.ripple-effect');
    if (ripple) {
        ripple.remove();
    }

    button.appendChild(circle);
}

function setupEventListeners() {
    // Attach Material Ripple Effect
    document.querySelectorAll('.btn-primary, .btn-secondary, .nav-item, .icon-btn').forEach(btn => {
        btn.classList.add('ripple');
        btn.addEventListener('mousedown', createRipple);
        btn.addEventListener('touchstart', createRipple, { passive: true });
    });

    if (ui.elements.dateInput) {
        ui.elements.dateInput.addEventListener('input', ui.updateDateDisplay);
        ui.elements.dateInput.addEventListener('change', ui.updateDateDisplay);
        ui.elements.dateInput.addEventListener('click', () => {
            try {
                ui.elements.dateInput.showPicker();
            } catch (e) {
                // Algunos navegadores no lo admiten: el campo de fecha sigue funcionando
            }
        });
    }

    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            const targetId = navItem.getAttribute('data-target');
            if (targetId) {
                e.preventDefault();
                ui.setActiveView(targetId);

                if (targetId === 'view-stats') {
                    charts.updateDashboard();
                } else if (targetId === 'view-historique') {
                    ui.renderHistory();
                } else if (targetId === 'view-notes') {
                    ui.renderNotes();
                }
            }
        }
    });

    if (ui.elements.filterMonth) {
        ui.elements.filterMonth.addEventListener('change', charts.updateDashboard);
        ui.elements.filterEtage.addEventListener('change', charts.updateDashboard);
        if (ui.elements.filterLocataire) ui.elements.filterLocataire.addEventListener('change', charts.updateDashboard);
        ui.elements.filterTache.addEventListener('change', charts.updateDashboard);
        if (ui.elements.filterCategorie) ui.elements.filterCategorie.addEventListener('change', charts.updateDashboard);
        if (ui.elements.filterDescription) ui.elements.filterDescription.addEventListener('change', charts.updateDashboard);
        
        ui.elements.clearFiltersBtn.addEventListener('click', () => {
            ui.elements.filterMonth.value = 'all';
            ui.elements.filterEtage.value = 'all';
            if (ui.elements.filterLocataire) ui.elements.filterLocataire.value = 'all';
            ui.elements.filterTache.value = 'all';
            if (ui.elements.filterCategorie) ui.elements.filterCategorie.value = 'all';
            if (ui.elements.filterDescription) ui.elements.filterDescription.value = 'all';
            charts.updateDashboard();
        });
        charts.initStatsTableListeners();
    }

    if (ui.elements.filterHistoryMonth) {
        ui.elements.filterHistoryMonth.addEventListener('change', ui.renderHistory);
        ui.elements.filterHistoryEtage.addEventListener('change', ui.renderHistory);
        if (ui.elements.filterHistoryLocataire) ui.elements.filterHistoryLocataire.addEventListener('change', ui.renderHistory);
        ui.elements.filterHistoryTache.addEventListener('change', ui.renderHistory);
        if (ui.elements.filterHistoryCategorie) ui.elements.filterHistoryCategorie.addEventListener('change', ui.renderHistory);
        ui.elements.clearHistoryFiltersBtn.addEventListener('click', () => {
            ui.elements.filterHistoryMonth.value = 'all';
            ui.elements.filterHistoryEtage.value = 'all';
            if (ui.elements.filterHistoryLocataire) ui.elements.filterHistoryLocataire.value = 'all';
            ui.elements.filterHistoryTache.value = 'all';
            if (ui.elements.filterHistoryCategorie) ui.elements.filterHistoryCategorie.value = 'all';
            if (ui.elements.searchHistory) ui.elements.searchHistory.value = '';
            ui.renderHistory();
        });
    }

    if (ui.elements.tacheSelect) {
        ui.elements.tacheSelect.addEventListener('change', (e) => {
            const val = (e.target.value || "").trim().toLowerCase();
            
            ui.elements.groupBon.classList.add('hidden-field');
            ui.elements.groupSoumission.classList.add('hidden-field');
            ui.elements.groupTacheNum.classList.add('hidden-field');
            ui.elements.numBonInput.required = false;
            ui.elements.numSoumissionInput.required = false;
            ui.elements.numTacheInput.required = false;
            ui.elements.numBonInput.value = "";
            ui.elements.numSoumissionInput.value = "";
            ui.elements.numTacheInput.value = "";
            
            if (val.includes('bon') || val.includes('trabajo') || val.includes('travail')) {
                ui.elements.groupBon.classList.remove('hidden-field');
                ui.elements.numBonInput.required = true;
            } else if (val.includes('soumission')) {
                ui.elements.groupSoumission.classList.remove('hidden-field');
                ui.elements.numSoumissionInput.required = true;
            } else if (val.includes('tourn') || val.includes('ronde')) {
                ui.elements.groupTacheNum.classList.remove('hidden-field');
                ui.elements.numTacheInput.required = true;
            }
        });
    }

    if (ui.elements.catSelect) {
        ui.elements.catSelect.addEventListener('change', (e) => {
            const selectedCat = (e.target.value || "").trim();

            let filteredOpts = store.appOptions.opciones || [];
            if (selectedCat !== "") {
                filteredOpts = filteredOpts.filter(opt => opt.categorie === selectedCat);
            }

            ui.populateDescriptionSelect(filteredOpts);
            if (!ui.elements.descSelect.value) ui.elements.idInput.value = "";
        });
    }

    if (ui.elements.descSelect) {
        ui.elements.descSelect.addEventListener('change', (e) => {
            const selectedDesc = (e.target.value || "").trim();
            // Dos artículos pueden compartir descripción: el ID sale de la opción elegida, no de la primera coincidencia
            const selectedOption = e.target.selectedOptions[0];
            const selectedId = selectedOption ? (selectedOption.dataset.id || "") : "";
            const opciones = store.appOptions.opciones || [];
            const foundOpt = opciones.find(opt => opt.description === selectedDesc && (!selectedId || opt.id === selectedId));

            if (foundOpt) {
                ui.elements.idInput.value = foundOpt.id || "";
                const optCat = foundOpt.categorie || "";
                if (optCat && (ui.elements.catSelect.value || "").trim() !== optCat) {
                    ui.elements.catSelect.value = optCat;
                    ui.populateDescriptionSelect(opciones.filter(opt => opt.categorie === optCat));
                }
            } else {
                ui.elements.idInput.value = "";
            }
        });
    }

    let isSubmitting = false;
    if (ui.elements.form) {
        ui.elements.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;
            
            const formData = new FormData(ui.elements.form);
            const qtyRaw = parseInt(formData.get('quantite'));
            const record = {
                uuid: generateUUID(),
                fecha: formData.get('date'),
                id_item: formData.get('id_item') || "", 
                description: formData.get('description') || "",
                categorie: formData.get('categorie') || "",
                quantite: isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw,
                locataire: formData.get('locataire') || "",
                etage: formData.get('etage') || "",
                tache: formData.get('tache') || "",
                num_bon: formData.get('num_bon') || "",
                num_soumission: formData.get('num_soumission') || "",
                num_tache: formData.get('num_tache') || "",
                note: formData.get('note') || ""
            };

            // El precio queda guardado en el registro: un cambio de precio futuro no altera este costo
            const editedRecord = store.editingRecordUuid
                ? store.getAllRecords().find(r => r.uuid === store.editingRecordUuid)
                : null;
            const keepsStoredPrice = editedRecord
                && editedRecord.id_item === record.id_item
                && parsePrice(editedRecord.prix) !== null;
            record.prix = keepsStoredPrice ? editedRecord.prix : (charts.getCatalogPrice(record) ?? "");

            const historyData = store.getHistory();
            if (historyData.length > 0 && !store.editingRecordUuid) {
                const duplicate = historyData.find(oldRecord => {
                    const oldDateRaw = oldRecord.fecha || oldRecord.date;
                    const oldDateStr = String(oldDateRaw || "").substring(0, 10);
                    const newDateStr = String(record.fecha || "").substring(0, 10);

                    const clean = (val) => String(val || "").replace(/#/g, "").trim().toLowerCase();

                    const descOrIdMatch = record.id_item ? 
                        clean(oldRecord.id_item) === clean(record.id_item) : 
                        clean(oldRecord.description) === clean(record.description);

                    return oldDateStr === newDateStr &&
                           descOrIdMatch &&
                           clean(oldRecord.locataire) === clean(record.locataire) &&
                           clean(oldRecord.etage) === clean(record.etage) &&
                           clean(oldRecord.tache) === clean(record.tache) &&
                           String(oldRecord.quantite) === String(record.quantite) &&
                           clean(oldRecord.num_bon) === clean(record.num_bon) &&
                           clean(oldRecord.num_tache) === clean(record.num_tache) &&
                           clean(oldRecord.num_soumission) === clean(record.num_soumission);
                });

                if (duplicate) {
                    const isConfirmed = await ui.showConfirm("⚠️ Attention : Un registre identique existe déjà pour cette date. Voulez-vous vraiment l'enregistrer à nouveau ?");
                    if (!isConfirmed) {
                        return;
                    }
                }
            }

            isSubmitting = true;
            const submitBtn = ui.elements.form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (store.editingRecordUuid) {
                    await api.editRecord(store.editingRecordUuid, record);
                } else if (store.apiUrl) {
                    await api.saveRecordToCloud(record);
                } else {
                    store.addRecordLocally(record);
                    if (navigator.vibrate) navigator.vibrate([200]);
                    ui.showToast("Enregistré localement (Mode test). Configurez Google Sheets pour enregistrer dans le cloud.", "info");
                    store.addToHistory(record);
                    ui.resetFormAndRefresh();
                    api.refreshViews();
                }
            } catch (err) {
                console.error("Submit Handler Error:", err);
                ui.showToast("Une erreur est survenue lors de l'enregistrement.", "error");
            } finally {
                isSubmitting = false;
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    if (ui.elements.saveConfigBtn) {
        ui.elements.saveConfigBtn.addEventListener('click', () => {
            const newUrl = ui.elements.configInput.value.trim();
            store.setApiToken(ui.elements.configTokenInput ? ui.elements.configTokenInput.value.trim() : "");
            if (newUrl) {
                store.setApiUrl(newUrl);
                ui.setConnectionStatus("Configuré. Connexion...", true);
                api.fetchDataFromCloud();
            } else {
                store.setApiUrl("");
                ui.setConnectionStatus("Non configuré", false);
            }
        });
    }

    if (ui.elements.syncBtn) {
        ui.elements.syncBtn.addEventListener('click', () => {
            if (store.apiUrl) {
                if (store.syncQueue.length > 0) {
                    api.syncOfflineQueue();
                } else {
                    api.fetchDataFromCloud();
                }
            } else {
                ui.showToast("Vous devez d'abord configurer l'URL de Google Sheets.", "warning");
            }
        });
    }

    if (ui.elements.reloadAppBtn) {
        ui.elements.reloadAppBtn.addEventListener('click', async () => {
            const isConfirmed = await ui.showConfirm("Voulez-vous vider le cache et recharger l'application pour appliquer les mises à jour ?");
            if (isConfirmed) {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.unregister();
                    }
                }
                if (window.caches) {
                    const keys = await caches.keys();
                    for (let key of keys) {
                        await caches.delete(key);
                    }
                }
                window.location.reload(true);
            }
        });
    }

    const stepperMinus = document.getElementById('stepper-minus');
    const stepperPlus = document.getElementById('stepper-plus');
    const quantiteInput = document.getElementById('quantite');

    if (stepperMinus && stepperPlus && quantiteInput) {
        stepperMinus.addEventListener('click', () => {
            let val = parseInt(quantiteInput.value) || 1;
            if (val > 1) quantiteInput.value = val - 1;
        });
        stepperPlus.addEventListener('click', () => {
            let val = parseInt(quantiteInput.value) || 0;
            quantiteInput.value = val + 1;
        });
    }

    // [FIX M-4] Debounce: espera 250ms antes de buscar para no reconstruir la lista en cada tecla
    if (ui.elements.searchHistory) {
        ui.elements.searchHistory.addEventListener('input', debounce(ui.renderHistory, 250));
    }

    if (ui.elements.saveNoteBtn && ui.elements.noteTextInput) {
        ui.elements.saveNoteBtn.addEventListener('click', () => {
            const text = ui.elements.noteTextInput.value.trim();
            if (text) {
                const colorRadio = document.querySelector('input[name="note_color"]:checked');
                const color = colorRadio ? colorRadio.value : 'note-blue';
                
                if (store.editingNoteId) {
                    store.editNote(store.editingNoteId, text, color);
                    store.setEditingNoteId(null);
                    ui.elements.saveNoteBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">save</span> Enregistrer la Note';
                    const cancelBtn = document.getElementById('cancel-edit-note-btn');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    ui.showToast('Note modifiée !', 'success');
                } else {
                    store.addNote(text, color);
                    ui.showToast('Note enregistrée !', 'success');
                }
                
                ui.elements.noteTextInput.value = '';
                const defaultColor = document.querySelector('input[name="note_color"][value="note-blue"]');
                if (defaultColor) defaultColor.checked = true;
                
                ui.renderNotes();
            } else {
                ui.showToast('La note ne peut pas être vide.', 'error');
            }
        });
    }

    if (ui.elements.notesListContainer) {
        ui.elements.notesListContainer.addEventListener('click', (e) => {
            const checkbox = e.target.closest('.note-checkbox');
            if (checkbox) {
                const id = checkbox.getAttribute('data-id');
                store.toggleNoteCompletion(id);
                ui.renderNotes();
            }
        });
    }

    const clearCompletedBtn = document.getElementById('clear-completed-notes-btn');
    if (clearCompletedBtn) {
        clearCompletedBtn.addEventListener('click', () => {
            store.clearCompletedNotes();
            ui.renderNotes();
            ui.showToast('Notes nettoyées', 'success');
        });
    }

}

