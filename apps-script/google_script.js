// google_script.js
// COPIA ESTE CÓDIGO EN GOOGLE APPS SCRIPT

const SHEET_NAME_OPTIONS = "Opciones";
const SHEET_NAME_ETAGES = "Étages";
const SHEET_NAME_TACHES = "Tâches";
const SHEET_NAME_LOCATAIRES = "Locataire";
const SHEET_NAME_RECORDS = "Registros";

// Tiempo máximo de espera para escribir cuando otro envío está en curso
const LOCK_TIMEOUT_MS = 25000;
// Registros más recientes que se envían a la app; si hay más, la app lo avisa en Statistiques
const RECORDS_LIMIT = 5000;
// Nombres admitidos para la columna del precio en la hoja de registros
const PRIX_HEADER = /^prix$|^price$|^cout$|^coût$/i;

// El token se define en Configuración del proyecto > Propiedades de la secuencia de comandos > API_TOKEN.
// Mientras no exista, la API sigue abierta para no cortar los dispositivos que aún no lo tienen.
function getApiToken() {
  return PropertiesService.getScriptProperties().getProperty('API_TOKEN') || "";
}

function assertAuthorized(token) {
  const expected = getApiToken();
  if (expected && token !== expected) throw new Error("Jeton d'accès invalide");
}

function setup() {
  getOrCreateSheetWithHeaders(SHEET_NAME_OPTIONS, ["Id", "Description", "Catégorie"]);
  getOrCreateSheetWithHeaders(SHEET_NAME_ETAGES, ["Étages"]);
  getOrCreateSheetWithHeaders(SHEET_NAME_TACHES, ["Tâches"]);
  getOrCreateSheetWithHeaders(SHEET_NAME_LOCATAIRES, ["Locataire"]);
  getOrCreateSheetWithHeaders(SHEET_NAME_RECORDS, ["Date", "Type de tâche", "Tournée", "Bon de travail", "Soumission", "Locataire", "Étage", "Catégorie", "Description", "Quantité", "Id", "Note", "UUID"]);
  ensureUUIDColumn();
  ensurePrixColumn();
}

function ensurePrixColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!headers.some(h => PRIX_HEADER.test(String(h).trim()))) {
    sheet.getRange(1, lastCol + 1).setValue("Prix");
  }
}

// Una columna calculada con ARRAYFORMULA se rompería al escribir un valor en ella
function columnHasArrayFormula(sheet, column) {
  return [1, 2].some(row => /arrayformula/i.test(sheet.getRange(row, column).getFormula()));
}

// El precio guardado nunca reemplaza una fórmula de la hoja
function canWritePrix(sheet, rowIndex, column) {
  return !columnHasArrayFormula(sheet, column) && !sheet.getRange(rowIndex, column).getFormula();
}

function ensureUUIDColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_RECORDS);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers && headers.indexOf("UUID") === -1) {
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(1, lastCol + 1).setValue("UUID");
  }
}

