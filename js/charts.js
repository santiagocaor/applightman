// js/charts.js
import { getCategoryColor, taskColor, NEUTRAL_COLORS, escapeHtml, parsePrice, recordMonthKey, naturalCompare, weekdayTotals, isReceptionTask, monthlyAverage, incompleteMonths, monthlyByCategory, monthlyByGroup, referenceKey, locataireKey, etageKey, etageGroupKey, etageLabel, ELEVATOR_GROUP, uniqueDocsByMonth, recordMonths, monthlyReport, monthlySeries, previousMonthKey, monthlyTrend } from './utils.js';
import * as store from './store.js';
import * as ui from './ui.js';

let charts = {};

// Filtros de Statistiques: nombre del parámetro de store.filterRecords, control y texto del resumen
const STATS_FILTERS = [
    { param: 'month', element: 'filterMonth', label: 'Période' },
    { param: 'etage', element: 'filterEtage', label: 'Étage' },
    { param: 'locataire', element: 'filterLocataire', label: 'Locataire' },
    { param: 'tache', element: 'filterTache', label: 'Intervention' },
    { param: 'categorie', element: 'filterCategorie', label: 'Catégorie' },
    { param: 'description', element: 'filterDescription', label: 'Référence' }
];

const PERIOD_PRESETS = [
    { value: 'last-3', label: '3 derniers mois' },
    { value: 'last-6', label: '6 derniers mois' },
    { value: 'last-12', label: '12 derniers mois' },
    { value: 'year', label: 'Cette année' }
];

const SHORT_MONTH_NAMES = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function shortMonthLabel(key) {
    const [y, m] = key.split('-');
    return `${SHORT_MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

// Números con el formato del francés de Canadá: 1 233 y 233,8
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
// Número de una barra o un punto: también el 0, que es un dato
const fmtLabel = (value) => (value === null || value === undefined ? '' : fmt(value));

const LONG_MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Meses que los datos no cubren enteros (el primero si empieza a mitad de mes, y el mes en curso).
// Se calculan sobre todos los registros: un filtro no cambia qué meses están completos.
function currentIncompleteMonths() {
    return incompleteMonths(store.getAllRecords().filter(r => !isReceptionTask(r.tache)));
}

// Color con transparencia (lo usa el informe impreso para los meses incompletos)
function fadeColor(hex, partial) {
    return partial ? `${hex}59` : hex;
}

// Nota bajo el bloque de tendencias: qué meses están incompletos y por qué
function renderIncompleteNote(incomplete) {
    const note = document.getElementById('partial-months-note');
    if (!note) return;
    const parts = [...incomplete.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, info]) => {
        const [y, m] = key.split('-');
        const name = `${LONG_MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
        return info.kind === 'start' ? `${name} (données à partir du ${info.day})` : `${name} (mois en cours, jusqu'au ${info.day})`;
    });
    note.textContent = parts.length
        ? `Mois incomplets : ${parts.join(' et ')}. Ils ne comptent pas dans la moyenne mensuelle.`
        : '';
    note.classList.toggle('hidden-field', parts.length === 0);
}

function periodLabel(value) {
    const preset = PERIOD_PRESETS.find(item => item.value === value);
    return preset ? preset.label : shortMonthLabel(value);
}

function currentStatsFilters() {
    const values = {};
    STATS_FILTERS.forEach(({ param, element }) => {
        const control = ui.elements[element];
        values[param] = control ? control.value || 'all' : 'all';
    });
    return values;
}

// Descripción visible de una referencia (la del catálogo si existe)
function recordDescription(record) {
    const idKey = record.id_item || "Inconnu";
    const foundOpt = store.appOptions.opciones.find(opt => opt.id === idKey);
    return (foundOpt && foundOpt.description) ? foundOpt.description : (record.description || idKey);
}

// [FIX M-7] Usa la función centralizada de filtrado de store.js en lugar de duplicar la lógica
export function getFilteredRecords() {
    const allRecords = store.getAllRecords();
    if (!ui.elements.filterMonth) return allRecords;

    const current = currentStatsFilters();
    const tVal = current.tache;

    let filtered = store.filterRecords(allRecords, current);

    // Excluir registros de "Réception de matériel" solo cuando no hay filtro de tarea activo
    // (comportamiento específico de Estadísticas para no distorsionar los datos)
    if (tVal === 'all') {
        filtered = filtered.filter(r => !isReceptionTask(r.tache));
    }

    return filtered;
}

// Precio vigente del artículo en el catálogo, o null si no tiene uno válido
export function getCatalogPrice(r) {
    const normalize = (value) => String(value ?? "").trim().toLowerCase();
    const idKey = normalize(r.id_item);
    const descKey = normalize(r.description);
    const catalogs = [store.appOptions.opciones || []];

    for (const list of catalogs) {
        const byId = idKey ? list.find(item => normalize(item.id) === idKey) : null;
        const found = byId || (descKey ? list.find(item => normalize(item.description) === descKey) : null);
        const price = found ? parsePrice(found.prix) : null;
        if (price !== null) return price;
    }

    return null;
}

// Compara el último mes completo con el anterior: el mes en curso aún no es comparable.
// Más consumo se muestra en rojo y menos en verde.
// Si alguno de los dos meses está incompleto (p. ej. los datos empiezan a mitad de mes), no se compara.
function renderMonthlyTrend(el, monthlyTotals, fallbackText, incomplete = new Map()) {
    if (!el) return;

    const monthNames = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lastValue = monthlyTotals[toKey(lastMonth)] || 0;
    const previousValue = monthlyTotals[toKey(previousMonth)] || 0;

    if (Object.keys(monthlyTotals).length < 2 || previousValue <= 0
        || incomplete.has(toKey(lastMonth)) || incomplete.has(toKey(previousMonth))) {
        el.className = 'stat-trend neutral';
        el.textContent = fallbackText;
        return;
    }

    const diffPct = Math.round(((lastValue - previousValue) / previousValue) * 100);
    const period = `${monthNames[lastMonth.getMonth()]} vs ${monthNames[previousMonth.getMonth()]}`;
    el.className = `stat-trend ${diffPct > 0 ? 'negative' : diffPct < 0 ? 'positive' : 'neutral'}`;
    el.textContent = `${diffPct > 0 ? '+' : ''}${fmt(diffPct)} % ${period}`;
}

function renderDataNotice(filteredCount = null) {
    const notice = ui.elements.statsDataNotice;
    if (!notice) return;

    const messages = [];
    if (filteredCount === 0 && store.getAllRecords().length > 0) {
        messages.push("Aucun enregistrement ne correspond aux filtres choisis.");
    }
    const { loaded, total } = store.dataInfo || {};
    if (total > loaded) {
        messages.push(`Seuls les ${loaded.toLocaleString('fr-CA')} enregistrements les plus récents sur ${total.toLocaleString('fr-CA')} sont pris en compte.`);
    }
    notice.textContent = messages.join(' ');
    notice.classList.toggle('hidden-field', messages.length === 0);
}

