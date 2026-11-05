process.env.TZ = 'America/Toronto';

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Almacenamiento mínimo equivalente al del navegador
class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
    clear() { this.data.clear(); }
}

let instance = 0;

// Cada prueba carga store.js de nuevo, como al abrir la app
async function openStore(seed = {}) {
    globalThis.localStorage = new MemoryStorage();
    Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value));
    instance += 1;
    return import(`../js/store.js?test=${instance}`);
}

const CLOUD = { lightman_api_url: 'https://example.invalid/exec' };
const record = (over = {}) => ({
    uuid: 'u1',
    fecha: '2026-08-01',
    id_item: 'A1',
    description: 'Ampoule',
    categorie: 'Halogène',
    quantite: 2,
    etage: '3',
    tache: 'Tournée',
    locataire: 'L',
    ...over
});

beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
});

test('un localStorage dañado no impide arrancar', async () => {
    const store = await openStore({
        lightman_sync_queue: '{dañado',
        lightman_notes: '[dañado',
        lightman_history: 'no json'
    });
    assert.deepEqual(store.syncQueue, []);
    assert.deepEqual(store.getNotes(), []);
    assert.deepEqual(store.getHistory(), []);
});

test('la cola también se ignora si no es una lista', async () => {
    const store = await openStore({ lightman_sync_queue: '{"a":1}' });
    assert.deepEqual(store.syncQueue, []);
});

test('un fallo al guardar (cuota llena) no rompe la app', async () => {
    const store = await openStore(CLOUD);
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.doesNotThrow(() => store.setRecords([record()]));
    assert.equal(store.records.length, 1);
});

test('los valores numéricos de la hoja se convierten en texto', async () => {
    const store = await openStore(CLOUD);
    store.setRecords([record({ id_item: 801014, description: 123, etage: 7 })]);
    store.setAppOptions({ opciones: [{ id: 801014, description: 456, categorie: 'C' }], etage: [1, 'RDC'] });
    assert.equal(store.records[0].id_item, '801014');
    assert.equal(store.records[0].etage, '7');
    assert.equal(store.appOptions.opciones[0].id, '801014');
    assert.deepEqual(store.appOptions.etage, ['1', 'RDC']);
    assert.equal(store.appOptions.inventory, undefined);
});

test('el catálogo de prueba nunca sustituye al guardado', async () => {
    const store = await openStore();
    store.setAppOptions(store.mockOptions);
    assert.equal(localStorage.getItem('lightman_app_options'), null);
});

test('el catálogo real sí se guarda y se recupera', async () => {
    const options = JSON.stringify({ opciones: [{ id: 'A1', description: 'D', categorie: 'C' }] });
    const store = await openStore({
        ...CLOUD,
        lightman_app_options: options,
        lightman_cloud_records: JSON.stringify([record()])
    });
    assert.equal(store.loadCachedData(), true);
    assert.equal(store.appOptions.opciones[0].id, 'A1');
    assert.equal(store.records[0].date, '2026-08-01');
});

test('sin caché completa no se cargan datos a medias', async () => {
    const store = await openStore({ ...CLOUD, lightman_app_options: '{"opciones":[]}' });
    assert.equal(store.loadCachedData(), false);
});

test('un registro pendiente aparece una vez y marcado', async () => {
    const store = await openStore(CLOUD);
    store.addToSyncQueue(record({ uuid: 'p1' }));
    const all = store.getAllRecords();
    assert.equal(all.length, 1);
    assert.equal(all[0].isPending, true);
});

test('si el registro ya llegó a la hoja deja de contar como pendiente', async () => {
    const store = await openStore(CLOUD);
    store.addToSyncQueue(record({ uuid: 'p1' }));
    store.setRecords([record({ uuid: 'p1' })]);
    assert.equal(store.getAllRecords().length, 1);
    assert.equal(store.getAllRecords()[0].isPending, undefined);
    store.removeSyncedFromQueue();
    assert.deepEqual(store.syncQueue, []);
});

