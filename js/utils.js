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

// Admite números y textos como "4,50" o "4.50 $"; devuelve null si no hay un precio válido
export function parsePrice(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (value === undefined || value === null) return null;
    const cleaned = String(value).replace(/[\s $]/g, '').replace(',', '.');
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
