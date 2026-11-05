// js/utils.js

export const catPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

export function getCategoryColor(categoryName) {
    if (!categoryName) return '#cbd5e1';
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
        hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return catPalette[Math.abs(hash) % catPalette.length];
}

// [FIX L-3] UUID generado con la API criptográfica del navegador (no Math.random)
export function generateUUID() {
    if (crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback seguro para navegadores sin crypto.randomUUID
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40; // version 4
    arr[8] = (arr[8] & 0x3f) | 0x80; // variant RFC 4122
    return [...arr].map((b, i) =>
        ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')
    ).join('');
}

// Escapa texto para insertarlo en HTML, tanto en contenido como en atributos
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

// Fecha local en formato YYYY-MM-DD (valueAsDate y toISOString usan UTC y adelantan el día por la noche)
export function localDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// new Date('YYYY-MM-DD') se interpreta en UTC y cae en el día anterior en América; aquí se lee como fecha local
export function parseRecordDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(value);
}

// Clave AAAA-MM del mes de un registro; null si la fecha no es válida
export function recordMonthKey(record) {
    const value = record.date || record.fecha;
    if (!value) return null;
    const d = parseRecordDate(value);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Cantidad reemplazada por día de la semana. values va de lunes (0) a viernes (4);
// weekend suma lo registrado en sábado y domingo, que la gráfica de lunes a viernes no muestra
export function weekdayTotals(records) {
    const values = [0, 0, 0, 0, 0];
    let weekend = 0;
    records.forEach(record => {
        const value = record.date || record.fecha;
        if (!value) return;
        const d = parseRecordDate(value);
        if (isNaN(d)) return;
        const qty = Number(record.quantite || 0);
        const day = d.getDay(); // 0 = domingo ... 6 = sábado
        if (day >= 1 && day <= 5) {
            values[day - 1] += qty;
        } else {
            weekend += qty;
        }
    });
    return { values, weekend };
}

// Cantidad reemplazada por mes para cada grupo (categoría, locatario…), lista para una gráfica.
// groups va del grupo más usado al menos usado; data[grupo][i] corresponde a months[i].
export function monthlyByGroup(records, getGroup, { fillGaps = false } = {}) {
    const totals = {};
    const groupTotals = {};
    records.forEach(record => {
        const month = recordMonthKey(record);
        if (!month) return;
        const group = getGroup(record);
        const qty = Number(record.quantite || 0);
        totals[month] = totals[month] || {};
        totals[month][group] = (totals[month][group] || 0) + qty;
        groupTotals[group] = (groupTotals[group] || 0) + qty;
    });

    let months = Object.keys(totals).sort();
    // En una gráfica de líneas los meses sin registros deben aparecer, en 0, para no falsear la escala del tiempo
    if (fillGaps && months.length > 0) months = monthRange(months[0], months[months.length - 1]);
    const groups = Object.keys(groupTotals)
        .sort((a, b) => groupTotals[b] - groupTotals[a] || a.localeCompare(b, 'fr'));
    const data = {};
    groups.forEach(group => {
        data[group] = months.map(month => (totals[month] && totals[month][group]) || 0);
    });
    return { months, groups, data };
}

// Lo mismo por categoría de material; los registros sin categoría van a "Inconnu"
export function monthlyByCategory(records, options) {
    const { months, groups, data } = monthlyByGroup(
        records,
        record => String(record.categorie ?? '').trim() || 'Inconnu',
        options
    );
    return { months, categories: groups, data };
}

// Identifica la referencia de un registro: su ID y, si no lo tiene, su descripción
export function referenceKey(record) {
    return String(record.id_item ?? '').trim() || String(record.description ?? '').trim() || 'Inconnu';
}

// Identifica el locatario de un registro; los que no tienen uno se agrupan como "Non assigné"
export function locataireKey(record) {
    return String(record.locataire ?? '').trim() || 'Non assigné';
}

// Identifica el piso de un registro; vacío si no tiene uno
export function etageKey(record) {
    return String(record.etage ?? '').trim();
}

export const DOC_LABELS = { bon: 'Bon de travail', tournee: 'Tournée', soumission: 'Soumission' };

// Tipo y número del bon, la tournée o la soumission de un registro; null si la tarea no lleva número.
// Algunas hojas antiguas guardan el número en otra columna: se usa la propia y, si está vacía, cualquier otra.
export function docReference(record) {
    const task = String(record.tache ?? '').trim().toLowerCase();
    let kind = null;
    if (task.includes('bon') || task.includes('travail') || task.includes('trabajo')) {
        kind = 'bon';
    } else if (task.includes('soumission')) {
        kind = 'soumission';
    } else if (task.includes('tourn') || task.includes('ronde')) {
        kind = 'tournee';
    }
    if (!kind) return null;
    const own = { bon: record.num_bon, tournee: record.num_tache, soumission: record.num_soumission }[kind];
    const number = String(own || record.num_bon || record.num_tache || record.num_soumission || '').trim();
    return { kind, number };
}

// Bon de travail y tournées distintos por mes. Cada bon o tournée genera varias filas (una por
// material), así que se cuenta cada número una sola vez dentro del mes. Las filas sin número no se pueden
// distinguir y no cuentan (se devuelven en withoutNumber). Devuelve los meses seguidos, con 0 donde no hubo ninguno.
export function uniqueDocsByMonth(records) {
    const seen = { bon: {}, tournee: {} };
    let withoutNumber = 0;
    records.forEach(record => {
        const doc = docReference(record);
        const month = recordMonthKey(record);
        if (!doc || doc.kind === 'soumission' || !month) return;
        if (!doc.number) {
            withoutNumber += 1;
            return;
        }
        seen[doc.kind][month] = seen[doc.kind][month] || new Set();
        seen[doc.kind][month].add(doc.number.toLowerCase());
    });

    const keys = [...Object.keys(seen.bon), ...Object.keys(seen.tournee)].sort();
    const months = keys.length > 0 ? monthRange(keys[0], keys[keys.length - 1]) : [];
    const countsFor = (kind) => months.map(month => (seen[kind][month] ? seen[kind][month].size : 0));
    const bon = countsFor('bon');
    const tournee = countsFor('tournee');
    const sum = (values) => values.reduce((total, value) => total + value, 0);
    return { months, bon, tournee, totalBon: sum(bon), totalTournee: sum(tournee), withoutNumber };
}

export function recordDay(record) {
    const raw = record.date || record.fecha;
    if (!raw) return '';
    const date = parseRecordDate(raw);
    return isNaN(date) ? '' : localDateString(date);
}

// Ordena los registros del historial: 'date-desc' (por defecto), 'date-asc' o 'qty-desc'
export function sortRecords(records, mode = 'date-desc') {
    const time = (record) => {
        const value = parseRecordDate(record.fecha || record.date || 0).getTime();
        return isNaN(value) ? 0 : value;
    };
    const qty = (record) => Number(record.quantite || 0);
    const compare = {
        'date-asc': (a, b) => time(a) - time(b),
        'qty-desc': (a, b) => qty(b) - qty(a) || time(b) - time(a)
    }[mode] || ((a, b) => time(b) - time(a));
    return [...records].sort(compare);
}

// Junta las líneas de un mismo bon, tournée o soumission en la misma fecha. Lo que no tiene número, o
// tiene una sola línea, queda como línea suelta. Conserva el orden en que aparece cada visita.
export function groupHistory(records) {
    const items = [];
    const groups = new Map();
    records.forEach(record => {
        const qty = Number(record.quantite || 0);
        const doc = docReference(record);
        if (!doc || !doc.number) {
            items.push({ type: 'single', record, total: qty });
            return;
        }
        const day = recordDay(record);
        const key = `${day}|${doc.kind}|${doc.number.toLowerCase()}`;
        let group = groups.get(key);
        if (!group) {
            group = { type: 'group', key, kind: doc.kind, number: doc.number, day, lines: [], total: 0 };
            groups.set(key, group);
            items.push(group);
        }
        group.lines.push(record);
        group.total += qty;
    });

    return items.map(item => {
        if (item.type !== 'group') return item;
        if (item.lines.length === 1) return { type: 'single', record: item.lines[0], total: item.total };
        const unique = (values) => [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
        return {
            ...item,
            etages: unique(item.lines.map(line => line.etage)).sort(naturalCompare),
            locataires: unique(item.lines.map(line => line.locataire)).sort()
        };
    });
}

// Lo ya anotado para el bon, la tournée o la soumission que se está escribiendo (mismo número y mismo día).
// probe lleva lo que hay en el formulario: tache, num_bon, num_tache, num_soumission y date.
export function visitSummary(records, probe) {
    const doc = docReference(probe);
    const day = recordDay({ fecha: probe.date });
    if (!doc || !doc.number || !day) return null;
    const wanted = doc.number.toLowerCase();
    const summary = { kind: doc.kind, number: doc.number, lines: 0, bulbs: 0 };
    records.forEach(record => {
        const other = docReference(record);
        if (other && other.kind === doc.kind && other.number.toLowerCase() === wanted && recordDay(record) === day) {
            summary.lines += 1;
            summary.bulbs += Number(record.quantite || 0);
        }
    });
    return summary;
}

// Artículos distintos de los últimos registros (el más reciente primero), para repetirlos con un toque
export function recentReferences(history, limit = 5) {
    const seen = new Set();
    const result = [];
    for (const record of history) {
        const id = String(record.id_item ?? '').trim();
        const description = String(record.description ?? '').trim();
        if (!id && !description) continue;
        const key = id || description.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ id, description, categorie: String(record.categorie ?? '').trim() });
        if (result.length >= limit) break;
    }
    return result;
}

