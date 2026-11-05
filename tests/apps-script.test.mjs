// Ejecuta apps-script/google_script.js contra una hoja simulada, sin tocar Google
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../apps-script/google_script.js', import.meta.url), 'utf8');

class FakeSheet {
    constructor(name, rows = []) {
        this.name = name;
        this.rows = rows;
        this.writes = [];
    }
    getName() { return this.name; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
    appendRow(row) { this.rows.push([...row]); }
    deleteRow(index) { this.rows.splice(index - 1, 1); }
    insertColumnAfter() {}
    getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
    getRange(row, col, numRows = 1, numCols = 1) {
        const sheet = this;
        return {
            getFormula() {
                const value = (sheet.rows[row - 1] || [])[col - 1];
                return typeof value === 'string' && value.startsWith('=') ? value : '';
            },
            getValues() {
                return Array.from({ length: numRows }, (_, r) =>
                    Array.from({ length: numCols }, (_, c) => (sheet.rows[row - 1 + r] || [])[col - 1 + c] ?? ''));
            },
            setValues(values) {
                sheet.writes.push({ col, numCols });
                values.forEach((line, r) => {
                    sheet.rows[row - 1 + r] = sheet.rows[row - 1 + r] || [];
                    line.forEach((value, c) => { sheet.rows[row - 1 + r][col - 1 + c] = value; });
                });
            },
            setValue(value) {
                sheet.writes.push({ col, numCols: 1 });
                sheet.rows[row - 1] = sheet.rows[row - 1] || [];
                sheet.rows[row - 1][col - 1] = value;
            }
        };
    }
}

const HEADERS = ['Date', 'Type de tâche', 'Tournée', 'Bon de travail', 'Soumission', 'Locataire', 'Étage', 'Catégorie', 'Description', 'Quantité', 'Id', 'Prix', 'Note', 'UUID'];
const col = (name) => HEADERS.indexOf(name);
const row = (uuid, prix = '=VLOOKUP(K2)') => ['2026-08-01', 'Tournée', '1', '', '', 'L', 3, 'Cat', 'Desc', 2, 'A1', prix, 'n', uuid];

function setup(records = [], token = null) {
    const sheets = {
        Registros: new FakeSheet('Registros', [HEADERS, ...records]),
        Opciones: new FakeSheet('Opciones', [['Id', 'Description', 'Catégorie', 'Prix', 'Stock'], ['A1', 'Desc', 'Cat', 5, 10]]),
        'Étages': new FakeSheet('Étages', [['Étages'], [1]]),
        'Tâches': new FakeSheet('Tâches', [['Tâches'], ['Tournée']]),
        Locataire: new FakeSheet('Locataire', [['Locataire'], ['L']])
    };
    const lock = {
        taken: 0,
        released: 0,
        held: false,
        waitLock() { this.taken += 1; this.held = true; },
        tryLock() { this.taken += 1; this.held = true; return true; },
        hasLock() { return this.held; },
        releaseLock() { this.released += 1; this.held = false; }
    };
    let generated = 0;
    const context = vm.createContext({
        SpreadsheetApp: {
            getActiveSpreadsheet: () => ({
                getSheetByName: (name) => sheets[name] || null,
                getSheets: () => Object.values(sheets),
                insertSheet: (name) => (sheets[name] = new FakeSheet(name))
            })
        },
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => token }) },
        LockService: { getScriptLock: () => lock },
        Utilities: { getUuid: () => `gen-${++generated}` },
        ContentService: {
            MimeType: { JSON: 'json' },
            createTextOutput: (text) => ({ text, setMimeType() { return this; } })
        },
        Logger: { log() {} }
    });
    vm.runInContext(code, context);
    return {
        sheets,
        lock,
        post: (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text),
        get: (action = 'getData') => JSON.parse(context.doGet({ parameter: { action } }).text)
    };
}

test('agregar escribe la fila, evita duplicados y usa el bloqueo', () => {
    const s = setup();
    const record = { uuid: 'u1', fecha: '2026-08-01', id_item: 'A1', description: 'D', categorie: 'C', quantite: 2, etage: '3', tache: 'Tournée' };
    assert.equal(s.post({ action: 'addRecordsBatch', records: [record] }).status, 'success');
    assert.equal(s.post({ action: 'addRecordsBatch', records: [record] }).status, 'success');
    assert.equal(s.sheets.Registros.rows.length, 2);
    assert.equal(s.lock.taken, 2);
    assert.equal(s.lock.released, 2);
});

test('editar cambia las columnas de la app y no toca Prix ni fórmulas', () => {
    const s = setup([row('u1')]);
    const result = s.post({ action: 'editRecord', uuid: 'u1', record: { fecha: '2026-09-02', quantite: 5, etage: '7', note: '' } });
    assert.equal(result.status, 'success');
    const line = s.sheets.Registros.rows[1];
    assert.equal(line[col('Prix')], '=VLOOKUP(K2)');
    assert.equal(line[col('Date')], '2026-09-02');
    assert.equal(line[col('Quantité')], 5);
    assert.equal(line[col('Note')], '');
    assert.equal(line[col('UUID')], 'u1');
    assert.ok(!s.sheets.Registros.writes.some(w => w.col === col('Prix') + 1));
});