function doPost(e) {
  let lock = null;
  try {
    const data = JSON.parse(e.postData.contents);
    assertAuthorized(data.token);
    const action = data.action;

    if (action === 'getData') return buildDataResponse();

    // Solo una escritura a la vez: dos envíos simultáneos podrían pisarse en la misma fila
    lock = LockService.getScriptLock();
    lock.waitLock(LOCK_TIMEOUT_MS);

    setup();

    if (action === 'addRecord' || action === 'addRecordsBatch') {
      const recordsToInsert = action === 'addRecord' ? [data.record] : (data.records || []);
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);

      const lastCol = sheet.getLastColumn();
      let headers = [];
      if (lastCol > 0) {
        headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      }

      if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) {
        headers = ["Date", "Type de tâche", "Tournée", "Bon de travail", "Soumission", "Locataire", "Étage", "Catégorie", "Description", "Quantité", "Id", "Note", "UUID"];
        sheet.appendRow(headers);
      }

      const prixIdx = headers.findIndex(h => PRIX_HEADER.test(String(h).trim()));
      const canSavePrix = prixIdx > -1 && !columnHasArrayFormula(sheet, prixIdx + 1);
      const idIdx = headers.indexOf("Id");
      let fechaIdx = headers.indexOf("Date");
      if (fechaIdx === -1) fechaIdx = headers.indexOf("Fecha");
      const etageIdx = headers.indexOf("Étage");
      let locataireIdx = headers.indexOf("Locataire");
      if (locataireIdx === -1) locataireIdx = headers.indexOf("Locataires");
      const descIdx = headers.indexOf("Description");
      const catIdx = headers.indexOf("Catégorie");
      const quantIdx = headers.indexOf("Quantité");
      const tacheIdx = headers.indexOf("Type de tâche");
      let numTacheIdx = headers.indexOf("# Type de tâche");
      if (numTacheIdx === -1) numTacheIdx = headers.indexOf("Tournée");
      let numBonIdx = headers.indexOf("# Bon de trabajo");
      if (numBonIdx === -1) numBonIdx = headers.indexOf("# Bon de travail");
      if (numBonIdx === -1) numBonIdx = headers.indexOf("Bon de trabajo");
      if (numBonIdx === -1) numBonIdx = headers.indexOf("Bon de travail");
      let numSoumIdx = headers.indexOf("# Soumission");
      if (numSoumIdx === -1) numSoumIdx = headers.indexOf("Soumission");
      const noteIdx = headers.indexOf("Note");
      const uuidIdx = headers.indexOf("UUID");

      const lastRow = sheet.getLastRow();
      let existingUuids = new Set();
      if (lastRow > 1 && uuidIdx > -1) {
        const uuidsData = sheet.getRange(2, uuidIdx + 1, lastRow - 1, 1).getValues();
        uuidsData.forEach(r => {
          if (r[0]) existingUuids.add(r[0].toString());
        });
      }

      const rowsToAppend = [];

      for (const record of recordsToInsert) {
        if (record.uuid && existingUuids.has(record.uuid.toString())) {
          continue; // Omitir duplicados
        }

        const row = new Array(headers.length).fill("");
        if (idIdx > -1) row[idIdx] = record.id_item;
        if (fechaIdx > -1) row[fechaIdx] = record.fecha;
        if (etageIdx > -1) row[etageIdx] = record.etage;
        if (locataireIdx > -1) row[locataireIdx] = record.locataire;
        if (descIdx > -1) row[descIdx] = record.description;
        if (catIdx > -1) row[catIdx] = record.categorie;
        if (quantIdx > -1) row[quantIdx] = record.quantite;
        if (tacheIdx > -1) row[tacheIdx] = record.tache;
        if (numTacheIdx > -1) row[numTacheIdx] = record.num_tache;
        if (numBonIdx > -1) row[numBonIdx] = record.num_bon;
        if (numSoumIdx > -1) row[numSoumIdx] = record.num_soumission;
        if (noteIdx > -1) row[noteIdx] = record.note;
        if (uuidIdx > -1) row[uuidIdx] = record.uuid;
        if (canSavePrix && record.prix !== undefined) row[prixIdx] = record.prix;

        rowsToAppend.push(row);
        if (record.uuid) {
          existingUuids.add(record.uuid.toString());
        }
      }

      if (rowsToAppend.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
      }

      return createJsonResponse({ status: 'success', message: 'Records added successfully' });
    }

    if (action === 'deleteRecord') {
      const targetUuid = data.uuid;
      if (!targetUuid) throw new Error("UUID no proporcionado");

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();

      if (lastRow > 1) {
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const uuidIdx = headers.indexOf("UUID");
        if (uuidIdx > -1) {
          const uuidValues = sheet.getRange(2, uuidIdx + 1, lastRow - 1, 1).getValues();
          for (let i = 0; i < uuidValues.length; i++) {
            if (uuidValues[i][0] === targetUuid) {
              sheet.deleteRow(i + 2); // +2 porque el arreglo empieza en 0 y la primera fila es cabecera
              return createJsonResponse({ status: 'success', message: 'Record deleted successfully' });
            }
          }
        }
      }
      return createJsonResponse({ status: 'error', message: 'Record not found' });
    }

    if (action === 'editRecord') {
      const targetUuid = data.uuid;
      const record = data.record;
      if (!targetUuid) throw new Error("UUID no proporcionado");
      if (!record) throw new Error("Record no proporcionado");

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();

      if (lastRow > 1) {
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const uuidIdx = headers.indexOf("UUID");

        if (uuidIdx > -1) {
          const uuidValues = sheet.getRange(2, uuidIdx + 1, lastRow - 1, 1).getValues();
          for (let i = 0; i < uuidValues.length; i++) {
            if (uuidValues[i][0] === targetUuid) {
              const rowIndex = i + 2;

              // Solo se escriben las columnas de la app: Prix, fórmulas y otras columnas no se tocan
              for (let c = 0; c < headers.length; c++) {
                const value = getEditedCellValue(headers[c], record);
                if (value !== undefined) sheet.getRange(rowIndex, c + 1).setValue(value);
                if (PRIX_HEADER.test(String(headers[c]).trim()) && record.prix !== undefined && record.prix !== ""
                    && canWritePrix(sheet, rowIndex, c + 1)) {
                  sheet.getRange(rowIndex, c + 1).setValue(record.prix);
                }
              }

              return createJsonResponse({ status: 'success', message: 'Record updated successfully' });
            }
          }
        }
      }
      return createJsonResponse({ status: 'error', message: 'Record not found' });
    }

    return createJsonResponse({ status: 'error', message: 'Action inconnue : ' + action });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