export function updateDashboard() {
    const dashboardRecords = getFilteredRecords();

    // Total de ampoules
    const totalBulbs = dashboardRecords.reduce((sum, r) => sum + Number(r.quantite || 0), 0);
    renderDataNotice(dashboardRecords.length);
    updateActiveFilters();
    // 1.5 Ampoules changées par mois
    const monthlyData = {};
    dashboardRecords.forEach(r => {
        const key = recordMonthKey(r);
        if (!key) return;
        const qty = Number(r.quantite || 0);
        monthlyData[key] = (monthlyData[key] || 0) + qty;
    });
    const sortedMonths = Object.keys(monthlyData).sort();
    const incomplete = currentIncompleteMonths();
    renderIncompleteNote(incomplete);
    const monthlyLabels = sortedMonths.map(key => shortMonthLabel(key));
    const monthlyValues = sortedMonths.map(key => monthlyData[key]);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Volumen total y n.º 1 de los rankings: tinta neutra (el azul y el naranja son de los tipos de tarea)
    const neutral = NEUTRAL_COLORS[isDarkMode ? 'dark' : 'light'];
    // El mes con más ampoules en tinta oscura y los demás en gris, como en los rankings
    const monthlyMax = Math.max(0, ...monthlyValues);
    const monthlyColors = monthlyValues.map(value => (monthlyMax > 0 && value === monthlyMax ? neutral.ink : neutral.muted));

    // 2. Top 5 Productos
    const productData = {};
    const productCategoryMap = {};
    const productDescMap = {};
    dashboardRecords.forEach(r => {
        const idKey = r.id_item || "Inconnu";
        const foundOpt = store.appOptions.opciones.find(opt => opt.id === idKey);
        const desc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || idKey);
        if (idKey) {
            productData[idKey] = (productData[idKey] || 0) + Number(r.quantite || 0);
            if (r.categorie && !productCategoryMap[idKey]) {
                productCategoryMap[idKey] = r.categorie;
            }
            if (!productDescMap[idKey]) {
                productDescMap[idKey] = desc;
            }
        }
    });
    const sortedProducts = Object.keys(productData).sort((a, b) => productData[b] - productData[a]).slice(0, 5);
    const sortedProductQuantities = sortedProducts.map(p => productData[p]);
    const topProductsFullDesc = sortedProducts.map(p => productDescMap[p]);

    // 3. Distribución por tipo de tarea
    const taskTypeData = {};
    dashboardRecords.forEach(r => {
        if (r.tache) {
            taskTypeData[r.tache] = (taskTypeData[r.tache] || 0) + Number(r.quantite || 0);
        }
    });

    // 4 & 5. Intervenciones y bombillas por planta
    const etageBulbsByCategory = {};
    dashboardRecords.forEach(r => {
        if (r.etage !== undefined && r.etage !== null) {
            // Las cabinas de ascensor cuentan juntas como "Ascenseurs"
            const etageStr = etageGroupKey(r);
            const cat = r.categorie || 'Inconnu';
            if (etageStr) {
                if (!etageBulbsByCategory[etageStr]) etageBulbsByCategory[etageStr] = {};
                etageBulbsByCategory[etageStr][cat] = (etageBulbsByCategory[etageStr][cat] || 0) + Number(r.quantite || 0);
            }
        }
    });

    let sortedEtages = Object.keys(etageBulbsByCategory);
    sortedEtages.sort((a, b) => {
        const totalA = Object.values(etageBulbsByCategory[a]).reduce((sum, v) => sum + v, 0);
        const totalB = Object.values(etageBulbsByCategory[b]).reduce((sum, v) => sum + v, 0);
        return totalB - totalA;
    });

    // Actualizar KPIs
    if (ui.elements.statTotal) {
        ui.elements.statTotal.textContent = fmt(totalBulbs);
        ui.elements.statTotal.title = fmt(totalBulbs);
    }

    renderMonthlyTrend(document.getElementById('stat-trend-total'), monthlyData, 'Consommation globale', incomplete);

    // Promedio sobre meses completos, contando también los meses sin registros
    const { average: monthlyAvg, months: averageMonths } = monthlyAverage(monthlyData, new Date(), new Set(incomplete.keys()));
    if (ui.elements.statAvg) {
        const avg = fmt(monthlyAvg, 1);
        ui.elements.statAvg.textContent = avg;
        ui.elements.statAvg.title = avg;
    }
    const trendAvgEl = document.getElementById('stat-trend-avg');
    if (trendAvgEl) {
        trendAvgEl.className = 'stat-trend neutral';
        trendAvgEl.textContent = `Sur ${averageMonths || 1} mois complet${averageMonths > 1 ? 's' : ''}`;
    }

    if (ui.elements.statTopEtage) {
        const etageTxt = sortedEtages.length > 0 ? etageLabel(sortedEtages[0]) : "-";
        ui.elements.statTopEtage.textContent = etageTxt;
        ui.elements.statTopEtage.title = etageTxt;
    }
    const trendEtageEl = document.getElementById('stat-trend-etage');
    const barEtageEl = document.getElementById('stat-bar-etage');
    if (trendEtageEl) {
        if (sortedEtages.length > 0) {
            const topQty = Object.values(etageBulbsByCategory[sortedEtages[0]]).reduce((s, v) => s + v, 0);
            const etagePct = totalBulbs > 0 ? Math.min(100, Math.round((topQty / totalBulbs) * 100)) : 0;
            trendEtageEl.className = 'stat-trend neutral';
            trendEtageEl.textContent = `${fmt(topQty)} ampoules (${fmt(etagePct)} % du total)`;
            if (barEtageEl) barEtageEl.style.width = `${etagePct}%`;
        } else {
            trendEtageEl.className = 'stat-trend neutral';
            trendEtageEl.textContent = `Aucune donnée`;
            if (barEtageEl) barEtageEl.style.width = '0%';
        }
    }

    if (ui.elements.statTopProduct) {
        const topProdCode = sortedProducts.length > 0 ? sortedProducts[0] : "-";
        const topProdDesc = sortedProducts.length > 0 ? topProductsFullDesc[0] : "";
        // La descripción es lo que la gerencia reconoce; el código interno va en el subtítulo
        ui.elements.statTopProduct.textContent = topProdDesc || topProdCode;
        ui.elements.statTopProduct.title = topProdDesc ? `${topProdDesc} (${topProdCode})` : topProdCode;
        ui.elements.statTopProduct.classList.toggle('stat-value-text', Boolean(topProdDesc));
    }
    const trendProductEl = document.getElementById('stat-trend-product');
    const barProductEl = document.getElementById('stat-bar-product');
    if (trendProductEl) {
        if (sortedProducts.length > 0) {
            const topProdQty = sortedProductQuantities[0] || 0;
            const topProdCode = sortedProducts[0];
            const prodPct = totalBulbs > 0 ? Math.min(100, Math.round((topProdQty / totalBulbs) * 100)) : 0;
            trendProductEl.className = 'stat-trend neutral';
            trendProductEl.textContent = `${fmt(topProdQty)} ampoules (${fmt(prodPct)} %) · ${topProdCode}`;
            trendProductEl.title = trendProductEl.textContent;
            if (barProductEl) barProductEl.style.width = `${prodPct}%`;
        } else {
            trendProductEl.className = 'stat-trend neutral';
            trendProductEl.textContent = `Aucune donnée`;
            if (barProductEl) barProductEl.style.width = '0%';
        }
    }

    // 6. Categorías
    const catCounts = {};
    dashboardRecords.forEach(r => {
        if (r.categorie) {
            catCounts[r.categorie] = (catCounts[r.categorie] || 0) + Number(r.quantite || 0);
        }
    });
    const catLabels = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]);

    const textColor = isDarkMode ? '#94a3b8' : '#475569';

    // Ranking: el n.º 1 en tinta oscura y los demás en gris, como pisos y locataires
    const topProductsColors = sortedProducts.map((_, index) => (index === 0 ? neutral.ink : neutral.muted));

    const handleChartClick = (e, activeEls) => {
        if (!activeEls.length) return;
        const chart = activeEls[0].element.$context.chart;
        const index = activeEls[0].index;
        const label = chart.data.labels[index];
        const canvasId = chart.canvas.id;
        
        ui.setActiveView('view-historique');
        
        if (ui.elements.filterHistoryMonth) ui.elements.filterHistoryMonth.value = 'all';
        if (ui.elements.filterHistoryEtage) ui.elements.filterHistoryEtage.value = 'all';
        if (ui.elements.filterHistoryLocataire) ui.elements.filterHistoryLocataire.value = 'all';
        if (ui.elements.filterHistoryTache) ui.elements.filterHistoryTache.value = 'all';
        if (ui.elements.filterHistoryCategorie) ui.elements.filterHistoryCategorie.value = 'all';
        if (ui.elements.searchHistory) ui.elements.searchHistory.value = '';
        refreshHistoryFilterOptions();

        if (canvasId === 'monthlyBulbsChart' && ui.elements.filterHistoryMonth) {
            ui.elements.filterHistoryMonth.value = sortedMonths[index] || 'all';
        } else if (canvasId === 'taskTypeEvolutionChart' && ui.elements.filterHistoryMonth) {
            ui.elements.filterHistoryMonth.value = taskTypeEvolution.months[index] || 'all';
        } else if (canvasId === 'categoryEvolutionChart' && ui.elements.filterHistoryMonth) {
            ui.elements.filterHistoryMonth.value = categoryEvolution.months[index] || 'all';
        } else if (canvasId === 'docsEvolutionChart' && ui.elements.filterHistoryMonth) {
            ui.elements.filterHistoryMonth.value = docsEvolution.months[index] || 'all';
        } else if (canvasId === 'topEtagesChart' && ui.elements.filterHistoryEtage) {
            if (label === ELEVATOR_GROUP && ui.elements.searchHistory) {
                // El historial muestra cada cabina por separado: se buscan todas las que empiezan por "ASC"
                ui.elements.searchHistory.value = 'ASC';
            } else {
                ui.elements.filterHistoryEtage.value = label || 'all';
            }
        } else if (canvasId === 'taskTypeChart' && ui.elements.filterHistoryTache) {
            ui.elements.filterHistoryTache.value = label || 'all';
        } else if (canvasId === 'locataireChart' && ui.elements.filterHistoryLocataire) {
            ui.elements.filterHistoryLocataire.value = label || 'all';
        } else if (canvasId === 'topProductsChart' && ui.elements.searchHistory) {
            // La etiqueta es la descripción; se busca por el código, que es único
            ui.elements.searchHistory.value = sortedProducts[index] || label;
        } else if (canvasId === 'categoryChart' && ui.elements.filterHistoryCategorie) {
            ui.elements.filterHistoryCategorie.value = label || 'all';
        } else if (ui.elements.searchHistory) {
            ui.elements.searchHistory.value = label;
        }

        refreshHistoryFilterOptions();
        ui.renderHistory();
    };

    renderChart('monthlyBulbsChart', 'bar', monthlyLabels, monthlyValues, monthlyColors, {
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        scales: {
            y: { grace: '18%' }
        },
        plugins: {
            datalabels: {
                anchor: 'end',
                align: 'top',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 12 },
                formatter: fmtLabel
            }
        }
    });

    // Ampoules remplacées de lundi à vendredi: le jour le plus chargé ressort, les autres restent neutres
    const weekdayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const { values: weekdayValues, weekend: weekendTotal } = weekdayTotals(dashboardRecords);
    const weekdayMax = Math.max(...weekdayValues);
    const weekdayColors = weekdayValues.map(v => (weekdayMax > 0 && v === weekdayMax)
        ? neutral.ink
        : neutral.muted);

    const weekendNote = document.getElementById('weekday-chart-note');
    if (weekendNote) {
        weekendNote.textContent = weekendTotal > 0
            ? `${weekendTotal.toLocaleString('fr-CA')} ampoule${weekendTotal > 1 ? 's' : ''} remplacée${weekendTotal > 1 ? 's' : ''} le week-end ne figure${weekendTotal > 1 ? 'nt' : ''} pas dans ce graphique.`
            : '';
        weekendNote.classList.toggle('hidden-field', weekendTotal === 0);
    }

    renderChart('weekdayChart', 'bar', weekdayLabels, weekdayValues, weekdayColors, {
        datasetLabel: 'Ampoules',
        scales: {
            y: { grace: '18%' }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end',
                align: 'top',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 12 },
                formatter: fmtLabel
            }
        }
    });

    renderChart('topProductsChart', 'bar', topProductsFullDesc, sortedProductQuantities, topProductsColors, {
        indexAxis: 'y',
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        fullDescriptions: topProductsFullDesc,
        // Margen a la derecha para que el número de la barra más larga no se corte
        scales: { x: { grace: '15%' } },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: function(context) {
                        const index = context[0].dataIndex;
                        const code = sortedProducts[index];
                        const desc = context[0].chart.options.fullDescriptions[index] || context[0].label;
                        return code && code !== desc ? `${desc} (${code})` : desc;
                    },
                    afterTitle: function(context) {
                        const category = productCategoryMap[sortedProducts[context[0].dataIndex]];
                        return category ? `Catégorie : ${category}` : '';
                    }
                }
            }
        }
    });

    // Cada tipo de tarea tiene siempre el mismo color (azul = Bon de travail, naranja = Tournée)
    const taskTypeKeys = Object.keys(taskTypeData).sort((a, b) => taskTypeData[b] - taskTypeData[a]);
    const taskTypeVals = taskTypeKeys.map(k => taskTypeData[k]);
    const taskTypeDoughnutColors = taskTypeKeys.map(k => taskColor(k, isDarkMode));

    const taskTypeTotal = taskTypeVals.reduce((sum, v) => sum + v, 0);
    const isSmallSlice = (context) => taskTypeTotal > 0 && Number(context.dataset.data[context.dataIndex]) / taskTypeTotal < 0.08;
    renderChart('taskTypeChart', 'doughnut', taskTypeKeys, taskTypeVals, taskTypeDoughnutColors, {
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        cutout: '45%', 
        layout: { padding: { top: 20, bottom: 20, left: 40, right: 40 } },
        plugins: {
            // Todas las porciones llevan su número: dentro si caben, fuera del anillo si son pequeñas
            datalabels: {
                display: (context) => Number(context.dataset.data[context.dataIndex]) > 0,
                anchor: (context) => (isSmallSlice(context) ? 'end' : 'center'),
                align: (context) => (isSmallSlice(context) ? 'end' : 'center'),
                offset: 4,
                formatter: (value) => fmt(value),
                color: (context) => (isSmallSlice(context) ? textColor : '#ffffff'),
                font: { weight: 'bold', family: 'Outfit', size: window.innerWidth < 480 ? 12 : 14 }
            }
        }
    });

    // 3.2 Distribución por Locataire (Gráfico de Barras Horizontales con destaque del #1)
    const locataireData = {};
    dashboardRecords.forEach(r => {
        const loc = (r.locataire && String(r.locataire).trim() !== "") ? String(r.locataire).trim() : "Non assigné";
        locataireData[loc] = (locataireData[loc] || 0) + Number(r.quantite || 0);
    });

    const locataireKeys = Object.keys(locataireData).sort((a, b) => locataireData[b] - locataireData[a]);
    const locataireVals = locataireKeys.map(k => locataireData[k]);
    const locataireColorsArr = locataireKeys.map((_, i) => i === 0 ? neutral.ink : neutral.muted);

    const locataireHeight = Math.max(250, locataireKeys.length * 42);
    const locataireCard = document.getElementById('locataireChart')?.closest('.chart-card');
    if (locataireCard) locataireCard.style.height = `${locataireHeight + 80}px`;

    renderChart('locataireChart', 'bar', locataireKeys, locataireVals, locataireColorsArr, {
        datasetLabel: 'Ampoules',
        indexAxis: 'y',
        onClick: handleChartClick,
        scales: {
            x: { grace: '15%' }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end',
                align: 'right',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 12 },
                formatter: fmtLabel
            }
        }
    });

    // Évolution mensuelle par type de tâche: mêmes couleurs que le graphique de répartition
    const taskTypeEvolution = monthlyByGroup(
        dashboardRecords.filter(r => r.tache),
        r => r.tache,
        { fillGaps: true }
    );
    renderGroupEvolution('taskTypeEvolutionChart', taskTypeEvolution.months, taskTypeEvolution.groups, taskTypeEvolution.data, {
        colorFor: (name) => taskColor(name, isDarkMode),
        textColor,
        onClick: handleChartClick
    });

    // Bons de travail et tournées réalisés par mois: chaque numéro n'est compté qu'une fois
    const docsEvolution = uniqueDocsByMonth(dashboardRecords);
    const docsColors = [taskColor('Bon de travail', isDarkMode), taskColor('Tournée', isDarkMode)];
    const bonLabel = `Bons de travail (total : ${docsEvolution.totalBon})`;
    const tourneeLabel = `Tournées (total : ${docsEvolution.totalTournee})`;
    const docsNote = document.getElementById('docs-chart-note');
    if (docsNote) {
        // Solo se muestra un aviso cuando hay algo que explicar (filas sin número o sin datos)
        let extra = '';
        if (docsEvolution.withoutNumber > 0) {
            const count = docsEvolution.withoutNumber;
            extra = ` ${count} ligne${count > 1 ? 's' : ''} de bon ou de tournée sans numéro ${count > 1 ? 'ne sont pas comptées' : "n'est pas comptée"}.`;
        }
        if (docsEvolution.months.length === 0) {
            extra += ' Aucun numéro de bon ou de tournée trouvé : vérifiez que le champ est rempli dans les enregistrements.';
        }
        docsNote.textContent = extra.trim();
        docsNote.classList.toggle('hidden-field', extra === '');
    }
    renderGroupEvolution('docsEvolutionChart', docsEvolution.months, [bonLabel, tourneeLabel], {
        [bonLabel]: docsEvolution.bon,
        [tourneeLabel]: docsEvolution.tournee
    }, {
        colorFor: (_name, index) => docsColors[index],
        textColor,
        onClick: handleChartClick
    });

    // Évolution mensuelle par catégorie: una pequeña gráfica de barras por categoría, con la misma escala,
    // así cada valor lleva su número (en barras apiladas los segmentos pequeños no tenían sitio)
    const categoryEvolution = monthlyByCategory(dashboardRecords, { fillGaps: true });
    renderGroupEvolution('categoryEvolutionChart', categoryEvolution.months, categoryEvolution.categories, categoryEvolution.data, {
        colorFor: (name) => getCategoryColor(name, isDarkMode),
        labelColorFor: (color) => readableLabelColor(color, isDarkMode),
        pointStyles: true,
        textColor,
        onClick: handleChartClick
    });

    renderLocataireEvolution(dashboardRecords);
    renderEtageEvolution(dashboardRecords);
    renderReferenceEvolution(dashboardRecords);
    populateReportMonths();

    const topProductsHeight = Math.max(250, sortedProducts.length * 48);
    const topProductsCard = document.getElementById('topProductsChart')?.closest('.chart-card');
    if (topProductsCard) topProductsCard.style.height = `${topProductsHeight + 80}px`;

    const catChartHeight = Math.max(250, catLabels.length * 48);
    const catCard = document.getElementById('categoryChart')?.closest('.chart-card');
    if (catCard) catCard.style.height = `${catChartHeight + 80}px`;

    const catValues = catLabels.map(cat => catCounts[cat]);
    // Ranking de categorías con el mismo estilo que los demás rankings (n.º 1 oscuro, resto gris)
    renderChart('categoryChart', 'bar', catLabels, catValues, catLabels.map((_, index) => (index === 0 ? neutral.ink : neutral.muted)), {
        datasetLabel: 'Ampoules',
        indexAxis: 'y',
        onClick: handleChartClick,
        scales: { x: { grace: '15%' } },
        plugins: { legend: { display: false } }
    });

    const top5Etages = sortedEtages.slice(0, 5);
    const top5EtagesValues = top5Etages.map(et => {
        return Object.values(etageBulbsByCategory[et]).reduce((sum, v) => sum + v, 0);
    });
    // Mismo resaltado que en locataires: el piso n.º 1 en tinta oscura, los demás en gris neutro
    const topEtagesColors = top5Etages.map((_, i) => i === 0 ? neutral.ink : neutral.muted);

    renderChart('topEtagesChart', 'bar', top5Etages, top5EtagesValues, topEtagesColors, {
        indexAxis: 'y',
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        scales: {
            x: { grace: '15%' },
            // La etiqueta guarda el piso tal cual (lo usa el clic); en el eje se muestra "Étage 2"
            y: { ticks: { callback: function (value) { return etageLabel(this.getLabelForValue(value)); } } }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end',
                align: 'right',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 12 },
                formatter: fmtLabel
            }
        }
    });

}
// Estilo de una línea mensual: rectas entre puntos (una curva inventaría valores entre meses)
function monthlyLineStyle(color) {
    return {
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointBackgroundColor: color
    };
}