test('agregar guarda el precio del registro', () => {
    const s = setup();
    const record = { uuid: 'u1', fecha: '2026-08-01', id_item: 'A1', quantite: 1, prix: 4.5 };
    s.post({ action: 'addRecordsBatch', records: [record] });
    assert.equal(s.sheets.Registros.rows[1][col('Prix')], 4.5);
});

test('agregar crea la columna Prix si la hoja no la tiene', () => {
    const s = setup();
    s.sheets.Registros.rows = [HEADERS.filter(h => h !== 'Prix')];
    s.post({ action: 'addRecordsBatch', records: [{ uuid: 'u1', quantite: 1, prix: 7 }] });
    const headers = s.sheets.Registros.rows[0];
    assert.equal(headers.at(-1), 'Prix');
    assert.equal(s.sheets.Registros.rows[1][headers.indexOf('Prix')], 7);
});

test('agregar no rompe una columna Prix con ARRAYFORMULA', () => {
    const s = setup([row('u1', '=ARRAYFORMULA(VLOOKUP(K2:K))')]);
    s.post({ action: 'addRecordsBatch', records: [{ uuid: 'u2', quantite: 1, prix: 7 }] });
    assert.equal(s.sheets.Registros.rows[2][col('Prix')], '');
});

test('editar guarda el precio nuevo si la celda no tiene fórmula', () => {
    const s = setup([row('u1', 3)]);
    s.post({ action: 'editRecord', uuid: 'u1', record: { quantite: 1, prix: 9 } });
    assert.equal(s.sheets.Registros.rows[1][col('Prix')], 9);
});

test('editar sin precio conserva el que había', () => {
    const s = setup([row('u1', 3)]);
    s.post({ action: 'editRecord', uuid: 'u1', record: { quantite: 1, prix: '' } });
    assert.equal(s.sheets.Registros.rows[1][col('Prix')], 3);
});

test('editar con precio nunca reemplaza una fórmula', () => {
    const s = setup([row('u1')]);
    s.post({ action: 'editRecord', uuid: 'u1', record: { quantite: 1, prix: 9 } });
    assert.equal(s.sheets.Registros.rows[1][col('Prix')], '=VLOOKUP(K2)');
});

test('un UUID inexistente da error y libera el bloqueo', () => {
    const s = setup([row('u1')]);
    assert.equal(s.post({ action: 'editRecord', uuid: 'x', record: {} }).status, 'error');
    assert.equal(s.post({ action: 'deleteRecord', uuid: 'x' }).status, 'error');
    assert.equal(s.lock.held, false);
    assert.equal(s.sheets.Registros.rows.length, 2);
});

test('borrar elimina solo la fila indicada', () => {
    const s = setup([row('u1'), row('u2')]);
    assert.equal(s.post({ action: 'deleteRecord', uuid: 'u1' }).status, 'success');
    assert.deepEqual(s.sheets.Registros.rows.slice(1).map(r => r[col('UUID')]), ['u2']);
});

test('una acción desconocida responde con un error legible', () => {
    const s = setup();
    assert.equal(s.post({ action: 'nada' }).status, 'error');
    assert.equal(s.get('nada').status, 'error');
});

test('leer datos sin token devuelve registros recientes primero y el total', () => {
    const s = setup([row('u1'), row('u2')]);
    const result = s.get();
    assert.equal(result.status, 'success');
    assert.equal(result.totalRecords, 2);
    assert.equal(result.records[0].uuid, 'u2');
    assert.equal(result.options.opciones[0].id, 'A1');
});

test('leer no escribe nada si todas las filas tienen UUID', () => {
    const s = setup([row('u1')]);
    s.get();
    assert.equal(s.sheets.Registros.writes.length, 0);
});

test('los UUID que faltan se escriben solo en su columna', () => {
    const s = setup([row(''), row('u2')]);
    const result = s.get();
    assert.ok(result.records.some(r => r.uuid === 'gen-1'));
    assert.equal(s.sheets.Registros.rows[1][col('Prix')], '=VLOOKUP(K2)');
    assert.ok(s.sheets.Registros.writes.every(w => w.col === col('UUID') + 1 && w.numCols === 1));
    assert.equal(s.lock.held, false);
});

test('por encima del límite se avisa del total real', () => {
    const many = Array.from({ length: 5003 }, (_, i) => row(`u${i}`, 1));
    const result = setup(many).get();
    assert.equal(result.records.length, 5000);
    assert.equal(result.totalRecords, 5003);
    assert.equal(result.records[0].uuid, 'u5002');
});

test('con token configurado se rechaza todo lo que no lo trae', () => {
    const s = setup([row('u1')], 'secreto');
    assert.equal(s.get().status, 'error');
    assert.equal(s.post({ action: 'getData' }).status, 'error');
    assert.equal(s.post({ action: 'getData', token: 'malo' }).status, 'error');
    assert.equal(s.post({ action: 'deleteRecord', uuid: 'u1' }).status, 'error');
    assert.equal(s.sheets.Registros.rows.length, 2);
});

test('con el token correcto se puede leer y escribir', () => {
    const s = setup([row('u1')], 'secreto');
    assert.equal(s.post({ action: 'getData', token: 'secreto' }).status, 'success');
    assert.equal(s.post({ action: 'deleteRecord', uuid: 'u1', token: 'secreto' }).status, 'success');
    assert.equal(s.sheets.Registros.rows.length, 1);
});
