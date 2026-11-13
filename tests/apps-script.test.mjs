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

function setup(records = [], token = null, timeZone = 'America/Toronto') {
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
                getSpreadsheetTimeZone: () => timeZone,
                getSheetByName: (name) => sheets[name] || null,
                getSheets: () => Object.values(sheets),
                insertSheet: (name) => (sheets[name] = new FakeSheet(name))
            })
        },
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => token }) },
        LockService: { getScriptLock: () => lock },
        Utilities: {
            getUuid: () => `gen-${++generated}`,
            // Igual que Apps Script para el formato 'yyyy-MM-dd': el día en la zona indicada
            formatDate: (date, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
        },
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

test('getData ya no envía el inventario que la app no usa', () => {
    const s = setup([row('u1')]);
    const result = s.get();
    assert.equal(result.status, 'success');
    assert.equal(result.options.inventory, undefined);
    assert.equal(result.options.opciones.length, 1);
});

function backupContext(existing = []) {
    const files = existing.map(([name, created]) => ({ name, created, trashed: false }));
    const wrap = (file) => ({
        getName: () => file.name,
        getDateCreated: () => ({ getTime: () => file.created }),
        setTrashed: (value) => { file.trashed = value; }
    });
    const folder = {
        getFiles: () => {
            let index = 0;
            const visible = files.filter(file => !file.trashed);
            return { hasNext: () => index < visible.length, next: () => wrap(visible[index++]) };
        }
    };
    let clock = 1000;
    const context = vm.createContext({
        SpreadsheetApp: { getActiveSpreadsheet: () => ({ getName: () => 'Lightman', getId: () => 'sheet-id' }) },
        DriveApp: {
            getFoldersByName: () => ({ hasNext: () => true, next: () => folder }),
            getFileById: () => ({
                makeCopy: (name) => { files.push({ name, created: (clock += 1), trashed: false }); }
            })
        },
        Utilities: { formatDate: () => '2026-11-09 03-00' },
        Session: { getScriptTimeZone: () => 'America/Toronto' }
    });
    vm.runInContext(code, context);
    return { files, run: () => context.backupSpreadsheet(), context };
}

test('backupsToTrash deja las copias más recientes y no falla con pocas', () => {
    const { context } = backupContext();
    const items = [{ created: 1 }, { created: 5 }, { created: 3 }];
    assert.deepEqual(JSON.parse(JSON.stringify(context.backupsToTrash(items, 2))), [{ created: 1 }]);
    assert.deepEqual(JSON.parse(JSON.stringify(context.backupsToTrash(items, 8))), []);
});

test('la copia semanal crea una copia nueva y manda a la papelera solo las más antiguas propias', () => {
    const old = Array.from({ length: 8 }, (_, i) => [`Lightman - copie 2026-0${i + 1}`, i + 1]);
    const { files, run } = backupContext([...old, ['Otro archivo.pdf', 0]]);
    run();
    const trashed = files.filter(file => file.trashed).map(file => file.name);
    assert.deepEqual(trashed, ['Lightman - copie 2026-01']);
    assert.ok(files.some(file => file.name === 'Lightman - copie 2026-11-09 03-00'));
    assert.equal(files.find(file => file.name === 'Otro archivo.pdf').trashed, false);
});

test('las celdas de fecha se envían como AAAA-MM-DD en la zona horaria de la hoja', () => {
    const dated = (uuid, date) => { const r = row(uuid); r[col('Date')] = date; return r; };
    // Medianoche del 1 de octubre en la zona de cada hoja
    const montreal = setup([dated('u1', new Date('2026-10-01T04:00:00Z')), dated('u2', '2026-10-02')]);
    assert.deepEqual(montreal.get().records.map(r => r.date), ['2026-10-02', '2026-10-01']);
    const paris = setup([dated('u1', new Date('2026-09-30T22:00:00Z'))], null, 'Europe/Paris');
    assert.equal(paris.get().records[0].date, '2026-10-01');
});

test('syncNotes crea la pestaña Notes, guarda, actualiza y borra notas', () => {
    const s = setup();
    const note = { id: 'n1', text: 'Changer le ballast', color: 'note-yellow', completed: false, timestamp: '2026-11-13T02:00:00.000Z' };
    let result = s.post({ action: 'syncNotes', operations: [{ op: 'save', id: 'n1', note }, { op: 'save', id: 'n2', note: { ...note, id: 'n2', text: 'Autre' } }] });
    assert.equal(result.status, 'success');
    assert.deepEqual(s.sheets.Notes.rows[0], ['Id', 'Texte', 'Couleur', 'Terminée', 'Créée le']);
    assert.equal(s.sheets.Notes.rows.length, 3);
    assert.deepEqual(result.notes.map(n => n.id), ['n1', 'n2']);

    result = s.post({ action: 'syncNotes', operations: [{ op: 'save', id: 'n1', note: { ...note, completed: true } }, { op: 'delete', id: 'n2' }] });
    assert.equal(s.sheets.Notes.rows.length, 2);
    assert.equal(result.notes[0].completed, true);
    assert.equal(result.notes[0].text, 'Changer le ballast');
    assert.equal(s.lock.released, s.lock.taken);
});

test('las notas llegan con getData y una nota que empieza por "-" no se guarda como fórmula', () => {
    const s = setup();
    assert.deepEqual(s.get().notes, []);
    s.post({ action: 'syncNotes', operations: [{ op: 'save', id: 'n1', note: { id: 'n1', text: '- acheter 10 F32T8', completed: false } }] });
    assert.equal(s.sheets.Notes.rows[1][1], "'- acheter 10 F32T8");
    assert.equal(s.get().notes.length, 1);
});

test('syncNotes no toca las columnas que la app no conoce', () => {
    const s = setup();
    s.sheets.Notes = new (s.sheets.Registros.constructor)('Notes', [['Id', 'Texte', 'Couleur', 'Terminée', 'Créée le', 'Responsable'], ['n1', 'Vieux', 'note-blue', false, 'x', 'Michel']]);
    s.post({ action: 'syncNotes', operations: [{ op: 'save', id: 'n1', note: { id: 'n1', text: 'Nouveau', completed: true } }] });
    assert.deepEqual(s.sheets.Notes.rows[1].slice(1), ['Nouveau', 'note-blue', true, '', 'Michel']);
});