// Etiquetas de valor de una gráfica de líneas: se ven todas, también los 0.
// En cada mes la serie más alta lleva su número encima del punto y la más baja debajo,
// así dos líneas cercanas no se pisan. Debajo del 0 queda un margen (sin marcas) para esas etiquetas.
function lineValueLabels(seriesValues, textColor) {
    const maxValue = Math.max(1, ...seriesValues.flat().map(v => Number(v) || 0));
    const LABEL_HEIGHT = 15;
    const LABEL_GAP = 2;
    const DISTANCE = 15; // del centro del punto al centro de su número (sin tapar el punto)

    // Posición vertical (en píxeles) del número de cada serie en un mes. Cada número va junto a su punto:
    // el de la serie más baja debajo y los demás encima. Si dos números se tocarían, se separan lo mínimo,
    // la mitad hacia arriba y la mitad hacia abajo, sin salir del gráfico. Las series ocultas no cuentan.
    const layout = (chart, index) => {
        const y = chart.scales.y;
        const items = seriesValues
            .map((values, dataset) => ({ dataset, py: y.getPixelForValue(Number(values[index]) || 0) }))
            .filter(item => chart.isDatasetVisible(item.dataset))
            .sort((a, b) => a.py - b.py || a.dataset - b.dataset);
        items.forEach((item, rank) => {
            item.cy = items.length > 1 && rank === items.length - 1 ? item.py + DISTANCE : item.py - DISTANCE;
        });
        items.sort((a, b) => a.cy - b.cy || a.dataset - b.dataset);
        const top = chart.chartArea.top + LABEL_HEIGHT / 2;
        const bottom = y.getPixelForValue(y.min) - LABEL_HEIGHT / 2;
        const spacing = LABEL_HEIGHT + LABEL_GAP;
        for (let pass = 0; pass < 60; pass++) {
            let moved = false;
            for (let k = 1; k < items.length; k++) {
                const overlap = spacing - (items[k].cy - items[k - 1].cy);
                if (overlap > 0.1) {
                    items[k - 1].cy -= overlap / 2;
                    items[k].cy += overlap / 2;
                    moved = true;
                }
            }
            items.forEach(item => { item.cy = Math.min(bottom, Math.max(top, item.cy)); });
            if (!moved) break;
        }
        return new Map(items.map(item => [item.dataset, item]));
    };
    const placed = (ctx) => layout(ctx.chart, ctx.dataIndex).get(ctx.datasetIndex);
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#ffffff';
    const gridColor = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    // Más series, más sitio bajo el 0 para los números que van debajo de su punto
    const roomBelowZero = seriesValues.length > 1 ? Math.ceil(maxValue * (seriesValues.length > 2 ? 0.18 : 0.14)) : 0;
    return {
        datalabels: {
            display: true,
            anchor: 'center',
            align: (ctx) => { const p = placed(ctx); return !p || p.cy < p.py ? 'top' : 'bottom'; },
            offset: (ctx) => { const p = placed(ctx); return p ? Math.max(0, Math.abs(p.cy - p.py) - LABEL_HEIGHT / 2) : 6; },
            clamp: true,
            color: (context) => context.dataset.labelColor || context.dataset.borderColor || textColor,
            // Fondo del color de la tarjeta: el número se lee aunque pase por encima de otra línea
            backgroundColor: surface,
            borderRadius: 3,
            padding: { top: 1, bottom: 0, left: 3, right: 3 },
            font: { weight: 'bold', family: 'Outfit', size: 11 },
            formatter: (value) => fmt(value)
        },
        scales: {
            // offset: medio mes de margen a cada lado, para que el primer y el último número no se corten
            x: { offset: true },
            y: {
                beginAtZero: true,
                grace: '15%',
                min: -roomBelowZero,
                ticks: { callback: (value) => (value < 0 ? '' : fmt(value)) },
                // Las marcas negativas se quitan y el 0 se mantiene siempre como base del eje
                afterBuildTicks: (scale) => {
                    const ticks = scale.ticks.filter(tick => tick.value >= 0);
                    if (!ticks.some(tick => tick.value === 0)) ticks.unshift({ value: 0 });
                    scale.ticks = ticks;
                },
                grid: { color: (ctx) => (ctx.tick && ctx.tick.value < 0 ? 'transparent' : gridColor) }
            }
        }
    };
}