test('sincronizar conserva lo agregado mientras tanto', async () => {
    const store = await openStore(CLOUD);
    const sent = record({ uuid: 'p1' });
    store.addToSyncQueue(sent);
    const batch = [...store.syncQueue];
    store.addToSyncQueue(record({ uuid: 'p2' }));
    store.markRecordsSynced(batch);
    assert.deepEqual(store.syncQueue.map(r => r.uuid), ['p2']);
    assert.deepEqual(store.records.map(r => r.uuid), ['p1']);
});

test('la cola sobrevive al reinicio de la app', async () => {
    const first = await openStore(CLOUD);
    first.addToSyncQueue(record({ uuid: 'p1' }));
    instance += 1;
    const second = await import(`../js/store.js?test=${instance}`);
    assert.deepEqual(second.syncQueue.map(r => r.uuid), ['p1']);
});

test('editar conserva el precio guardado del mismo artículo', async () => {
    const store = await openStore(CLOUD);
    store.setRecords([record({ prix: 12 })]);
    store.editRecordLocally('u1', record({ uuid: 'nuevo', quantite: 9 }));
    assert.equal(store.records[0].prix, 12);
    assert.equal(store.records[0].quantite, 9);
    assert.equal(store.records[0].uuid, 'u1');
});

test('editar con otro artículo descarta el precio anterior', async () => {
    const store = await openStore(CLOUD);
    store.setRecords([record({ prix: 12 })]);
    store.editRecordLocally('u1', record({ id_item: 'B2' }));
    assert.equal(store.records[0].prix, undefined);
});

test('editar con otro artículo guarda el precio nuevo que trae', async () => {
    const store = await openStore(CLOUD);
    store.setRecords([record({ prix: 12 })]);
    store.editRecordLocally('u1', record({ id_item: 'B2', prix: 30 }));
    assert.equal(store.records[0].prix, 30);
});

test('editar y borrar un pendiente actúa sobre la cola', async () => {
    const store = await openStore(CLOUD);
    store.addToSyncQueue(record({ uuid: 'p1' }));
    assert.equal(store.isPendingRecord('p1'), true);
    store.editRecordLocally('p1', record({ uuid: 'p1', quantite: 9 }));
    assert.equal(store.syncQueue[0].quantite, 9);
    store.deleteRecordLocally('p1');
    assert.deepEqual(store.syncQueue, []);
});

test('el modo de prueba guarda aparte de la caché de Google Sheets', async () => {
    const store = await openStore();
    store.addRecordLocally(record());
    assert.equal(localStorage.getItem('lightman_cloud_records'), null);
    assert.equal(JSON.parse(localStorage.getItem('lightman_local_records')).length, 1);
    store.deleteRecordLocally('u1');
    assert.equal(JSON.parse(localStorage.getItem('lightman_local_records')).length, 0);
});

test('filterRecords filtra por mes local y por cada criterio', async () => {
    const store = await openStore(CLOUD);
    store.setAppOptions({ opciones: [{ id: 'A1', description: 'F15T8 18" STD', categorie: 'Halogène' }] });
    store.setRecords([
        record({ uuid: 'a', fecha: '2026-08-01', description: 'F15T8 18" STD' }),
        record({ uuid: 'b', fecha: '2026-07-31', etage: '4', id_item: 'B2', description: 'Autre', categorie: 'Fluo', tache: 'Bon' })
    ]);
    const ids = (filters) => store.filterRecords(store.records, filters).map(r => r.uuid);
    assert.deepEqual(ids({ month: '2026-08' }), ['a']);
    assert.deepEqual(ids({ month: '2026-07' }), ['b']);
    assert.deepEqual(ids({ etage: '4' }), ['b']);
    assert.deepEqual(ids({ tache: 'Bon' }), ['b']);
    assert.deepEqual(ids({ categorie: 'Fluo' }), ['b']);
    assert.deepEqual(ids({ description: 'F15T8 18" STD' }), ['a']);
    assert.deepEqual(ids({}), ['a', 'b']);
});
