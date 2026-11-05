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

// Bon de travail y tournées distintos por mes. Cada bon o tournée genera varias filas (una por
// material), así que se cuenta cada número una sola vez dentro del mes. Las filas sin número no se pueden
// distinguir y no cuentan. Devuelve los meses seguidos, con 0 donde no hubo ninguno.
export function uniqueDocsByMonth(records) {
    const seen = { bon: {}, tournee: {} };
    records.forEach(record => {
        const task = String(record.tache ?? '').trim().toLowerCase();
        let kind = null;
        let number = '';
        if (task.includes('bon') || task.includes('travail') || task.includes('trabajo')) {
            kind = 'bon';
            number = record.num_bon;
        } else if (task.includes('tourn') || task.includes('ronde')) {
            kind = 'tournee';
            number = record.num_tache;
        }
        const month = recordMonthKey(record);
        const id = String(number ?? '').trim().toLowerCase();
        if (!kind || !month || !id) return;
        seen[kind][month] = seen[kind][month] || new Set();
        seen[kind][month].add(id);
    });

    const keys = [...Object.keys(seen.bon), ...Object.keys(seen.tournee)].sort();
    const months = keys.length > 0 ? monthRange(keys[0], keys[keys.length - 1]) : [];
    const countsFor = (kind) => months.map(month => (seen[kind][month] ? seen[kind][month].size : 0));
    const bon = countsFor('bon');
    const tournee = countsFor('tournee');
    const sum = (values) => values.reduce((total, value) => total + value, 0);
    return { months, bon, tournee, totalBon: sum(bon), totalTournee: sum(tournee) };
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