// Contraste entre dos colores #rrggbb (fórmula WCAG)
function contrastRatio(a, b) {
    const luminance = (hex) => {
        const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return 1;
        const c = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
            .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// Color del número de una línea: el de la línea si se lee bien sobre la tarjeta (4,5:1); si no, el mismo
// tono oscurecido (en claro) o aclarado (en oscuro) hasta leerse bien, para no perder a qué línea pertenece
function readableLabelColor(color, isDarkMode) {
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || (isDarkMode ? '#1e1e1e' : '#ffffff');
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    const rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    const target = isDarkMode ? 255 : 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
        const mixed = '#' + rgb.map(v => Math.round(v + (target - v) * t).toString(16).padStart(2, '0')).join('');
        if (contrastRatio(mixed, surface) >= 4.5) return mixed;
    }
    return NEUTRAL_COLORS[isDarkMode ? 'dark' : 'light'].ink;
}

// Formas de punto para distinguir las líneas también sin el color
const POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'crossRot', 'star'];

// Gráfica de líneas con un trazo por grupo a lo largo de los meses
function renderGroupEvolution(canvasId, months, groups, data, { colorFor, textColor, onClick, pointStyles = false, labelColorFor = null }) {
    const labels = months.map(key => shortMonthLabel(key));

    const datasets = groups.map((group, index) => {
        const color = colorFor(group, index);
        return {
            label: group,
            data: data[group],
            ...monthlyLineStyle(color),
            ...(pointStyles ? { pointStyle: POINT_STYLES[index % POINT_STYLES.length], pointRadius: 5, pointHoverRadius: 7 } : {}),
            ...(labelColorFor ? { labelColor: labelColorFor(color) } : {})
        };
    });

    const valueLabels = lineValueLabels(datasets.map(d => d.data), textColor);
    renderChart(canvasId, 'line', labels, [], null, {
        datasets,
        onClick,
        // Al pasar sobre un mes se ven todos los grupos a la vez
        interaction: { mode: 'index', intersect: false },
        scales: valueLabels.scales,
        layout: { padding: { top: 20 } },
        plugins: {
            legend: { display: true, labels: { usePointStyle: pointStyles } },
            datalabels: valueLabels.datalabels
        }
    });
}

