// js/charts.js
import { getCategoryColor, escapeHtml, parsePrice, recordMonthKey, naturalCompare, weekdayTotals, isReceptionTask, monthlyAverage } from './utils.js';
import { auditCosts } from './audit.js';
import * as store from './store.js';
import * as ui from './ui.js';

let charts = {};
let statsTableSearchQuery = '';
let isStatsTableCollapsed = true;
let lastSelectedEtage = null;

// [FIX M-7] Usa la función centralizada de filtrado de store.js en lugar de duplicar la lógica
export function getFilteredRecords() {
    const allRecords = store.getAllRecords();
    if (!ui.elements.filterMonth) return allRecords;

    const tVal = ui.elements.filterTache ? ui.elements.filterTache.value : 'all';

    let filtered = store.filterRecords(allRecords, {
        month: ui.elements.filterMonth ? ui.elements.filterMonth.value : 'all',
        etage: ui.elements.filterEtage ? ui.elements.filterEtage.value : 'all',
        locataire: ui.elements.filterLocataire ? ui.elements.filterLocataire.value : 'all',
        tache: tVal,
        categorie: ui.elements.filterCategorie ? ui.elements.filterCategorie.value : 'all',
        description: ui.elements.filterDescription ? ui.elements.filterDescription.value : 'all'
    });

    // Excluir registros de "Réception de matériel" solo cuando no hay filtro de tarea activo
    // (comportamiento específico de Estadísticas para no distorsionar los datos)
    if (tVal === 'all') {
        filtered = filtered.filter(r => !isReceptionTask(r.tache));
    }

    return filtered;
}

