/**
 * BACKEND - Control de Facturación
 * Este script se pega en el Editor de Apps Script de tu Google Sheet
 * y se publica como "Aplicación web" para que la app HTML pueda leer y
 * escribir datos en la planilla.
 *
 * Ver README.md del proyecto para el paso a paso de instalación.
 */

const HOJA_CONFIG = 'Config';

/* ---------- Utilidades de planilla ---------- */
function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateConfigSheet() {
  const ss = getSS();
  let hoja = ss.getSheetByName(HOJA_CONFIG);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_CONFIG);
    hoja.appendRow(['usuario', 'clave']);
    hoja.appendRow(['elimlecnik', 'Mlecnik1']); // valores iniciales, se pueden cambiar desde AJUSTES
  }
  return hoja;
}

function leerAuth() {
  const hoja = getOrCreateConfigSheet();
  const usuario = hoja.getRange(2, 1).getValue();
  const clave = hoja.getRange(2, 2).getValue();
  return { usuario: String(usuario), clave: String(clave) };
}

function guardarAuth(usuario, clave) {
  const hoja = getOrCreateConfigSheet();
  hoja.getRange(2, 1).setValue(usuario);
  hoja.getRange(2, 2).setValue(clave);
}

function nombreHojaValido(nombre) {
  // Sheets no permite ciertos caracteres en nombres de hoja
  return String(nombre).replace(/[\[\]\*\/\\\?:]/g, '-').substring(0, 100);
}

function getOrCreateMonthSheet(nombreMes) {
  const ss = getSS();
  const nombre = nombreHojaValido(nombreMes);
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.appendRow(['Tipo', 'Monto', 'Fecha de registro']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/* ---------- Acciones ---------- */
function accionLogin(payload) {
  const auth = leerAuth();
  const ok = String(payload.usuario) === auth.usuario && String(payload.clave) === auth.clave;
  return { ok };
}

function accionActualizarAuth(payload) {
  guardarAuth(payload.usuario, payload.clave);
  return { ok: true };
}

function accionCrearHojaMes(payload) {
  getOrCreateMonthSheet(payload.hoja);
  return { ok: true };
}

function accionGuardarMes(payload) {
  const hoja = getOrCreateMonthSheet(payload.hoja);

  // Limpia filas de datos previas (deja el encabezado) para evitar duplicados
  // al volver a guardar el mismo mes.
  const filas = hoja.getLastRow();
  if (filas > 1) {
    hoja.getRange(2, 1, filas - 1, 3).clearContent();
  }

  const fecha = new Date();
  let fila = 2;
  (payload.transferencias || []).forEach(monto => {
    hoja.getRange(fila, 1, 1, 3).setValues([['Transferencia', monto, fecha]]);
    fila++;
  });
  (payload.veinte || []).forEach(monto => {
    hoja.getRange(fila, 1, 1, 3).setValues([['20%', monto, fecha]]);
    fila++;
  });

  return { ok: true };
}

function accionObtenerTodo() {
  const ss = getSS();
  const hojas = ss.getSheets();
  const data = {};

  hojas.forEach(hoja => {
    const nombre = hoja.getName();
    if (nombre === HOJA_CONFIG) return;
    // Solo procesa hojas con formato "Mes-Año"
    const valores = hoja.getDataRange().getValues();
    if (valores.length < 2) return;

    const transferencias = [];
    const veinte = [];
    for (let i = 1; i < valores.length; i++) {
      const [tipo, monto] = valores[i];
      if (!tipo) continue;
      if (String(tipo).toLowerCase().includes('transfer')) transferencias.push(Number(monto) || 0);
      else if (String(tipo).includes('20')) veinte.push(Number(monto) || 0);
    }
    if (transferencias.length || veinte.length) {
      data[nombre] = { transferencias, veinte };
    }
  });

  return { ok: true, data };
}

/* ---------- Enrutador HTTP ---------- */
function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuesta({ ok: false, error: 'JSON inválido' });
  }

  let resultado;
  switch (payload.action) {
    case 'login':
      resultado = accionLogin(payload);
      break;
    case 'actualizarAuth':
      resultado = accionActualizarAuth(payload);
      break;
    case 'crearHojaMes':
      resultado = accionCrearHojaMes(payload);
      break;
    case 'guardarMes':
      resultado = accionGuardarMes(payload);
      break;
    case 'obtenerTodo':
      resultado = accionObtenerTodo(payload);
      break;
    default:
      resultado = { ok: false, error: 'Acción desconocida' };
  }

  return respuesta(resultado);
}

function doGet(e) {
  return respuesta({ ok: true, mensaje: 'Backend de Control de Facturación funcionando correctamente.' });
}

function respuesta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecutá esta función UNA sola vez manualmente desde el editor
 * (menú "Ejecutar") para crear la hoja de configuración inicial.
 */
function inicializar() {
  getOrCreateConfigSheet();
}