const REPORT_MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function reportMonthLabel(key) {
    const [year, month] = key.split('-');
    return `${REPORT_MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

// El reporte usa todos los registros, sin los filtros de Statistiques (excepto la réception de material)
function reportRecords() {
    return store.getAllRecords().filter(record => !isReceptionTask(record.tache));
}

function populateReportMonths() {
    const select = document.getElementById('report-month');
    if (!select) return;
    const months = recordMonths(reportRecords());
    const previous = select.value;
    select.innerHTML = months.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(reportMonthLabel(key))}</option>`).join('');
    select.value = months.includes(previous) ? previous : (months[0] || '');
}

function reportTable(title, rows, firstColumn, secondColumn = 'Ampoules') {
    if (rows.length === 0) return '';
    const body = rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${fmt(row.total)}</td></tr>`).join('');
    return `<h2>${escapeHtml(title)}</h2><table><thead><tr><th>${escapeHtml(firstColumn)}</th><th>${escapeHtml(secondColumn)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

// Colores del informe impreso: siempre los del tema claro, sea cual sea el tema de la app
const REPORT_COLORS = { current: '#334155', previous: '#b8b6ad', text: '#334155', grid: 'rgba(0, 0, 0, 0.08)' };

// Dibuja una gráfica en un lienzo fuera de la página y la devuelve como imagen, nítida al imprimir
function chartImage(config, width, height) {
    if (typeof Chart === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const chart = new Chart(canvas.getContext('2d'), {
        ...config,
        options: {
            responsive: false,
            animation: false,
            devicePixelRatio: 2,
            locale: 'fr-CA',
            ...config.options,
            plugins: { legend: { display: false }, tooltip: { enabled: false }, ...(config.options || {}).plugins }
        }
    });
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    return url;
}

const reportFont = { family: 'Outfit, sans-serif', size: 12 };
const reportLabels = (extra = {}) => ({
    color: REPORT_COLORS.text,
    font: { ...reportFont, weight: 'bold' },
    formatter: (value) => fmt(value),
    ...extra
});

// Barras horizontales de un ranking; con `previous`, cada fila lleva también la barra del mes anterior
function rankingImage(rows, previousRows, width) {
    const labels = rows.map(row => row.name);
    const prevOf = (name) => (previousRows ? (previousRows.find(row => row.name === name) || { total: 0 }).total : 0);
    const datasets = [{ data: rows.map(row => row.total), backgroundColor: REPORT_COLORS.current, borderRadius: 3, barPercentage: 0.8, categoryPercentage: previousRows ? 0.8 : 0.7 }];
    if (previousRows) datasets.push({ data: labels.map(prevOf), backgroundColor: REPORT_COLORS.previous, borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.8 });
    const rowHeight = previousRows ? 28 : 22;
    return chartImage({
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: 'y',
            layout: { padding: { right: 40 } },
            scales: {
                x: { beginAtZero: true, grace: '12%', ticks: { font: reportFont, color: REPORT_COLORS.text, precision: 0 }, grid: { color: REPORT_COLORS.grid } },
                y: { ticks: { font: reportFont, color: REPORT_COLORS.text }, grid: { display: false } }
            },
            plugins: { datalabels: reportLabels({ anchor: 'end', align: 'right', offset: 4 }) }
        }
    }, width, Math.max(100, rows.length * rowHeight + 40));
}

// Diferencia con el mes anterior: "+12 (+5 %)", "−3 (−10 %)", "=" o "nouveau"
function variationText(current, previous) {
    const diff = current - previous;
    if (diff === 0) return '=';
    const sign = diff > 0 ? '+' : '−';
    const pct = previous > 0 ? ` (${sign}${fmt(Math.round(Math.abs(diff) / previous * 100))} %)` : '';
    return `${sign}${fmt(Math.abs(diff))}${pct}`;
}

// hasPrevious es falso si el mes anterior es antes del inicio del historial: entonces no se compara
function buildReportHtml(report, previous, trend, incomplete, hasPrevious = true) {
    const generated = new Date().toLocaleDateString('fr-CA');
    const title = `<h1>Rapport mensuel — ${escapeHtml(reportMonthLabel(report.month))}</h1>`;
    const footer = `<p class="report-footer">Généré le ${escapeHtml(generated)} — Lightman</p>`;
    if (report.lines === 0) return `${title}<p>Aucun enregistrement pour ce mois.</p>${footer}`;

    const monthName = reportMonthLabel(report.month);
    const prevName = reportMonthLabel(previous.month);
    const partialNote = (key) => {
        const info = incomplete.get(key);
        if (!info) return '';
        return info.kind === 'current'
            ? `${reportMonthLabel(key)} est le mois en cours (données jusqu'au ${info.day}) : la comparaison n'est pas encore complète.`
            : `${reportMonthLabel(key)} est incomplet : les données commencent le ${info.day}.`;
    };
    const notes = [partialNote(report.month), hasPrevious ? partialNote(previous.month) : ''].filter(Boolean);
    if (!hasPrevious) notes.push(`L'historique commence en ${monthName} : pas de comparaison avec ${prevName}.`);

    const row = (label, current, prev) => (hasPrevious
        ? `<tr><td>${label}</td><td>${fmt(current)}</td><td>${fmt(prev)}</td><td>${variationText(current, prev)}</td></tr>`
        : `<tr><td>${label}</td><td>${fmt(current)}</td><td>—</td><td>—</td></tr>`);
    const comparison = `<table class="report-comparison"><thead><tr><th></th><th>${escapeHtml(monthName)}</th><th>${escapeHtml(prevName)}</th><th>Variation</th></tr></thead><tbody>
        ${row('Ampoules remplacées', report.total, previous.total)}
        ${row('Bons de travail', report.bons, previous.bons)}
        ${row('Tournées', report.tournees, previous.tournees)}
        ${row('Lignes enregistrées', report.lines, previous.lines)}</tbody></table>`;

    // 1. Los seis últimos meses: el mes del informe en tinta oscura, los demás en gris (pálidos si están incompletos)
    const trendImage = chartImage({
        type: 'bar',
        data: {
            labels: trend.map(item => shortMonthLabel(item.month) + (incomplete.has(item.month) ? '*' : '')),
            datasets: [{
                data: trend.map(item => item.total),
                // El mes del informe siempre en tinta oscura; los otros en gris, pálidos si están incompletos ("*")
                backgroundColor: trend.map(item => (item.month === report.month ? REPORT_COLORS.current : fadeColor(REPORT_COLORS.previous, incomplete.has(item.month)))),
                borderRadius: 3,
                maxBarThickness: 90
            }]
        },
        options: {
            layout: { padding: { top: 22 } },
            scales: {
                x: { ticks: { font: reportFont, color: REPORT_COLORS.text }, grid: { display: false } },
                y: { beginAtZero: true, grace: '10%', ticks: { font: reportFont, color: REPORT_COLORS.text, precision: 0 }, grid: { color: REPORT_COLORS.grid } }
            },
            plugins: { datalabels: reportLabels({ anchor: 'end', align: 'top', offset: 2 }) }
        }
    }, 720, 150);

    // 2. Categorías: mes del informe frente al anterior
    const categoryNames = [...new Set([...report.categories, ...previous.categories].map(item => item.name))];
    const categoryRows = categoryNames
        .map(name => ({ name, total: (report.categories.find(item => item.name === name) || { total: 0 }).total }))
        .sort((a, b) => b.total - a.total);
    const categoryImage = rankingImage(categoryRows, hasPrevious ? previous.categories : null, 720);

    const etages = report.etages.slice(0, 5).map(item => ({ name: etageLabel(item.name), total: item.total }));
    const etageImage = etages.length ? rankingImage(etages, null, 350) : '';
    const locataires = report.locataires.slice(0, 5);
    const locataireImage = locataires.length ? rankingImage(locataires, null, 350) : '';
    const img = (src, alt) => (src ? `<img src="${src}" alt="${escapeHtml(alt)}">` : '');
    const legend = hasPrevious
        ? `<p class="report-legend"><span class="report-swatch report-swatch-current"></span>${escapeHtml(monthName)}<span class="report-swatch report-swatch-previous"></span>${escapeHtml(prevName)}</p>`
        : '';

    return `${title}
        <p class="report-subtitle">${hasPrevious ? `Comparaison avec ${escapeHtml(prevName)}` : 'Premier mois de l’historique'}</p>
        ${comparison}
        ${notes.length ? `<p class="report-note">${notes.map(escapeHtml).join(' ')}</p>` : ''}
        <h2>Ampoules par mois${trend.length > 1 ? ` — ${trend.length} derniers mois` : ''}</h2>
        ${img(trendImage, `Ampoules remplacées par mois : ${trend.map(item => `${shortMonthLabel(item.month)} ${item.total}`).join(', ')}`)}
        ${trend.some(item => incomplete.has(item.month)) ? '<p class="report-note">* Mois incomplet.</p>' : ''}
        <h2>Par catégorie</h2>
        ${legend}
        ${img(categoryImage, `Ampoules par catégorie, ${monthName} et ${prevName}`)}
        <div class="report-pair">
            <div><h2>Étages les plus actifs</h2>${img(etageImage, 'Étages les plus actifs')}</div>
            <div><h2>Par locataire</h2>${img(locataireImage, 'Ampoules par locataire')}</div>
        </div>
        <div class="report-block">${reportTable('Articles les plus remplacés', report.references.slice(0, 5), 'Article')}${footer}</div>`;
}

export async function printMonthlyReport() {
    const select = document.getElementById('report-month');
    const container = document.getElementById('print-report');
    if (!select || !container || !select.value) {
        ui.showToast("Aucun mois à imprimer.", "warning");
        return;
    }

    const records = reportRecords();
    const month = select.value;
    // Los seis últimos meses, sin los anteriores al primer registro (saldrían en 0 sin serlo)
    const firstMonth = recordMonths(records).slice(-1)[0] || month;
    container.innerHTML = buildReportHtml(
        monthlyReport(records, month),
        monthlyReport(records, previousMonthKey(month)),
        monthlyTrend(records, month, 6).filter(item => item.month >= firstMonth),
        incompleteMonths(records),
        previousMonthKey(month) >= firstMonth
    );
    // Las imágenes de las gráficas deben estar listas antes de abrir el diálogo de impresión
    await Promise.all([...container.querySelectorAll('img')].map(image => (image.decode ? image.decode().catch(() => {}) : null)));

    // La clase solo oculta la app al imprimir (regla @media print): en pantalla no cambia nada
    const cleanup = () => {
        document.body.classList.remove('printing-report');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    document.body.classList.add('printing-report');
    window.print();
}

const boundCompareControls = new Set();

// Referencias presentes en los registros, ordenadas por nombre. Si dos comparten descripción, se distinguen por su ID.
function referenceOptions(records) {
    const byKey = new Map();
    records.forEach(record => {
        const key = referenceKey(record);
        const entry = byKey.get(key);
        if (entry) {
            entry.total += Number(record.quantite || 0);
            return;
        }
        const found = store.appOptions.opciones.find(opt => opt.id === key);
        byKey.set(key, {
            key,
            label: (found && found.description) || record.description || key,
            total: Number(record.quantite || 0)
        });
    });

    const entries = [...byKey.values()];
    const labelCounts = {};
    entries.forEach(entry => { labelCounts[entry.label] = (labelCounts[entry.label] || 0) + 1; });
    entries.forEach(entry => {
        if (labelCounts[entry.label] > 1 && entry.key !== entry.label) entry.label = `${entry.label} — ${entry.key}`;
    });
    return sortByLabel(entries);
}

// Locatarios presentes en los registros, ordenados por nombre
function locataireOptions(records) {
    const byKey = new Map();
    records.forEach(record => {
        const key = locataireKey(record);
        const entry = byKey.get(key) || { key, label: key, total: 0 };
        entry.total += Number(record.quantite || 0);
        byKey.set(key, entry);
    });
    return sortByLabel([...byKey.values()]);
}

// Pisos presentes en los registros, del más bajo al más alto; los registros sin piso no cuentan
function etageOptions(records) {
    const byKey = new Map();
    records.forEach(record => {
        if (!etageKey(record)) return;
        const key = etageGroupKey(record);
        const entry = byKey.get(key) || { key, label: etageLabel(key), total: 0 };
        entry.total += Number(record.quantite || 0);
        byKey.set(key, entry);
    });
    return sortByLabel([...byKey.values()]);
}

function sortByLabel(entries) {
    return entries.sort((x, y) => x.label.localeCompare(y.label, 'fr', { numeric: true, sensitivity: 'base' }));
}

function fillCompareSelect(select, entries, selectedKey, emptyLabel) {
    select.innerHTML = '';
    if (emptyLabel) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = emptyLabel;
        select.appendChild(empty);
    }
    entries.forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.key;
        option.textContent = entry.label;
        select.appendChild(option);
    });
    select.value = selectedKey;
    select.disabled = entries.length === 0;
}