// Valor de la celda al editar; undefined si la columna no pertenece a la app
function getEditedCellValue(header, record) {
  switch (header) {
    case "Date":
    case "Fecha":
      return record.fecha || "";
    case "Étage":
      return record.etage || "";
    case "Locataire":
    case "Locataires":
      return record.locataire || "";
    case "Catégorie":
      return record.categorie || "";
    case "Description":
      return record.description || "";
    case "Quantité":
      return record.quantite || 0;
    case "Id":
      return record.id_item || "";
    case "Note":
      return record.note || "";
    case "Type de tâche":
      return record.tache || "";
    case "# Type de tâche":
    case "Tournée":
      return record.num_tache || "";
    case "# Bon de trabajo":
    case "# Bon de travail":
    case "Bon de trabajo":
    case "Bon de travail":
      return record.num_bon || "";
    case "# Soumission":
    case "Soumission":
      return record.num_soumission || "";
    default:
      return undefined;
  }
}

function doGet(e) {
  try {
    // Con token los datos se piden por POST, para que el token nunca viaje en la URL
    if (getApiToken()) throw new Error("Jeton d'accès requis");

    const action = (e && e.parameter && e.parameter.action) || 'getData';
    if (action === 'getData') return buildDataResponse();

    return createJsonResponse({ status: 'error', message: 'Action inconnue : ' + action });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// Asigna UUID a las filas que no lo tienen, escribiendo solo esa columna y sin chocar con otros envíos
function backfillMissingUuids(sheet, uuidIdx) {
  const column = uuidIdx + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const isMissing = row => !row[0];
  if (!sheet.getRange(2, column, lastRow - 1, 1).getValues().some(isMissing)) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // Se reintenta en la siguiente carga

  try {
    const range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
    const values = range.getValues();
    values.forEach(row => {
      if (isMissing(row)) row[0] = Utilities.getUuid();
    });
    range.setValues(values);
  } finally {
    lock.releaseLock();
  }
}

function buildDataResponse() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Obtener Opciones (solo Id, Description, Catégorie para el formulario)
  const opcionesSheet = ss.getSheetByName(SHEET_NAME_OPTIONS);
  const opcionesList = [];
  if (opcionesSheet) {
    const optionsData = opcionesSheet.getDataRange().getValues();
    if (optionsData.length > 1) {
      const headers = optionsData[0];
      const idIdx = headers.indexOf("Id");
      const descIdx = headers.indexOf("Description");
      const catIdx = headers.indexOf("Catégorie");
      const prixIdx = headers.findIndex(h => /^prix$|^price$/i.test(String(h).trim()));

      for (let i = 1; i < optionsData.length; i++) {
        const row = optionsData[i];
        const desc = descIdx > -1 ? row[descIdx] : "";
        const cat = catIdx > -1 ? row[catIdx] : "";
        const prix = prixIdx > -1 ? row[prixIdx] : "";
        if (desc || cat) {
          opcionesList.push({
            id: idIdx > -1 ? row[idIdx] : "",
            description: desc,
            categorie: cat,
            prix: prix
          });
        }
      }
    }
  }

  // 2. Obtener Étages
  const etagesList = [];
  const etagesSheet = ss.getSheetByName(SHEET_NAME_ETAGES);
  if (etagesSheet) {
    const etagesData = etagesSheet.getDataRange().getValues();
    if (etagesData.length > 1) {
      const headers = etagesData[0];
      const etageIdx = headers.indexOf("Étages");
      for (let i = 1; i < etagesData.length; i++) {
        const val = etageIdx > -1 ? etagesData[i][etageIdx] : etagesData[i][0];
        if (val !== undefined && val !== "") etagesList.push(val);
      }
    }
  }

  // 3. Obtener Tâches
  const tachesList = [];
  const tachesSheet = ss.getSheetByName(SHEET_NAME_TACHES);
  if (tachesSheet) {
    const tachesData = tachesSheet.getDataRange().getValues();
    if (tachesData.length > 1) {
      const headers = tachesData[0];
      const tacheIdx = headers.indexOf("Tâches");
      for (let i = 1; i < tachesData.length; i++) {
        const val = tacheIdx > -1 ? tachesData[i][tacheIdx] : tachesData[i][0];
        if (val !== undefined && val !== "") tachesList.push(val);
      }
    }
  }

  // 3.5 Obtener Locataires
  const locatairesList = [];
  const locatairesSheet = getSheetByNameCaseInsensitive(ss, SHEET_NAME_LOCATAIRES);
  if (locatairesSheet) {
    const locData = locatairesSheet.getDataRange().getValues();
    if (locData.length > 1) {
      const headers = locData[0];
      let locIdx = -1;
      for (let h = 0; h < headers.length; h++) {
        if (/locataire/i.test(String(headers[h]).trim())) {
          locIdx = h;
          break;
        }
      }
      if (locIdx === -1) locIdx = 0; // fallback columna A

      for (let i = 1; i < locData.length; i++) {
        const val = locData[i][locIdx];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          locatairesList.push(String(val).trim());
        }
      }
    }
  }

  // 4. Obtener los registros más recientes
  const recordsSheet = ss.getSheetByName(SHEET_NAME_RECORDS);
  const lastRow = recordsSheet.getLastRow();
  const lastCol = recordsSheet.getLastColumn();

  const records = [];
  const totalRecords = Math.max(0, lastRow - 1);
  if (lastRow > 1) {
    const headers = recordsSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    let fechaIdx = headers.indexOf("Date");
    if (fechaIdx === -1) fechaIdx = headers.indexOf("Fecha");
    const etageIdx = headers.indexOf("Étage");
    let locataireIdx = headers.indexOf("Locataire");
    if (locataireIdx === -1) locataireIdx = headers.indexOf("Locataires");
    const descIdx = headers.indexOf("Description");
    const catIdx = headers.indexOf("Catégorie");
    const quantIdx = headers.indexOf("Quantité");
    const tacheIdx = headers.indexOf("Type de tâche");
    let numTacheIdx = headers.indexOf("# Type de tâche");
    if (numTacheIdx === -1) numTacheIdx = headers.indexOf("Tournée");
    let numBonIdx = recordsSheet.getLastRow() > 0 ? headers.indexOf("# Bon de trabajo") : -1;
    if (numBonIdx === -1) numBonIdx = headers.indexOf("# Bon de travail");
    if (numBonIdx === -1) numBonIdx = headers.indexOf("Bon de trabajo");
    if (numBonIdx === -1) numBonIdx = headers.indexOf("Bon de travail");
    let numSoumIdx = headers.indexOf("# Soumission");
    if (numSoumIdx === -1) numSoumIdx = headers.indexOf("Soumission");
    const idIdx = headers.indexOf("Id");
    const prixIdx = headers.findIndex(h => PRIX_HEADER.test(String(h).trim()));
    const noteIdx = headers.indexOf("Note");
    const uuidIdx = headers.indexOf("UUID");

    if (uuidIdx > -1) backfillMissingUuids(recordsSheet, uuidIdx);

    const startRow = Math.max(2, lastRow - RECORDS_LIMIT + 1);
    const numRows = lastRow - startRow + 1;

    const recordsData = recordsSheet.getRange(startRow, 1, numRows, lastCol).getValues();

    for (let i = 0; i < recordsData.length; i++) {
      const row = recordsData[i];
      let descVal = descIdx > -1 ? row[descIdx] : "";
      let idVal = idIdx > -1 ? row[idIdx] : "";
      const uuidVal = uuidIdx > -1 ? row[uuidIdx] : "";

      records.push({
        date: fechaIdx > -1 ? row[fechaIdx] : "",
        etage: etageIdx > -1 ? row[etageIdx] : "",
        locataire: locataireIdx > -1 ? row[locataireIdx] : "",
        description: descVal,
        categorie: catIdx > -1 ? row[catIdx] : "",
        quantite: quantIdx > -1 ? row[quantIdx] : 0,
        tache: tacheIdx > -1 ? row[tacheIdx] : "",
        num_tache: numTacheIdx > -1 ? row[numTacheIdx] : "",
        num_bon: numBonIdx > -1 ? row[numBonIdx] : "",
        num_soumission: numSoumIdx > -1 ? row[numSoumIdx] : "",
        id_item: idVal,
        prix: prixIdx > -1 ? row[prixIdx] : "",
        note: noteIdx > -1 ? row[noteIdx] : "",
        uuid: uuidVal
      });
    }
  }

  // Invertir para que los más recientes estén al principio (si la app asume eso)
  records.reverse();

  const options = {
    opciones: opcionesList,
    etage: etagesList,
    tache: tachesList,
    locataire: locatairesList
  };

  return createJsonResponse({ status: 'success', options: options, records: records, totalRecords: totalRecords });
}

