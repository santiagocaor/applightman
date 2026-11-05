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
    recordMonthKey,
    weekdayTotals
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

test('weekdayTotals suma por día de lunes a viernes', () => {
    const { values, weekend } = weekdayTotals([
        { fecha: '2026-11-02', quantite: 3 }, // lunes
        { fecha: '2026-11-02', quantite: 2 }, // lunes
        { fecha: '2026-11-04', quantite: 4 }, // miércoles
        { fecha: '2026-11-06', quantite: 1 }  // viernes
    ]);
    assert.deepEqual(values, [5, 0, 4, 0, 1]);
    assert.equal(weekend, 0);
});

test('weekdayTotals separa el fin de semana en lugar de mezclarlo', () => {
    const { values, weekend } = weekdayTotals([
        { fecha: '2026-11-07', quantite: 6 }, // sábado
        { fecha: '2026-11-08', quantite: 2 }, // domingo
        { fecha: '2026-11-09', quantite: 1 }  // lunes
    ]);
    assert.deepEqual(values, [1, 0, 0, 0, 0]);
    assert.equal(weekend, 8);
});

test('weekdayTotals no corre un día las fechas de Google Sheets', () => {
    // Un lunes a las 00:00 en Montreal llega como 04:00 UTC; en UTC caería en domingo
    const { values } = weekdayTotals([{ date: '2026-11-02T05:00:00.000Z', quantite: 7 }]);
    assert.deepEqual(values, [7, 0, 0, 0, 0]);
});

test('weekdayTotals ignora registros sin fecha válida y cantidades vacías', () => {
    const { values, weekend } = weekdayTotals([
        { quantite: 5 },
        { fecha: 'no es fecha', quantite: 5 },
        { fecha: '2026-11-03' }
    ]);
    assert.deepEqual(values, [0, 0, 0, 0, 0]);
    assert.equal(weekend, 0);
});
