// js/charts.js
import { getCategoryColor, escapeHtml, parsePrice, recordMonthKey, naturalCompare, weekdayTotals, isReceptionTask, monthlyAverage, monthlyByCategory, monthlyByGroup, referenceKey, locataireKey, etageKey, uniqueDocsByMonth, recordMonths, monthlyReport, monthlySeries } from './utils.js';
import * as store from './store.js';
import * as ui from './ui.js';

let charts = {};
let statsTableSearchQuery = '';
let isStatsTableCollapsed = true;
let lastSelectedEtage = null;

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
function renderMonthlyTrend(el, monthlyTotals, fallbackText) {
    if (!el) return;

    const monthNames = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lastValue = monthlyTotals[toKey(lastMonth)] || 0;
    const previousValue = monthlyTotals[toKey(previousMonth)] || 0;

    if (Object.keys(monthlyTotals).length < 2 || previousValue <= 0) {
        el.className = 'stat-trend neutral';
        el.textContent = fallbackText;
        return;
    }

    const diffPct = Math.round(((lastValue - previousValue) / previousValue) * 100);
    const period = `${monthNames[lastMonth.getMonth()]} vs ${monthNames[previousMonth.getMonth()]}`;
    el.className = `stat-trend ${diffPct > 0 ? 'negative' : diffPct < 0 ? 'positive' : 'neutral'}`;
    el.textContent = `${diffPct > 0 ? '+' : ''}${diffPct}% ${period}`;
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
    const monthNames = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const monthlyLabels = sortedMonths.map(key => {
        const [y, m] = key.split('-');
        return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    });
    const monthlyValues = sortedMonths.map(key => monthlyData[key]);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Azul técnico para el volumen
    const volumeColor = isDarkMode ? '#3b82f6' : '#2563eb';
    const monthlyColors = sortedMonths.map(() => volumeColor);

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
            const etageStr = String(r.etage).trim();
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
        ui.elements.statTotal.textContent = totalBulbs.toLocaleString();
        ui.elements.statTotal.title = totalBulbs.toLocaleString();
    }

    renderMonthlyTrend(document.getElementById('stat-trend-total'), monthlyData, 'Consommation globale');

    // Promedio sobre meses completos, contando también los meses sin registros
    const { average: monthlyAvg, months: averageMonths } = monthlyAverage(monthlyData);
    if (ui.elements.statAvg) {
        const avg = monthlyAvg.toFixed(1);
        ui.elements.statAvg.textContent = avg;
        ui.elements.statAvg.title = avg;
    }
    const trendAvgEl = document.getElementById('stat-trend-avg');
    if (trendAvgEl) {
        trendAvgEl.className = 'stat-trend neutral';
        trendAvgEl.textContent = `Sur ${averageMonths || 1} mois`;
    }

    if (ui.elements.statTopEtage) {
        const etageTxt = sortedEtages.length > 0 ? `Étage ${sortedEtages[0]}` : "-";
        ui.elements.statTopEtage.textContent = etageTxt;
        ui.elements.statTopEtage.title = etageTxt;
    }
    const trendEtageEl = document.getElementById('stat-trend-etage');
    const barEtageEl = document.getElementById('stat-bar-etage');
    if (trendEtageEl) {
        if (sortedEtages.length > 0) {
            const topQty = Object.values(etageBulbsByCategory[sortedEtages[0]]).reduce((s, v) => s + v, 0);
            const etagePct = totalBulbs > 0 ? Math.min(100, Math.round((topQty / totalBulbs) * 100)) : 0;
            trendEtageEl.className = 'stat-trend positive';
            trendEtageEl.textContent = `${topQty} ampoules util. (${etagePct}%)`;
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
        ui.elements.statTopProduct.textContent = topProdCode;
        ui.elements.statTopProduct.title = topProdDesc ? `${topProdCode} - ${topProdDesc}` : topProdCode;
    }
    const trendProductEl = document.getElementById('stat-trend-product');
    const barProductEl = document.getElementById('stat-bar-product');
    if (trendProductEl) {
        if (sortedProducts.length > 0) {
            const topProdQty = sortedProductQuantities[0] || 0;
            const topProdDesc = topProductsFullDesc[0] || "";
            const prodPct = totalBulbs > 0 ? Math.min(100, Math.round((topProdQty / totalBulbs) * 100)) : 0;
            trendProductEl.className = 'stat-trend positive';
            trendProductEl.textContent = topProdDesc ? `${topProdDesc} (${topProdQty} util.)` : `${topProdQty} remplacements (${prodPct}%)`;
            trendProductEl.title = topProdDesc;
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

    const topProductsColors = sortedProducts.map(p => {
        const cat = productCategoryMap[p];
        return cat ? getCategoryColor(cat) : '#cbd5e1';
    });

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
            ui.elements.filterHistoryEtage.value = label || 'all';
        } else if (canvasId === 'taskTypeChart' && ui.elements.filterHistoryTache) {
            ui.elements.filterHistoryTache.value = label || 'all';
        } else if (canvasId === 'locataireChart' && ui.elements.filterHistoryLocataire) {
            ui.elements.filterHistoryLocataire.value = label || 'all';
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
                formatter: (val) => val > 0 ? val : ''
            }
        }
    });

    // Ampoules remplacées de lundi à vendredi: le jour le plus chargé ressort, les autres restent neutres
    const weekdayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const { values: weekdayValues, weekend: weekendTotal } = weekdayTotals(dashboardRecords);
    const weekdayMax = Math.max(...weekdayValues);
    const weekdayColors = weekdayValues.map(v => (weekdayMax > 0 && v === weekdayMax)
        ? volumeColor
        : (isDarkMode ? '#475569' : '#94a3b8'));

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
                formatter: (val) => val > 0 ? val : ''
            }
        }
    });

    renderChart('topProductsChart', 'bar', sortedProducts, sortedProductQuantities, topProductsColors, {
        indexAxis: 'y',
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        fullDescriptions: topProductsFullDesc,
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                onClick: () => {}, 
                labels: {
                    generateLabels: function() {
                        const uniqueCats = new Set();
                        sortedProducts.forEach(p => {
                            if (productCategoryMap[p]) uniqueCats.add(productCategoryMap[p]);
                        });
                        return Array.from(uniqueCats).map((cat, i) => ({
                            text: cat,
                            fillStyle: getCategoryColor(cat),
                            strokeStyle: getCategoryColor(cat),
                            lineWidth: 0,
                            hidden: false,
                            index: i,
                            fontColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#475569'
                        }));
                    }
                }
            },
            tooltip: {
                callbacks: {
                    title: function(context) {
                        return context[0].chart.options.fullDescriptions[context[0].dataIndex] || context[0].label;
                    }
                }
            }
        }
    });

    // Paleta semántica unificada para tipos de tareas
    const taskTypePalette = ['#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

    // Ordenar los datos del gráfico de tipo de tarea de mayor a menor para que los colores se asignen según el tamaño
    const taskTypeKeys = Object.keys(taskTypeData).sort((a, b) => taskTypeData[b] - taskTypeData[a]);
    const taskTypeVals = taskTypeKeys.map(k => taskTypeData[k]);
    const taskTypeDoughnutColors = taskTypeKeys.map((_, i) => taskTypePalette[i % taskTypePalette.length]);

    renderChart('taskTypeChart', 'doughnut', taskTypeKeys, taskTypeVals, taskTypeDoughnutColors, {
        datasetLabel: 'Ampoules',
        onClick: handleChartClick,
        cutout: '45%', 
        layout: { padding: { top: 20, bottom: 20, left: 40, right: 40 } },
        plugins: {
            datalabels: {
                display: 'auto', 
                formatter: (value, context) => {
                    let sum = 0;
                    const dataArr = context.chart.data.datasets[0].data;
                    dataArr.forEach(data => sum += Number(data));
                    if (sum === 0) return '';
                    const percentageValue = (value * 100 / sum);
                    const threshold = window.innerWidth < 480 ? 12 : 6;
                    if (percentageValue < threshold) return '';
                    return `${value}`;
                },
                color: '#ffffff',
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
    const locataireColorsArr = locataireKeys.map((_, i) => i === 0 ? (isDarkMode ? '#60a5fa' : '#2563eb') : (isDarkMode ? '#475569' : '#94a3b8'));

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
                formatter: (val) => val > 0 ? val : ''
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
        colorFor: (name) => taskTypePalette[Math.max(0, taskTypeKeys.indexOf(name)) % taskTypePalette.length],
        textColor,
        onClick: handleChartClick
    });

    // Bons de travail et tournées réalisés par mois: chaque numéro n'est compté qu'une fois
    const docsEvolution = uniqueDocsByMonth(dashboardRecords);
    const docsColors = isDarkMode ? ['#60a5fa', '#fbbf24'] : ['#2563eb', '#d97706'];
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

    // Évolution mensuelle par catégorie: une ligne par catégorie, les mois sans remplacement valent 0
    const categoryEvolution = monthlyByCategory(dashboardRecords, { fillGaps: true });
    renderGroupEvolution('categoryEvolutionChart', categoryEvolution.months, categoryEvolution.categories, categoryEvolution.data, {
        colorFor: (name) => getCategoryColor(name),
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
    renderChart('categoryChart', 'bar', catLabels, catValues, catLabels.map(cat => getCategoryColor(cat)), {
        datasetLabel: 'Ampoules',
        indexAxis: 'y',
        onClick: handleChartClick,
        plugins: { legend: { display: false } }
    });

    const top5Etages = sortedEtages.slice(0, 5);
    const top5EtagesValues = top5Etages.map(et => {
        return Object.values(etageBulbsByCategory[et]).reduce((sum, v) => sum + v, 0);
    });
    // Resaltado Data Storytelling: Piso #1 en ámbar de atención, pisos restantes en tono pizarra neutro
    const topEtagesColors = top5Etages.map((_, i) => i === 0 ? (isDarkMode ? '#f59e0b' : '#d97706') : (isDarkMode ? '#475569' : '#94a3b8'));
    
    renderChart('topEtagesChart', 'bar', top5Etages, top5EtagesValues, topEtagesColors, {
        indexAxis: 'y',
        datasetLabel: 'Ampoules',
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
                formatter: (val) => val > 0 ? val : ''
            }
        }
    });

    renderStatsTable(dashboardRecords);
}
// Gráfica de líneas con un trazo por categoría a lo largo de los meses
function renderGroupEvolution(canvasId, months, groups, data, { colorFor, textColor, onClick }) {
    const monthLabelNames = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const labels = months.map(key => {
        const [y, m] = key.split('-');
        return `${monthLabelNames[parseInt(m, 10) - 1]} ${y}`;
    });

    const datasets = groups.map((group, index) => {
        const color = colorFor(group, index);
        return {
            label: group,
            data: data[group],
            borderColor: color,
            backgroundColor: color,
            fill: false,
            // Monótona: la curva nunca se sale de los valores reales (p. ej. por debajo de 0)
            cubicInterpolationMode: 'monotone',
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    renderChart(canvasId, 'line', labels, [], null, {
        datasets,
        onClick,
        // Al pasar sobre un mes se ven todas las categorías a la vez
        interaction: { mode: 'index', intersect: false },
        scales: {
            y: { beginAtZero: true, grace: '15%' }
        },
        layout: { padding: { top: 20 } },
        plugins: {
            legend: { display: true },
            datalabels: {
                display: 'auto',
                anchor: 'end',
                align: 'top',
                color: (context) => context.dataset.borderColor || textColor,
                font: { weight: 'bold', family: 'Outfit', size: 11 },
                formatter: (value) => value > 0 ? value : ''
            }
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
    const body = rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.total}</td></tr>`).join('');
    return `<h2>${escapeHtml(title)}</h2><table><thead><tr><th>${escapeHtml(firstColumn)}</th><th>${escapeHtml(secondColumn)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

function buildReportHtml(report) {
    const generated = new Date().toLocaleDateString('fr-CA');
    const summary = `<table><tbody>
        <tr><td>Ampoules remplacées</td><td>${report.total}</td></tr>
        <tr><td>Bons de travail</td><td>${report.bons}</td></tr>
        <tr><td>Tournées</td><td>${report.tournees}</td></tr>
        <tr><td>Lignes enregistrées</td><td>${report.lines}</td></tr></tbody></table>`;
    const etages = report.etages.slice(0, 5).map(item => ({ name: `Étage ${item.name}`, total: item.total }));
    return `<h1>Rapport mensuel — ${escapeHtml(reportMonthLabel(report.month))}</h1>
        ${report.lines === 0 ? '<p>Aucun enregistrement pour ce mois.</p>' : summary
            + reportTable('Étages les plus actifs', etages, 'Étage')
            + reportTable('Articles les plus remplacés', report.references.slice(0, 5), 'Article')
            + reportTable('Par catégorie', report.categories, 'Catégorie')
            + reportTable('Par locataire', report.locataires.slice(0, 5), 'Locataire')}
        <p class="report-footer">Généré le ${escapeHtml(generated)} — Lightman</p>`;
}

export function printMonthlyReport() {
    const select = document.getElementById('report-month');
    const container = document.getElementById('print-report');
    if (!select || !container || !select.value) {
        ui.showToast("Aucun mois à imprimer.", "warning");
        return;
    }

    container.innerHTML = buildReportHtml(monthlyReport(reportRecords(), select.value));
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
        const key = etageKey(record);
        if (!key) return;
        const entry = byKey.get(key) || { key, label: `Étage ${key}`, total: 0 };
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
    getKey: etageKey,
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
    const lineColors = isDarkMode ? ['#60a5fa', '#fbbf24'] : ['#2563eb', '#d97706'];

    const selected = [a, b].filter(Boolean);
    const { months, series } = monthlySeries(records, selected, config.getKey);
    const labelOf = (key) => (entries.find(entry => entry.key === key) || { label: key }).label;
    const monthNamesShort = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const labels = months.map(key => {
        const [y, m] = key.split('-');
        return `${monthNamesShort[parseInt(m, 10) - 1]} ${y}`;
    });

    const datasets = selected.map((key, index) => ({
        label: labelOf(key),
        data: series[key],
        borderColor: lineColors[index],
        backgroundColor: lineColors[index],
        fill: false,
        // Monótona: la curva nunca se sale de los valores reales (p. ej. por debajo de 0)
        cubicInterpolationMode: 'monotone',
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6
    }));

    renderChart(config.canvasId, 'line', labels, [], null, {
        datasets,
        // Al pasar sobre un mes se ven las dos líneas a la vez
        interaction: { mode: 'index', intersect: false },
        scales: {
            y: { beginAtZero: true, grace: '15%' }
        },
        layout: { padding: { top: 20 } },
        plugins: {
            legend: { display: true },
            datalabels: {
                display: 'auto',
                anchor: 'end',
                align: 'top',
                color: (context) => context.dataset.borderColor || textColor,
                font: { weight: 'bold', family: 'Outfit', size: 11 },
                formatter: (value) => value > 0 ? value : ''
            }
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
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                    
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
                formatter: (value) => value > 0 ? value : ''
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
            line: { tension: 0.4, borderWidth: 3 }
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
        withSelected(unique(pool('etage').map(etageKey)).sort(naturalCompare), current.etage));
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

export function updateStatsTableCollapseUI() {
    const bodyContainer = document.getElementById('stats-table-body-container');
    const icon = document.getElementById('icon-toggle-stats-table');
    const toggleText = document.getElementById('text-toggle-stats-table');
    const toggleBtn = document.getElementById('btn-toggle-stats-table');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!isStatsTableCollapsed));

    if (!bodyContainer) return;

    if (isStatsTableCollapsed) {
        bodyContainer.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (toggleText) toggleText.textContent = 'Afficher';
    } else {
        bodyContainer.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (toggleText) toggleText.textContent = 'Masquer';
    }
}

export function initStatsTableListeners() {
    const searchInput = document.getElementById('search-stats-table');
    const headerEl = document.getElementById('stats-table-header');
    const toggleBtn = document.getElementById('btn-toggle-stats-table');

    const toggleCollapse = () => {
        isStatsTableCollapsed = !isStatsTableCollapsed;
        updateStatsTableCollapseUI();
    };

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse();
        });
    }

    if (headerEl) {
        headerEl.addEventListener('click', (e) => {
            if (e.target.closest('#search-stats-table') || e.target.closest('#btn-toggle-stats-table')) return;
            toggleCollapse();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            statsTableSearchQuery = e.target.value.toLowerCase().trim();
            if (isStatsTableCollapsed && statsTableSearchQuery) {
                isStatsTableCollapsed = false;
                updateStatsTableCollapseUI();
            }
            const records = getFilteredRecords();
            renderStatsTable(records);
        });
    }
}

export function renderStatsTable(dashboardRecords) {
    const tableBody = document.getElementById('stats-table-body');
    if (!tableBody) return;

    const selectedEtage = ui.elements.filterEtage ? ui.elements.filterEtage.value : 'all';

    // Desplegar automáticamente si se selecciona un piso específico
    if (selectedEtage !== 'all' && lastSelectedEtage !== selectedEtage) {
        isStatsTableCollapsed = false;
        lastSelectedEtage = selectedEtage;
    } else if (selectedEtage === 'all' && lastSelectedEtage !== 'all' && lastSelectedEtage !== null) {
        lastSelectedEtage = 'all';
    }

    updateStatsTableCollapseUI();

    // Agrupar dashboardRecords por Description
    const descMap = {};

    dashboardRecords.forEach(r => {
        const idKey = r.id_item || "Inconnu";
        const foundOpt = store.appOptions.opciones.find(opt => opt.id === idKey);
        const desc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || idKey);
        const qty = Number(r.quantite || 0);

        if (!descMap[desc]) {
            descMap[desc] = 0;
        }
        descMap[desc] += qty;
    });

    let list = Object.keys(descMap).map(desc => ({
        description: desc,
        quantite: descMap[desc]
    }));

    if (statsTableSearchQuery) {
        list = list.filter(item => String(item.description).toLowerCase().includes(statsTableSearchQuery));
    }

    // Ordenar de mayor a menor cantidad
    list.sort((a, b) => b.quantite - a.quantite);

    if (list.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="2" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <span aria-hidden="true" class="material-symbols-rounded" style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;">inventory_2</span>
                    Aucune donnée disponible pour ces filtres.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    list.forEach(item => {
        html += `
            <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.15s ease;">
                <td style="padding: 0.75rem 1rem; vertical-align: middle; font-weight: 600; color: var(--text-primary);">
                    ${escapeHtml(item.description)}
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; text-align: right; font-size: 1.05rem; font-weight: 700; color: var(--primary);">
                    ${item.quantite}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}
