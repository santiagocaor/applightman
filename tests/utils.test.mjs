// Las fechas se prueban en la zona horaria de Montreal, donde ocurrían los errores
process.env.TZ = 'America/Toronto';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    isReceptionTask,
    localDateString,
    monthlyAverage,
    monthRange,
    monthlyByCategory,
    monthlySeries,
    naturalCompare,
    parsePrice,
    parseRecordDate,
    recordMonthKey,
    referenceKey,
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

test('isReceptionTask reconoce las recepciones con y sin acento', () => {
    assert.equal(isReceptionTask('Réception de matériel'), true);
    assert.equal(isReceptionTask('reception'), true);
    assert.equal(isReceptionTask('Tournée'), false);
    assert.equal(isReceptionTask(undefined), false);
});

test('el promedio mensual cuenta los meses sin registros', () => {
    const { average, months } = monthlyAverage({ '2026-01': 30, '2026-03': 30 }, new Date(2026, 5, 15));
    assert.equal(months, 3);
    assert.equal(average, 20);
});

test('el promedio mensual deja fuera el mes en curso, que está a medias', () => {
    const { average, months } = monthlyAverage({ '2026-09': 30, '2026-10': 30, '2026-11': 2 }, new Date(2026, 10, 5));
    assert.equal(months, 2);
    assert.equal(average, 30);
});

test('si solo hay datos del mes en curso, se usa ese mes', () => {
    assert.deepEqual(monthlyAverage({ '2026-11': 7 }, new Date(2026, 10, 5)), { average: 7, months: 1 });
});

test('el promedio mensual sin datos es cero', () => {
    assert.deepEqual(monthlyAverage({}), { average: 0, months: 0 });
});

test('el promedio mensual cruza el cambio de año', () => {
    const { average, months } = monthlyAverage({ '2026-11': 10, '2027-01': 20 }, new Date(2027, 5, 1));
    assert.equal(months, 3);
    assert.equal(average, 10);
});

test('monthlyByCategory suma por mes y categoría', () => {
    const { months, categories, data } = monthlyByCategory([
        { fecha: '2026-08-03', categorie: 'LED', quantite: 4 },
        { fecha: '2026-08-20', categorie: 'LED', quantite: 1 },
        { fecha: '2026-08-21', categorie: 'Fluo', quantite: 2 },
        { fecha: '2026-10-05', categorie: 'LED', quantite: 6 }
    ]);
    assert.deepEqual(months, ['2026-08', '2026-10']);
    assert.deepEqual(categories, ['LED', 'Fluo']);
    assert.deepEqual(data, { LED: [5, 6], Fluo: [2, 0] });
});

test('monthlyByCategory ordena las categorías de la más a la menos usada', () => {
    const { categories } = monthlyByCategory([
        { fecha: '2026-08-03', categorie: 'A', quantite: 1 },
        { fecha: '2026-08-03', categorie: 'B', quantite: 9 },
        { fecha: '2026-09-03', categorie: 'C', quantite: 5 }
    ]);
    assert.deepEqual(categories, ['B', 'C', 'A']);
});

test('monthlyByCategory agrupa lo que no tiene categoría y usa el mes local', () => {
    const { months, data } = monthlyByCategory([
        { date: '2026-08-01T04:00:00.000Z', quantite: 3 },
        { fecha: '2026-08-02', categorie: '  ', quantite: 2 }
    ]);
    assert.deepEqual(months, ['2026-08']);
    assert.deepEqual(data, { Inconnu: [5] });
});

test('monthlyByCategory ignora registros sin fecha válida y no falla sin datos', () => {
    assert.deepEqual(monthlyByCategory([{ categorie: 'A', quantite: 5 }, { fecha: 'no', categorie: 'A', quantite: 1 }]),
        { months: [], categories: [], data: {} });
    assert.deepEqual(monthlyByCategory([]), { months: [], categories: [], data: {} });
});

test('referenceKey usa el ID y, si no hay, la descripción', () => {
    assert.equal(referenceKey({ id_item: ' FL-12 ', description: 'F32T8' }), 'FL-12');
    assert.equal(referenceKey({ id_item: '', description: 'F32T8/930' }), 'F32T8/930');
    assert.equal(referenceKey({ id_item: 801014 }), '801014');
    assert.equal(referenceKey({}), 'Inconnu');
});

test('monthRange incluye los meses intermedios y cruza el cambio de año', () => {
    assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
    assert.deepEqual(monthRange('2026-08', '2026-08'), ['2026-08']);
});

test('monthlySeries devuelve una línea por referencia con los meses vacíos en 0', () => {
    const { months, series } = monthlySeries([
        { fecha: '2026-07-06', id_item: 'A', quantite: 4 },
        { fecha: '2026-07-20', id_item: 'A', quantite: 2 },
        { fecha: '2026-07-21', id_item: 'B', quantite: 1 },
        { fecha: '2026-09-08', id_item: 'B', quantite: 7 },
        { fecha: '2026-09-09', id_item: 'C', quantite: 50 }
    ], ['A', 'B']);
    assert.deepEqual(months, ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(series, { A: [6, 0, 0], B: [1, 0, 7] });
});

test('monthlySeries cubre todo el período aunque la referencia solo aparezca un mes', () => {
    const { months, series } = monthlySeries([
        { fecha: '2026-01-10', id_item: 'X', quantite: 9 },
        { fecha: '2026-04-10', id_item: 'A', quantite: 3 }
    ], ['A']);
    assert.deepEqual(months, ['2026-01', '2026-02', '2026-03', '2026-04']);
    assert.deepEqual(series.A, [0, 0, 0, 3]);
});

test('monthlySeries usa meses locales y distingue referencias por ID', () => {
    // 2026-08-01 a las 04:00Z es 1 de agosto a medianoche en Montreal, no julio
    const { months, series } = monthlySeries([
        { date: '2026-08-01T04:00:00.000Z', id_item: 'A', description: 'Misma descripción', quantite: 5 },
        { date: '2026-08-02T04:00:00.000Z', id_item: 'B', description: 'Misma descripción', quantite: 8 }
    ], ['A', 'B']);
    assert.deepEqual(months, ['2026-08']);
    assert.deepEqual(series, { A: [5], B: [8] });
});

test('monthlySeries ignora registros sin fecha válida y no falla sin datos', () => {
    assert.deepEqual(monthlySeries([{ id_item: 'A', quantite: 5 }, { fecha: 'no', id_item: 'A', quantite: 1 }], ['A']),
        { months: [], series: { A: [] } });
    assert.deepEqual(monthlySeries([], []), { months: [], series: {} });
});