// Devuelve el precio unitario o null si el registro no tiene un precio válido.
// El ID manda: la descripción solo se usa si el ID no existe, porque dos artículos pueden compartirla.
function resolveUnitPrice(r) {
    const ownPrice = parsePrice(r.prix);
    if (ownPrice !== null) return ownPrice;
    return getCatalogPrice(r);
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

export function getRecordUnitPrice(r) {
    return resolveUnitPrice(r) ?? 0;
}

// Compara el último mes completo con el anterior: el mes en curso aún no es comparable.
// Más consumo o gasto se muestra en rojo y menos en verde.
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

function renderDataNotice(missingPriceCount) {
    const notice = ui.elements.statsDataNotice;
    if (!notice) return;

    const messages = [];
    const { loaded, total } = store.dataInfo || {};
    if (total > loaded) {
        messages.push(`Seuls les ${loaded.toLocaleString('fr-CA')} enregistrements les plus récents sur ${total.toLocaleString('fr-CA')} sont pris en compte.`);
    }
    if (missingPriceCount > 0) {
        messages.push(`${missingPriceCount} enregistrement${missingPriceCount > 1 ? 's' : ''} sans prix valide : le coût total est sous-estimé.`);
    }
    notice.textContent = messages.join(' ');
    notice.classList.toggle('hidden-field', messages.length === 0);
}

export function updateDashboard() {
    const dashboardRecords = getFilteredRecords();

    // Calcular totales de bombillas y precio
    const totalBulbs = dashboardRecords.reduce((sum, r) => sum + Number(r.quantite || 0), 0);
    renderDataNotice(dashboardRecords.filter(r => resolveUnitPrice(r) === null).length);
    const totalPrice = dashboardRecords.reduce((sum, r) => {
        const qty = Number(r.quantite || 0);
        const unitPrice = getRecordUnitPrice(r);
        return sum + (qty * unitPrice);
    }, 0);
    
    // 1.5 Ampoules changées par mois y Total Prix par mois
    const monthlyData = {};
    const monthlyPriceData = {};
    dashboardRecords.forEach(r => {
        const key = recordMonthKey(r);
        if (!key) return;
        const qty = Number(r.quantite || 0);
        monthlyData[key] = (monthlyData[key] || 0) + qty;

        const unitPrice = getRecordUnitPrice(r);
        monthlyPriceData[key] = (monthlyPriceData[key] || 0) + (qty * unitPrice);
    });
    const sortedMonths = Object.keys(monthlyData).sort();
    const monthNames = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const monthlyLabels = sortedMonths.map(key => {
        const [y, m] = key.split('-');
        return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    });
    const monthlyValues = sortedMonths.map(key => monthlyData[key]);
    const monthlyPriceValues = sortedMonths.map(key => parseFloat((monthlyPriceData[key] || 0).toFixed(2)));

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Paleta semántica: Azul Técnico para volumen, Teal Financiero para costos
    const volumeColor = isDarkMode ? '#3b82f6' : '#2563eb';
    const costColor = isDarkMode ? '#14b8a6' : '#0d9488';
    const monthlyColors = sortedMonths.map(() => volumeColor);
    const monthlyPriceColors = sortedMonths.map(() => costColor);

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

    if (ui.elements.statPrice) {
        const formattedPrice = totalPrice.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
        ui.elements.statPrice.textContent = formattedPrice;
        ui.elements.statPrice.title = formattedPrice;
    }

    renderMonthlyTrend(document.getElementById('stat-trend-price'), monthlyPriceData, 'Coût total estimé');

    const avgUnitPrice = totalBulbs > 0 ? (totalPrice / totalBulbs) : 0;
    if (ui.elements.statUnitAvg) {
        const formattedUnitAvg = avgUnitPrice.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
        ui.elements.statUnitAvg.textContent = formattedUnitAvg;
        ui.elements.statUnitAvg.title = `${formattedUnitAvg} / unité`;
    }
    const trendUnitAvgEl = document.getElementById('stat-trend-unit-avg');
    if (trendUnitAvgEl) {
        trendUnitAvgEl.className = 'stat-trend neutral';
        trendUnitAvgEl.textContent = 'Moyenne / ampoule';
    }

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

        if ((canvasId === 'monthlyBulbsChart' || canvasId === 'monthlyCostChart' || canvasId === 'taskTypeEvolutionChart') && ui.elements.filterHistoryMonth) {
            ui.elements.filterHistoryMonth.value = sortedMonths[index] || 'all';
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

    renderChart('monthlyCostChart', 'bar', monthlyLabels, monthlyPriceValues, monthlyPriceColors, {
        datasetLabel: 'Coût total ($)',
        onClick: handleChartClick,
        scales: {
            y: { 
                grace: '18%',
                ticks: {
                    callback: function(value) {
                        return value + ' $';
                    }
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                        return ` Total: ${Number(val).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
                    }
                }
            },
            datalabels: {
                anchor: 'end',
                align: 'top',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 12 },
                formatter: (val) => val > 0 ? `${Number(val).toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} $` : ''
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

    const monthlyTaskTypeData = {};
    sortedMonths.forEach(m => monthlyTaskTypeData[m] = {});

    dashboardRecords.forEach(r => {
        const key = recordMonthKey(r);
        if (key && r.tache && monthlyTaskTypeData[key]) {
            monthlyTaskTypeData[key][r.tache] = (monthlyTaskTypeData[key][r.tache] || 0) + Number(r.quantite || 0);
        }
    });

    const taskTypeEvolutionDatasets = taskTypeKeys.map((tache, index) => {
        const color = taskTypePalette[index % taskTypePalette.length];
        return {
            label: tache,
            data: sortedMonths.map(month => monthlyTaskTypeData[month][tache] || 0),
            borderColor: color,
            backgroundColor: color + '33', // 33 for some transparency in area fill
            fill: true,
            tension: 0.4 // Smooth lines
        };
    });

    renderChart('taskTypeEvolutionChart', 'line', monthlyLabels, [], null, {
        datasets: taskTypeEvolutionDatasets,
        onClick: handleChartClick,
        scales: {
            y: { grace: '15%' }
        },
        layout: {
            padding: { top: 20 }
        },
        plugins: {
            legend: { display: true },
            datalabels: {
                display: 'auto',
                align: 'top',
                anchor: 'center',
                color: textColor,
                font: { weight: 'bold', family: 'Outfit', size: 11 },
                formatter: (value) => value > 0 ? value : ''
            }
        }
    });

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
    renderCostAudit(dashboardRecords);
}

const money = (value) => Number(value).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';

// Panel "Contrôle des coûts": muestra con qué datos y precios se calcula el costo total
function renderCostAudit(records) {
    const body = document.getElementById('cost-audit-body');
    if (!body) return;

    const audit = auditCosts(records, getCatalogPrice);
    const { loaded, total } = store.dataInfo || {};
    const cell = 'padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--border-color);';
    const sourceLabel = { own: 'Prix du registre', catalog: 'Catalogue', missing: 'Aucun prix' };

    const lines = [
        `<strong>${audit.count.toLocaleString('fr-CA')}</strong> enregistrements pris en compte` +
            (audit.firstDate ? `, du ${escapeHtml(audit.firstDate)} au ${escapeHtml(audit.lastDate)}` : '') + '.',
        `<strong>${audit.totalBulbs.toLocaleString('fr-CA')}</strong> ampoules pour <strong>${money(audit.totalCost)}</strong>.`,
        `Origine du prix : ${audit.sources.own} du registre, ${audit.sources.catalog} du catalogue, ${audit.sources.missing} sans prix.`
    ];
    if (total > loaded) lines.push(`La feuille contient ${total.toLocaleString('fr-CA')} enregistrements ; seuls les ${loaded.toLocaleString('fr-CA')} plus récents sont chargés.`);

    const warnings = [];
    if (audit.mismatchCount > 0) {
        const intro = audit.mismatchCount > 1
            ? `${audit.mismatchCount} enregistrements ont un prix très différent du catalogue.`
            : '1 enregistrement a un prix très différent du catalogue.';
        const lineTotalNote = audit.lineTotalCount > 0
            ? ` ${audit.lineTotalCount} semble${audit.lineTotalCount > 1 ? 'nt' : ''} être le total de la ligne et non le prix unitaire.`
            : '';
        warnings.push(intro + lineTotalNote);
    }
    if (audit.highQuantity > 0) warnings.push(`${audit.highQuantity} enregistrement${audit.highQuantity > 1 ? 's' : ''} avec 50 ampoules ou plus (maximum : ${audit.maxQuantity}).`);
    if (audit.possibleDuplicates > 0) warnings.push(`${audit.possibleDuplicates} doublon${audit.possibleDuplicates > 1 ? 's' : ''} possible${audit.possibleDuplicates > 1 ? 's' : ''} (même date, article, lieu et quantité).`);

    const topRows = audit.top.map(item => `
        <tr>
            <td style="${cell}">${escapeHtml(item.description)}</td>
            <td style="${cell} text-align: right; white-space: nowrap;">${item.quantity} × ${money(item.unit)}</td>
            <td style="${cell} text-align: right; white-space: nowrap; font-weight: 700;">${money(item.cost)}</td>
            <td style="${cell} white-space: nowrap;">${sourceLabel[item.source]}</td>
        </tr>`).join('');

    const mismatchRows = audit.mismatches.map(item => `
        <tr>
            <td style="${cell}">${escapeHtml(item.description)}</td>
            <td style="${cell} text-align: right; white-space: nowrap;">${item.quantity}</td>
            <td style="${cell} text-align: right; white-space: nowrap;">${money(item.ownPrice)}</td>
            <td style="${cell} text-align: right; white-space: nowrap;">${money(item.catalogPrice)}</td>
        </tr>`).join('');

    const th = 'padding: 0.45rem 0.6rem; text-align: left; font-size: 0.72rem; text-transform: uppercase; color: var(--text-secondary);';
    body.innerHTML = `
        <ul class="cost-audit-list">${lines.map(line => `<li>${line}</li>`).join('')}</ul>
        ${warnings.length ? `<ul class="cost-audit-list cost-audit-warnings">${warnings.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
        ${topRows ? `
        <h4 class="cost-audit-title">Enregistrements les plus coûteux</h4>
        <div class="cost-audit-scroll"><table class="cost-audit-table"><thead><tr>
            <th style="${th}">Description</th><th style="${th} text-align: right;">Calcul</th><th style="${th} text-align: right;">Coût</th><th style="${th}">Prix</th>
        </tr></thead><tbody>${topRows}</tbody></table></div>` : ''}
        ${mismatchRows ? `
        <h4 class="cost-audit-title">Prix du registre très différent du catalogue</h4>
        <div class="cost-audit-scroll"><table class="cost-audit-table"><thead><tr>
            <th style="${th}">Description</th><th style="${th} text-align: right;">Qté</th><th style="${th} text-align: right;">Registre</th><th style="${th} text-align: right;">Catalogue</th>
        </tr></thead><tbody>${mismatchRows}</tbody></table></div>` : ''}
    `;
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

export function populateFilters() {
    if (!ui.elements.filterMonth) return;

    const allRecords = store.getAllRecords();

    const months = new Set();
    allRecords.forEach(r => {
        const key = recordMonthKey(r);
        if (key) months.add(key);
    });
    const sortedMonths = Array.from(months).sort().reverse();
    const monthNames = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
    const monthLabel = (key) => {
        const [y, m] = key.split('-');
        return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    };
    fillFilter(ui.elements.filterMonth, 'Toutes les périodes', sortedMonths, monthLabel);
    fillFilter(ui.elements.filterHistoryMonth, 'Toutes les périodes', sortedMonths, monthLabel);

    const etages = new Set();
    allRecords.forEach(r => {
        if (r.etage !== undefined && r.etage !== null && r.etage !== "") {
            etages.add(String(r.etage).trim());
        }
    });
    const sortedEtages = Array.from(etages).sort(naturalCompare);
    fillFilter(ui.elements.filterEtage, 'Tous les étages', sortedEtages);
    fillFilter(ui.elements.filterHistoryEtage, 'Tous les étages', sortedEtages);

    const taches = new Set();
    allRecords.forEach(r => {
        if (r.tache) taches.add(r.tache);
    });
    const sortedTaches = Array.from(taches).sort();
    fillFilter(ui.elements.filterTache, 'Toutes les interventions', sortedTaches);
    fillFilter(ui.elements.filterHistoryTache, 'Toutes les interventions', sortedTaches);

    const locataires = new Set(store.appOptions.locataire || []);
    allRecords.forEach(r => {
        if (r.locataire) locataires.add(String(r.locataire).trim());
    });
    const sortedLocataires = Array.from(locataires).filter(Boolean).sort();
    fillFilter(ui.elements.filterLocataire, 'Tous les locataires', sortedLocataires);
    fillFilter(ui.elements.filterHistoryLocataire, 'Tous les locataires', sortedLocataires);

    const categories = new Set();
    const descriptions = new Set();
    allRecords.forEach(r => {
        if (r.categorie) categories.add(r.categorie);
        const idKey = r.id_item || "Inconnu";
        const foundOpt = store.appOptions.opciones.find(opt => opt.id === idKey);
        const desc = (foundOpt && foundOpt.description) ? foundOpt.description : (r.description || idKey);
        if (desc) descriptions.add(desc);
    });
    const sortedCategories = Array.from(categories).sort();
    fillFilter(ui.elements.filterHistoryCategorie, 'Toutes les catégories', sortedCategories);
    fillFilter(ui.elements.filterCategorie, 'Toutes les catégories', sortedCategories);
    fillFilter(ui.elements.filterDescription, 'Toutes les références', Array.from(descriptions).sort());
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