// Con el orden por cantidad, cada visita compite con su total y no con su línea más grande
export function orderHistoryItems(items, mode) {
    return mode === 'qty-desc' ? [...items].sort((a, b) => b.total - a.total) : items;
}

// Cifras del resultado del historial: líneas, ampolletas y bons o tournées distintos
export function historyTotals(records) {
    const docs = uniqueDocsByMonth(records);
    return {
        lines: records.length,
        bulbs: records.reduce((sum, record) => sum + Number(record.quantite || 0), 0),
        bons: docs.totalBon,
        tournees: docs.totalTournee
    };
}

const CSV_HEADERS = ['Date', 'Type de tâche', 'Tournée', 'Bon de travail', 'Soumission', 'Locataire', 'Étage', 'Catégorie', 'Description', 'Quantité', 'Id', 'Note'];

// Una celda que empieza con = + - @ se abriría como fórmula en Excel; en los textos libres se antepone un apóstrofo.
// Étage y los números se dejan intactos (un piso puede ser "-1").
function csvCell(value, freeText) {
    let text = String(value ?? '');
    const risky = freeText ? /^[=+\-@\t\r]/ : /^[=@]/;
    if (risky.test(text)) text = `'${text}`;
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Texto CSV (separador ;, como espera Excel en francés) de los registros indicados
export function recordsToCsv(records, describe = (record) => record.description) {
    const freeTextColumns = new Set([1, 5, 7, 8, 11]);
    const rows = records.map(record => [
        recordDay(record), record.tache, record.num_tache, record.num_bon, record.num_soumission,
        record.locataire, record.etage, record.categorie, describe(record), Number(record.quantite || 0),
        record.id_item, record.note
    ]);
    return [CSV_HEADERS, ...rows]
        .map((row, rowIndex) => row.map((cell, index) => csvCell(cell, rowIndex > 0 && freeTextColumns.has(index))).join(';'))
        .join('\r\n');
}

// Nombre legible de la referencia: la descripción, o su identificador si no la tiene
export function referenceLabel(record) {
    return String(record.description ?? '').trim() || referenceKey(record);
}

// Meses con registros, del más reciente al más antiguo
export function recordMonths(records) {
    const months = new Set();
    records.forEach(record => {
        const key = recordMonthKey(record);
        if (key) months.add(key);
    });
    return [...months].sort().reverse();
}

// Reincidencias: la misma referencia vuelve a cambiarse en el mismo piso dentro de maxDays de la visita
// anterior. Una visita es una fecha distinta, así que varias filas del mismo día no cuentan como repetición.
export function recurrences(records, maxDays = 90) {
    const groups = new Map();
    records.forEach(record => {
        const etage = etageKey(record);
        const raw = record.date || record.fecha;
        if (!etage || !raw) return;
        const date = parseRecordDate(raw);
        if (isNaN(date)) return;
        const reference = referenceKey(record);
        const key = `${etage}|${reference}`;
        const entry = groups.get(key) || { etage, reference, label: referenceLabel(record), days: new Set(), quantity: 0 };
        entry.days.add(localDateString(date));
        entry.quantity += Number(record.quantite || 0);
        groups.set(key, entry);
    });

    const result = [];
    groups.forEach(entry => {
        const days = [...entry.days].sort();
        let repeats = 0;
        for (let i = 1; i < days.length; i += 1) {
            const gap = Math.round((parseRecordDate(days[i]) - parseRecordDate(days[i - 1])) / 86400000);
            if (gap <= maxDays) repeats += 1;
        }
        if (repeats > 0) {
            result.push({
                etage: entry.etage,
                reference: entry.reference,
                label: entry.label,
                visits: days.length,
                repeats,
                last: days[days.length - 1],
                quantity: entry.quantity
            });
        }
    });
    return result.sort((a, b) =>
        b.repeats - a.repeats || b.visits - a.visits || naturalCompare(a.etage, b.etage) || a.label.localeCompare(b.label, 'fr'));
}

function rankBy(records, getName) {
    const totals = {};
    records.forEach(record => {
        const name = getName(record);
        totals[name] = (totals[name] || 0) + Number(record.quantite || 0);
    });
    return Object.keys(totals)
        .map(name => ({ name, total: totals[name] }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'));
}

// Resumen de un mes para el reporte imprimible; las listas van de mayor a menor
export function monthlyReport(records, monthKey) {
    const inMonth = records.filter(record => recordMonthKey(record) === monthKey);
    const docs = uniqueDocsByMonth(inMonth);
    return {
        month: monthKey,
        total: inMonth.reduce((sum, record) => sum + Number(record.quantite || 0), 0),
        lines: inMonth.length,
        bons: docs.totalBon,
        tournees: docs.totalTournee,
        etages: rankBy(inMonth.filter(record => etageKey(record)), etageKey),
        references: rankBy(inMonth, referenceLabel),
        categories: rankBy(inMonth, record => String(record.categorie ?? '').trim() || 'Inconnu'),
        locataires: rankBy(inMonth, locataireKey)
    };
}

// Meses seguidos desde el primero hasta el último, incluidos los que no tienen registros
export function monthRange(firstKey, lastKey) {
    const months = [];
    for (let index = monthIndex(firstKey); index <= monthIndex(lastKey); index += 1) {
        months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
    }
    return months;
}

// Cantidad por mes de las referencias elegidas. El eje cubre todo el período de los registros,
// con los meses seguidos y en 0 donde la referencia no tuvo reemplazos.
export function monthlySeries(records, selectedKeys, getKey = referenceKey) {
    const wanted = new Set(selectedKeys);
    const totals = {};
    let first = null;
    let last = null;
    records.forEach(record => {
        const month = recordMonthKey(record);
        if (!month) return;
        if (first === null || month < first) first = month;
        if (last === null || month > last) last = month;

        const key = getKey(record);
        if (!wanted.has(key)) return;
        totals[key] = totals[key] || {};
        totals[key][month] = (totals[key][month] || 0) + Number(record.quantite || 0);
    });

    const months = first === null ? [] : monthRange(first, last);
    const series = {};
    selectedKeys.forEach(key => {
        series[key] = months.map(month => (totals[key] && totals[key][month]) || 0);
    });
    return { months, series };
}

// Las recepciones de material son entradas de stock, no reemplazos: no cuentan como consumo
export function isReceptionTask(task) {
    return /r[eé]ception/i.test(String(task ?? ''));
}

function monthIndex(key) {
    const [year, month] = key.split('-').map(Number);
    return year * 12 + (month - 1);
}

// Períodos de las estadísticas: 'all', 'last-N' (los N últimos meses, incluido el actual),
// 'year' (el año en curso) o un mes concreto AAAA-MM
export function monthInPeriod(monthKey, period, now = new Date()) {
    if (!period || period === 'all') return true;
    if (!monthKey) return false;
    const last = /^last-(\d+)$/.exec(period);
    if (last) {
        const current = now.getFullYear() * 12 + now.getMonth();
        const index = monthIndex(monthKey);
        return index > current - Number(last[1]) && index <= current;
    }
    if (period === 'year') return monthKey.startsWith(`${now.getFullYear()}-`);
    return monthKey === period;
}

// Promedio mensual sobre meses completos del calendario, incluidos los meses sin registros.
// El mes en curso se deja fuera mientras existan meses anteriores, porque aún está a medias.
export function monthlyAverage(monthlyTotals, now = new Date()) {
    let keys = Object.keys(monthlyTotals).sort();
    if (keys.length === 0) return { average: 0, months: 0 };

    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (keys.length > 1 && keys.includes(currentKey)) {
        keys = keys.filter(key => key !== currentKey);
    }

    const months = monthIndex(keys[keys.length - 1]) - monthIndex(keys[0]) + 1;
    const total = keys.reduce((sum, key) => sum + monthlyTotals[key], 0);
    return { average: total / months, months };
}

// Admite números y textos como "4,50" o "4.50 $"; devuelve null si no hay un precio válido
export function parsePrice(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (value === undefined || value === null) return null;
    const cleaned = String(value).replace(/[\s$]/g, '').replace(',', '.');
    if (cleaned === '') return null;
    const parsed = Number(cleaned);
    return isNaN(parsed) ? null : parsed;
}

// Orden natural: 1, 2, 10, 16A, RDC
export function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}

// [FIX M-4] Retrasa la ejecución de una función hasta que el usuario deja de actuar
export function debounce(fn, delay = 250) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