// Cada gráfica de comparación tiene sus selectores, su lienzo y su propia elección guardada
const REFERENCE_COMPARE = {
    name: 'refs',
    selectA: 'compare-ref-a',
    selectB: 'compare-ref-b',
    canvasId: 'referenceEvolutionChart',
    getKey: referenceKey,
    buildEntries: referenceOptions
};

const LOCATAIRE_COMPARE = {
    name: 'locataires',
    selectA: 'compare-loc-a',
    // Un solo locatario a la vez: esta gráfica no se compara con otro
    selectB: null,
    canvasId: 'locataireEvolutionChart',
    getKey: locataireKey,
    buildEntries: locataireOptions
};

const ETAGE_COMPARE = {
    name: 'etages',
    selectA: 'compare-etage-a',
    // Un solo piso a la vez: esta gráfica no se compara con otro
    selectB: null,
    canvasId: 'etageEvolutionChart',
    getKey: etageGroupKey,
    buildEntries: etageOptions
};

function renderReferenceEvolution(records) {
    renderCompareEvolution(REFERENCE_COMPARE, records);
}

function renderLocataireEvolution(records) {
    renderCompareEvolution(LOCATAIRE_COMPARE, records);
}

function renderEtageEvolution(records) {
    renderCompareEvolution(ETAGE_COMPARE, records);
}

