process.env.TZ = 'America/Toronto';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCosts } from '../js/audit.js';
import { isReceptionTask, monthlyAverage } from '../js/utils.js';

// Catálogo simulado: A1 cuesta 5 $, A2 cuesta 10 $
const CATALOG = { A1: 5, A2: 10 };
const catalogPrice = (record) => CATALOG[record.id_item] ?? null;
const rec = (over = {}) => ({
    uuid: Math.random().toString(36),
    fecha: '2026-08-03',
    id_item: 'A1',
    description: 'Ampoule A1',
    quantite: 2,
    etage: '3',
    locataire: 'L',
    tache: 'Tournée',
    ...over
});

test('el costo usa el precio del registro y, si no hay, el del catálogo', () => {
    const audit = auditCosts([rec({ prix: 4 }), rec({ id_item: 'A2' })], catalogPrice);
    assert.equal(audit.totalCost, 2 * 4 + 2 * 10);
    assert.deepEqual(audit.sources, { own: 1, catalog: 1, missing: 0 });
});

test('un registro sin ningún precio cuenta 0 y se informa aparte', () => {
    const audit = auditCosts([rec({ id_item: 'Z9' })], catalogPrice);
    assert.equal(audit.totalCost, 0);
    assert.equal(audit.sources.missing, 1);
});

test('un precio de registro de 0 no se reemplaza por el del catálogo', () => {
    assert.equal(auditCosts([rec({ prix: 0 })], catalogPrice).totalCost, 0);
});

test('detecta un precio de registro que es el total de la línea', () => {
    // 6 ampollas de 5 $ con "Prix" = 30 $: cada una se estaría contando a 30 $
    const audit = auditCosts([rec({ quantite: 6, prix: 30 })], catalogPrice);
    assert.equal(audit.totalCost, 6 * 30);
    assert.equal(audit.mismatchCount, 1);
    assert.equal(audit.lineTotalCount, 1);
    assert.equal(audit.mismatches[0].catalogPrice, 5);
});

test('un precio razonablemente cercano al catálogo no se marca', () => {
    const audit = auditCosts([rec({ prix: 6 }), rec({ prix: 4 })], catalogPrice);
    assert.equal(audit.mismatchCount, 0);
});

test('acepta precios con coma y símbolo de dólar', () => {
    assert.equal(auditCosts([rec({ prix: '4,50 $' })], catalogPrice).totalCost, 2 * 4.5);
});

test('lista los registros más costosos de mayor a menor', () => {
    const audit = auditCosts([rec({ quantite: 1 }), rec({ quantite: 9, id_item: 'A2' }), rec({ quantite: 3 })], catalogPrice);
    assert.deepEqual(audit.top.map(item => item.cost), [90, 15, 5]);
});

test('informa el rango de fechas con fechas locales', () => {
    const audit = auditCosts([rec({ fecha: '2026-09-15' }), rec({ fecha: '2026-08-01' }), rec({ date: '2026-10-02T04:00:00.000Z', fecha: undefined })], catalogPrice);
    assert.equal(audit.firstDate, '2026-08-01');
    assert.equal(audit.lastDate, '2026-10-02');
});

test('marca cantidades grandes y posibles duplicados', () => {
    const audit = auditCosts([rec({ quantite: 80 }), rec(), rec(), rec({ etage: '4' })], catalogPrice);
    assert.equal(audit.highQuantity, 1);
    assert.equal(audit.maxQuantity, 80);
    assert.equal(audit.possibleDuplicates, 1);
});

test('sin registros no falla', () => {
    const audit = auditCosts([], catalogPrice);
    assert.equal(audit.count, 0);
    assert.equal(audit.totalCost, 0);
    assert.equal(audit.firstDate, null);
});

test('isReceptionTask reconoce las recepciones con y sin acento', () => {
    assert.equal(isReceptionTask('Réception de matériel'), true);
    assert.equal(isReceptionTask('reception'), true);
    assert.equal(isReceptionTask('Tournée'), false);
    assert.equal(isReceptionTask(undefined), false);
});

test('el promedio mensual cuenta los meses sin registros', () => {
    const now = new Date(2026, 5, 15);
    const { average, months } = monthlyAverage({ '2026-01': 30, '2026-03': 30 }, now);
    assert.equal(months, 3);
    assert.equal(average, 20);
});

test('el promedio mensual deja fuera el mes en curso, que está a medias', () => {
    const now = new Date(2026, 10, 5);
    const { average, months } = monthlyAverage({ '2026-09': 30, '2026-10': 30, '2026-11': 2 }, now);
    assert.equal(months, 2);
    assert.equal(average, 30);
});

test('si solo hay datos del mes en curso, se usa ese mes', () => {
    const now = new Date(2026, 10, 5);
    assert.deepEqual(monthlyAverage({ '2026-11': 7 }, now), { average: 7, months: 1 });
});

test('el promedio mensual sin datos es cero', () => {
    assert.deepEqual(monthlyAverage({}), { average: 0, months: 0 });
});

test('el promedio mensual cruza el cambio de año', () => {
    const now = new Date(2027, 5, 1);
    const { average, months } = monthlyAverage({ '2026-11': 10, '2027-01': 20 }, now);
    assert.equal(months, 3);
    assert.equal(average, 10);
});
