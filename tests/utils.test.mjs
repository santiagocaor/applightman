// Las fechas se prueban en la zona horaria de Montreal, donde ocurrían los errores
process.env.TZ = 'America/Toronto';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    localDateString,
    naturalCompare,
    parsePrice,
    parseRecordDate,
    recordMonthKey
} from '../js/utils.js';

test('la zona horaria de prueba reproduce el problema de new Date()', () => {
    assert.equal(new Date('2026-08-01').getDate(), 31);
});

test('parseRecordDate lee YYYY-MM-DD como fecha local', () => {
    const d = parseRecordDate('2026-08-01');
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 7, 1]);
});

test('parseRecordDate también lee fechas completas de Google Sheets', () => {
    const d = parseRecordDate('2026-08-01T04:00:00.000Z');
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 7, 1]);
});

test('localDateString no adelanta el día por la noche', () => {
    assert.equal(localDateString(new Date('2026-11-04T21:30:00-05:00')), '2026-11-04');
});

test('recordMonthKey usa el mes local y prefiere date sobre fecha', () => {
    assert.equal(recordMonthKey({ fecha: '2026-08-01' }), '2026-08');
    assert.equal(recordMonthKey({ date: '2026-09-15', fecha: '2026-08-01' }), '2026-09');
});

test('recordMonthKey devuelve null sin fecha válida', () => {
    assert.equal(recordMonthKey({}), null);
    assert.equal(recordMonthKey({ date: 'no es fecha' }), null);
});

test('parsePrice admite números, coma decimal y símbolo de dólar', () => {
    assert.equal(parsePrice(4.5), 4.5);
    assert.equal(parsePrice('4,50'), 4.5);
    assert.equal(parsePrice('4.50 $'), 4.5);
    assert.equal(parsePrice(0), 0);
});

test('parsePrice devuelve null si no hay un precio válido', () => {
    for (const value of ['', '   ', 'abc', null, undefined, NaN, Infinity]) {
        assert.equal(parsePrice(value), null, String(value));
    }
});

test('escapeHtml neutraliza contenido y atributos', () => {
    assert.equal(
        escapeHtml(`<img src=x onerror="a('b')">&`),
        '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;'
    );
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(0), '0');
});

test('naturalCompare ordena los pisos como una persona', () => {
    const floors = ['RDC', '10', '2', '16A', '1', '16'].sort(naturalCompare);
    assert.deepEqual(floors, ['1', '2', '10', '16', '16A', 'RDC']);
});