// Funciones Auxiliares
function getOrCreateSheetWithHeaders(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = getSheetByNameCaseInsensitive(ss, sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
    }
  } else if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function getSheetByNameCaseInsensitive(ss, name) {
  if (!ss) return null;
  const direct = ss.getSheetByName(name);
  if (direct) return direct;

  const target = String(name).trim().toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sName = sheets[i].getName().trim().toLowerCase();
    if (sName === target || sName === target + 's' || sName + 's' === target) {
      return sheets[i];
    }
  }
  return null;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// COPIA DE SEGURIDAD SEMANAL
// ============================================================
// Ejecutar installWeeklyBackup UNA vez desde el editor: crea una copia de la hoja cada lunes en la
// carpeta de Drive indicada. Solo se conservan las últimas copias; las más antiguas van a la papelera.
const BACKUP_FOLDER_NAME = "Lightman - Copies de sécurité";
const BACKUPS_TO_KEEP = 8;

// De las copias existentes devuelve las que sobran, dejando las más recientes
function backupsToTrash(items, keep) {
  return items.slice().sort((a, b) => b.created - a.created).slice(Math.max(0, keep));
}

function getBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function backupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const folder = getBackupFolder();
  const prefix = ss.getName() + " - copie ";
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH-mm");
  DriveApp.getFileById(ss.getId()).makeCopy(prefix + stamp, folder);

  // Solo se limpian las copias que esta función creó, nunca otros archivos de la carpeta
  const copies = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf(prefix) === 0) {
      copies.push({ file: file, created: file.getDateCreated().getTime() });
    }
  }
  backupsToTrash(copies, BACKUPS_TO_KEEP).forEach(item => item.file.setTrashed(true));
}

function installWeeklyBackup() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'backupSpreadsheet')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('backupSpreadsheet').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
}