// Gráfica de líneas: evolución mensual de un elemento elegido y, si se elige, comparada con otro
function renderCompareEvolution(config, records) {
    const selectA = document.getElementById(config.selectA);
    // Algunas gráficas solo permiten elegir un elemento, sin segundo selector para comparar
    const selectB = config.selectB ? document.getElementById(config.selectB) : null;
    if (!selectA || (config.selectB && !selectB)) return;

    if (!boundCompareControls.has(config.name)) {
        boundCompareControls.add(config.name);
        const onChange = () => {
            store.setCompareSelection(selectA.value, selectB ? selectB.value : '', config.name);
            renderCompareEvolution(config, getFilteredRecords());
        };
        selectA.addEventListener('change', onChange);
        if (selectB) selectB.addEventListener('change', onChange);
    }

    const entries = config.buildEntries(records);
    const keys = entries.map(entry => entry.key);
    const saved = store.getCompareSelection(config.name);

    // Sin elección válida se muestra el elemento más utilizado
    const mostUsed = [...entries].sort((x, y) => y.total - x.total)[0];
    const a = keys.includes(saved.a) ? saved.a : (mostUsed ? mostUsed.key : '');
    const b = selectB && keys.includes(saved.b) && saved.b !== a ? saved.b : '';

    fillCompareSelect(selectA, entries, a, null);
    if (selectB) fillCompareSelect(selectB, entries.filter(entry => entry.key !== a), b, '— Sans comparaison —');

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#94a3b8' : '#475569';
    // Elemento elegido en tinta neutra y el de comparación en gris: ninguno toma un color que ya
    // significa algo (tipos de tarea o categorías). La leyenda dice cuál es cuál.
    const lineColors = isDarkMode ? [NEUTRAL_COLORS.dark.ink, '#898781'] : [NEUTRAL_COLORS.light.ink, '#898781'];

    const selected = [a, b].filter(Boolean);
    const { months, series } = monthlySeries(records, selected, config.getKey);
    const labelOf = (key) => (entries.find(entry => entry.key === key) || { label: key }).label;
    const labels = months.map(key => shortMonthLabel(key));

    const datasets = selected.map((key, index) => ({
        label: labelOf(key),
        data: series[key],
        ...monthlyLineStyle(lineColors[index])
    }));

    const valueLabels = lineValueLabels(datasets.map(d => d.data), textColor);
    renderChart(config.canvasId, 'line', labels, [], null, {
        datasets,
        // Al pasar sobre un mes se ven las dos líneas a la vez
        interaction: { mode: 'index', intersect: false },
        scales: valueLabels.scales,
        layout: { padding: { top: 20 } },
        plugins: {
            legend: { display: true },
            datalabels: valueLabels.datalabels
        }
    });
}

function renderChart(canvasId, type, labels, data, colors, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    // Sin conexión Chart.js puede no estar disponible: el resto de la app debe seguir funcionando
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#94a3b8' : '#475569';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        locale: 'fr-CA',
        color: textColor,
        layout: {
            padding: { right: customOptions.indexAxis === 'y' ? 35 : 0 }
        },
        plugins: {
            legend: {
                display: (['pie', 'doughnut'].includes(type) || customOptions.datasets !== undefined),
                position: 'bottom',
                labels: { 
                    color: textColor, 
                    padding: 20, 
                    font: { family: 'Outfit', size: 12 },
                    filter: (item) => item.text !== 'Total',
                    generateLabels: (chart) => {
                        if (['pie', 'doughnut'].includes(type)) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                const dataset = data.datasets[0];
                                const total = dataset.data.reduce((sum, val) => sum + Number(val || 0), 0);
                                return data.labels.map((label, i) => {
                                    const value = Number(dataset.data[i] || 0);
                                    const percentage = `${fmt(total > 0 ? (value / total) * 100 : 0, 1)} %`;
                                    
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    return {
                                        text: `${label} (${percentage})`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: isNaN(dataset.data[i]) || (meta.data[i] && meta.data[i].hidden),
                                        index: i,
                                        fontColor: textColor
                                    };
                                });
                            }
                            return [];
                        } else {
                            return Chart.defaults.plugins.legend.labels.generateLabels(chart);
                        }
                    }
                }
            },
            tooltip: {
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                titleColor: isDarkMode ? '#f8fafc' : '#0f172a',
                bodyColor: isDarkMode ? '#cbd5e1' : '#334155',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
                bodyFont: { family: 'Outfit', size: 12 },
                boxPadding: 4
            },
            datalabels: {
                display: true,
                anchor: (['pie', 'doughnut'].includes(type) || customOptions.datasets) ? 'center' : 'end',
                align: (['pie', 'doughnut'].includes(type) || customOptions.datasets) ? 'center' : (customOptions.indexAxis === 'y' ? 'right' : 'top'),
                color: (['pie', 'doughnut'].includes(type) || customOptions.datasets) ? '#fff' : textColor,
                offset: customOptions.datasets ? 0 : 4,
                font: { weight: 'bold', family: 'Outfit' },
                formatter: fmtLabel
            }
        },
        scales: ['pie', 'doughnut'].includes(type) ? {} : {
            x: {
                ticks: { precision: 0, color: textColor, font: { family: 'Outfit' } },
                grid: { color: gridColor, drawBorder: false }
            },
            y: {
                ticks: { precision: 0, color: textColor, font: { family: 'Outfit' } },
                grid: { color: gridColor, drawBorder: false }
            }
        },
        elements: {
            bar: { borderRadius: 6, borderSkipped: false },
            line: { tension: 0, borderWidth: 2 }
        },
        onClick: (e, activeEls) => {
            if (activeEls.length > 0 && customOptions.onClick) {
                customOptions.onClick(e, activeEls);
            }
        }
    };

    const options = { ...defaultOptions, ...customOptions };
    if (customOptions.layout) {
        options.layout = { ...defaultOptions.layout, ...customOptions.layout };
        if (customOptions.layout.padding) options.layout.padding = { ...defaultOptions.layout.padding, ...customOptions.layout.padding };
    }
    if (customOptions.fullDescriptions) options.fullDescriptions = customOptions.fullDescriptions;
    if (customOptions.scales) {
        options.scales = { ...defaultOptions.scales, ...customOptions.scales };
        if (customOptions.scales.x) {
            options.scales.x = { ...defaultOptions.scales.x, ...customOptions.scales.x };
            if (customOptions.scales.x.ticks) options.scales.x.ticks = { ...defaultOptions.scales.x.ticks, ...customOptions.scales.x.ticks };
        }
        if (customOptions.scales.y) {
            options.scales.y = { ...defaultOptions.scales.y, ...customOptions.scales.y };
            if (customOptions.scales.y.ticks) options.scales.y.ticks = { ...defaultOptions.scales.y.ticks, ...customOptions.scales.y.ticks };
        }
    }
    if (customOptions.plugins) {
        options.plugins = { ...defaultOptions.plugins, ...customOptions.plugins };
        if (customOptions.plugins.datalabels) options.plugins.datalabels = { ...defaultOptions.plugins.datalabels, ...customOptions.plugins.datalabels };
        if (customOptions.plugins.legend) {
            options.plugins.legend = { ...defaultOptions.plugins.legend, ...customOptions.plugins.legend };
            if (customOptions.plugins.legend.labels) options.plugins.legend.labels = { ...defaultOptions.plugins.legend.labels, ...customOptions.plugins.legend.labels };
        }
        if (customOptions.plugins.tooltip) {
            options.plugins.tooltip = { ...defaultOptions.plugins.tooltip, ...customOptions.plugins.tooltip };
            if (customOptions.plugins.tooltip.callbacks) options.plugins.tooltip.callbacks = { ...defaultOptions.plugins.tooltip.callbacks, ...customOptions.plugins.tooltip.callbacks };
        }
    }

    let finalDatasets = customOptions.datasets || [{
        label: customOptions.datasetLabel || 'Quantité',
        data: data,
        backgroundColor: colors,
        borderColor: type === 'line' ? (Array.isArray(colors) ? colors[0] : colors) : (isDarkMode ? '#0f172a' : '#ffffff'),
        borderWidth: type === 'line' ? 3 : 2,
        fill: type === 'line' ? false : undefined
    }];

    if (type === 'bar' && customOptions.indexAxis === 'y') {
        if (!options.datasets) options.datasets = {};
        if (!options.datasets.bar) options.datasets.bar = {};
        options.datasets.bar.barThickness = 26;
    }

    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: finalDatasets },
        options: options
    });
}

