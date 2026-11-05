// js/audit.js
// Explica de dónde sale el costo de Stats: de qué precio, de qué registros y qué datos parecen raros.
// Son funciones puras para poder probarlas sin navegador.
import { parsePrice, parseRecordDate, localDateString } from './utils.js';

const TOP_LIMIT = 8;
const MISMATCH_LIMIT = 6;
const HIGH_QUANTITY = 50;
// Un precio propio fuera de este rango frente al del catálogo merece revisión
const PRICE_RATIO_MIN = 0.5;
const PRICE_RATIO_MAX = 2;

function describe(record) {
    return record.description || record.id_item || 'Inconnu';
}

function recordDate(record) {
    const value = record.date || record.fecha;
    if (!value) return null;
    const d = parseRecordDate(value);
    return isNaN(d) ? null : d;
}

// Misma fecha, artículo, lugar y cantidad: puede ser un registro repetido
function duplicateKey(record) {
    const d = recordDate(record);
    return [
        d ? localDateString(d) : '',
        record.id_item, record.etage, record.locataire, record.tache,
        record.quantite, record.num_bon, record.num_tache, record.num_soumission
    ].map(value => String(value ?? '').trim().toLowerCase()).join('|');
}

/**
 * @param {object[]} records registros ya filtrados, los que usa Stats
 * @param {(record: object) => number | null} getCatalogPrice precio vigente del catálogo, o null si no hay
 */
export function auditCosts(records, getCatalogPrice) {
    const sources = { own: 0, catalog: 0, missing: 0 };
    const priced = [];
    const mismatches = [];
    const dates = [];
    const duplicateGroups = new Map();
    let totalBulbs = 0;
    let totalCost = 0;
    let highQuantity = 0;
    let maxQuantity = 0;

    records.forEach(record => {
        const quantity = Number(record.quantite || 0);
        const ownPrice = parsePrice(record.prix);
        const catalogPrice = getCatalogPrice(record);

        let unit = 0;
        let source = 'missing';
        if (ownPrice !== null) {
            unit = ownPrice;
            source = 'own';
        } else if (catalogPrice !== null) {
            unit = catalogPrice;
            source = 'catalog';
        }
        sources[source] += 1;

        const cost = quantity * unit;
        totalBulbs += quantity;
        totalCost += cost;
        priced.push({ description: describe(record), id: record.id_item || '', date: recordDate(record), quantity, unit, cost, source });

        if (quantity >= HIGH_QUANTITY) highQuantity += 1;
        maxQuantity = Math.max(maxQuantity, quantity);

        // Precio propio muy distinto del catálogo: puede ser un total de línea, un precio por caja o un error
        if (ownPrice !== null && catalogPrice !== null && catalogPrice > 0) {
            const ratio = ownPrice / catalogPrice;
            if (ratio < PRICE_RATIO_MIN || ratio > PRICE_RATIO_MAX) {
                const looksLikeLineTotal = quantity > 1 && Math.abs(ownPrice - catalogPrice * quantity) <= catalogPrice * 0.01;
                mismatches.push({ description: describe(record), quantity, ownPrice, catalogPrice, ratio, looksLikeLineTotal });
            }
        }

        const d = recordDate(record);
        if (d) dates.push(d);

        const key = duplicateKey(record);
        duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
    });

    dates.sort((a, b) => a - b);
    let possibleDuplicates = 0;
    duplicateGroups.forEach(count => {
        if (count > 1) possibleDuplicates += count - 1;
    });

    return {
        count: records.length,
        firstDate: dates.length ? localDateString(dates[0]) : null,
        lastDate: dates.length ? localDateString(dates[dates.length - 1]) : null,
        totalBulbs,
        totalCost,
        sources,
        top: [...priced].sort((a, b) => b.cost - a.cost).slice(0, TOP_LIMIT),
        mismatchCount: mismatches.length,
        mismatches: mismatches.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, MISMATCH_LIMIT),
        lineTotalCount: mismatches.filter(m => m.looksLikeLineTotal).length,
        highQuantity,
        maxQuantity,
        possibleDuplicates
    };
}