// Las opciones se crean con el DOM para admitir comillas (p. ej. 18") y se conserva la selección actual
function fillFilter(select, placeholder, values, getLabel = (value) => value) {
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '';
    const addOption = (value, label) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    };
    addOption('all', placeholder);
    values.forEach(value => addOption(value, getLabel(value)));
    select.value = values.includes(previousValue) ? previousValue : 'all';
}

// Las listas de cada filtro de Statistiques solo ofrecen lo que existe con los demás filtros puestos.
// La opción ya elegida se conserva siempre, para que quede claro por qué no hay resultados.
export function refreshStatsFilterOptions() {
    if (!ui.elements.filterMonth) return;

    const allRecords = store.getAllRecords();
    const current = currentStatsFilters();
    const pool = (param) => {
        let rows = store.filterRecords(allRecords, { ...current, [param]: 'all' });
        if (param !== 'tache' && current.tache === 'all') rows = rows.filter(r => !isReceptionTask(r.tache));
        return rows;
    };

    const months = unique(pool('month').map(recordMonthKey)).sort().reverse();
    const presetValues = PERIOD_PRESETS.map(item => item.value);
    const monthValues = withSelected(months, presetValues.includes(current.month) ? 'all' : current.month);
    fillFilter(ui.elements.filterMonth, 'Toutes les périodes', [...presetValues, ...monthValues], periodLabel);

    fillFilter(ui.elements.filterEtage, 'Tous les étages',
        withSelected(unique(pool('etage').map(etageGroupKey)).sort(naturalCompare), current.etage));
    fillFilter(ui.elements.filterLocataire, 'Tous les locataires',
        withSelected(unique(pool('locataire').map(r => String(r.locataire ?? '').trim())).sort(), current.locataire));
    fillFilter(ui.elements.filterTache, 'Toutes les interventions',
        withSelected(unique(pool('tache').map(r => r.tache)).sort(), current.tache));
    fillFilter(ui.elements.filterCategorie, 'Toutes les catégories',
        withSelected(unique(pool('categorie').map(r => r.categorie)).sort(), current.categorie));
    fillFilter(ui.elements.filterDescription, 'Toutes les références',
        withSelected(unique(pool('description').map(recordDescription)).sort(), current.description));
}

// Resumen de los filtros puestos: contador en el título y barra fija al bajar por las gráficas
function updateActiveFilters() {
    const active = STATS_FILTERS
        .map(({ element, label }) => ({ control: ui.elements[element], label }))
        .filter(({ control }) => control && control.value !== 'all')
        .map(({ control, label }) => `${label} : ${control.selectedOptions[0] ? control.selectedOptions[0].textContent : control.value}`);

    const count = document.getElementById('filters-count');
    if (count) {
        count.textContent = active.length;
        count.classList.toggle('hidden-field', active.length === 0);
    }

    const bar = document.getElementById('active-filters-bar');
    if (!bar) return;
    bar.classList.toggle('hidden-field', active.length === 0);
    bar.innerHTML = active.length === 0 ? '' : `<span>Filtres actifs :</span>${active.map(text => `<span class="filter-chip">${escapeHtml(text)}</span>`).join('')}<button type="button" data-clear-filters>Réinitialiser</button>`;
}

export function onStatsFiltersChange() {
    refreshStatsFilterOptions();
    updateDashboard();
}

export function resetStatsFilters() {
    STATS_FILTERS.forEach(({ element }) => {
        if (ui.elements[element]) ui.elements[element].value = 'all';
    });
    onStatsFiltersChange();
}

// Sección de filtros plegable (cerrada de inicio en pantallas pequeñas) y botón de la barra de resumen
export function initStatsFilters() {
    const toggle = document.getElementById('btn-toggle-filters');
    const body = document.getElementById('stats-filters-body');
    const chevron = document.getElementById('filters-chevron');
    if (toggle && body) {
        const setOpen = (open) => {
            body.classList.toggle('hidden-field', !open);
            toggle.setAttribute('aria-expanded', String(open));
            if (chevron) chevron.textContent = open ? 'expand_less' : 'expand_more';
        };
        setOpen(!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches));
        toggle.addEventListener('click', () => setOpen(body.classList.contains('hidden-field')));
    }

    const bar = document.getElementById('active-filters-bar');
    if (bar) {
        bar.addEventListener('click', (event) => {
            if (event.target.closest('[data-clear-filters]')) resetStatsFilters();
        });
    }
}

// Lo mismo para Historique: sus listas también se ajustan a los demás filtros puestos
export function refreshHistoryFilterOptions() {
    if (!ui.elements.filterHistoryMonth) return;

    const allRecords = store.getAllRecords();
    const valueOf = (control) => (control ? control.value || 'all' : 'all');
    const current = {
        month: valueOf(ui.elements.filterHistoryMonth),
        etage: valueOf(ui.elements.filterHistoryEtage),
        locataire: valueOf(ui.elements.filterHistoryLocataire),
        tache: valueOf(ui.elements.filterHistoryTache),
        categorie: valueOf(ui.elements.filterHistoryCategorie)
    };
    const pool = (param) => store.filterRecords(allRecords, { ...current, [param]: 'all' });

    fillFilter(ui.elements.filterHistoryMonth, 'Toutes les périodes',
        withSelected(unique(pool('month').map(recordMonthKey)).sort().reverse(), current.month), shortMonthLabel);
    fillFilter(ui.elements.filterHistoryEtage, 'Tous les étages',
        withSelected(unique(pool('etage').map(etageKey)).sort(naturalCompare), current.etage));
    fillFilter(ui.elements.filterHistoryTache, 'Toutes les interventions',
        withSelected(unique(pool('tache').map(r => r.tache)).sort(), current.tache));
    fillFilter(ui.elements.filterHistoryLocataire, 'Tous les locataires',
        withSelected(unique(pool('locataire').map(r => String(r.locataire ?? '').trim())).sort(), current.locataire));
    fillFilter(ui.elements.filterHistoryCategorie, 'Toutes les catégories',
        withSelected(unique(pool('categorie').map(r => r.categorie)).sort(), current.categorie));
}

export function onHistoryFiltersChange() {
    refreshHistoryFilterOptions();
    ui.renderHistory();
}

export function resetHistoryFilters() {
    [
        ui.elements.filterHistoryMonth,
        ui.elements.filterHistoryEtage,
        ui.elements.filterHistoryLocataire,
        ui.elements.filterHistoryTache,
        ui.elements.filterHistoryCategorie
    ].forEach(control => {
        if (control) control.value = 'all';
    });
    if (ui.elements.searchHistory) ui.elements.searchHistory.value = '';
    onHistoryFiltersChange();
}

export function populateFilters() {
    if (!ui.elements.filterMonth) return;
    refreshHistoryFilterOptions();
    refreshStatsFilterOptions();
}

function withSelected(values, selected) {
    return selected !== 'all' && !values.includes(selected) ? [...values, selected] : values;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}
