/* =========================================================
   CONFIG DE CONEXIÓN CON GOOGLE SHEETS (Apps Script Web App)
   ========================================================= */
const LS_KEYS = {
  APPS_URL: 'facturacion_apps_url',
  AUTH: 'facturacion_auth',
  SETTINGS: 'facturacion_settings',
  SESSION: 'facturacion_session',
  DATA: 'facturacion_data' // respaldo local de todos los meses
};

let APPS_SCRIPT_URL = localStorage.getItem(LS_KEYS.APPS_URL) || '';

/* Credenciales por defecto (se pueden cambiar desde AJUSTES) */
const DEFAULT_AUTH = { usuario: 'elimlecnik', clave: 'Mlecnik1' };

/* =========================================================
   HELPERS DE ALMACENAMIENTO LOCAL (funciona SIEMPRE, con o sin Sheets)
   ========================================================= */
function getAuth(){
  const raw = localStorage.getItem(LS_KEYS.AUTH);
  return raw ? JSON.parse(raw) : { ...DEFAULT_AUTH };
}
function setAuth(auth){
  localStorage.setItem(LS_KEYS.AUTH, JSON.stringify(auth));
}
function getSettings(){
  const raw = localStorage.getItem(LS_KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : { color: '#00549f', size: 16, fuente: 'Arial, sans-serif' };
}
function setSettings(s){
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(s));
}
function getAllData(){
  const raw = localStorage.getItem(LS_KEYS.DATA);
  return raw ? JSON.parse(raw) : {}; // { "Agosto-2026": { transferencias:[], veinte:[] } }
}
function saveAllData(data){
  localStorage.setItem(LS_KEYS.DATA, JSON.stringify(data));
}
function getMonthData(key){
  const all = getAllData();
  return all[key] || { transferencias: [], veinte: [] };
}
function saveMonthData(key, monthData){
  const all = getAllData();
  all[key] = monthData;
  saveAllData(all);
}

/* =========================================================
   API HACIA GOOGLE APPS SCRIPT (mejor esfuerzo, no bloqueante)
   ========================================================= */
async function apiCall(action, payload = {}) {
  if (!APPS_SCRIPT_URL) return { ok: false, offline: true };
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify({ action, ...payload })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Apps Script no disponible, se usa modo local:', err);
    return { ok: false, offline: true, error: String(err) };
  }
}

/* =========================================================
   FORMATO DE MONEDA ARGENTINA ($ 1.234,56)
   ========================================================= */
function formatARS(num){
  const n = Number(num) || 0;
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseARSInput(str){
  if (!str) return 0;
  const limpio = String(str).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const val = parseFloat(limpio);
  return isNaN(val) ? 0 : val;
}
/* Formatea mientras el usuario escribe, respetando coma decimal */
function attachMontoMask(input){
  input.addEventListener('blur', () => {
    const val = parseARSInput(input.value);
    input.value = val ? val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  });
}

/* =========================================================
   NAVEGACIÓN ENTRE PANTALLAS
   ========================================================= */
const SCREEN_IDS = {
  login: 'screen-login',
  home: 'screen-home',
  'registrar-mes': 'screen-registrar-mes',
  transferencias: 'screen-transferencias',
  'total-transf': 'screen-total-transf',
  veinte: 'screen-veinte',
  'total-facturado': 'screen-total-facturado',
  revisar: 'screen-revisar',
  ajustes: 'screen-ajustes'
};

function goTo(screenKey){
  // Cierra el teclado (si había un input enfocado) ANTES de cambiar de pantalla,
  // así el scroll no queda "peleando" contra el teclado del celular.
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  Object.values(SCREEN_IDS).forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById(SCREEN_IDS[screenKey]).classList.add('active');

  // Scroll al tope, sin animación (más confiable en mobile) y reforzado
  // un frame después por si el teclado todavía se está cerrando.
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  setTimeout(() => window.scrollTo(0, 0), 120);

  if (screenKey === 'revisar') cargarRevisar();
  if (screenKey === 'ajustes') cargarAjustesForm();
}

document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => goTo(el.dataset.goto));
});

/* =========================================================
   TOAST
   ========================================================= */
let toastTimeout;
function toast(msg, tipo = 'ok'){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (tipo === 'error' ? ' error' : '');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =========================================================
   LOGIN
   ========================================================= */
document.getElementById('apps-script-url').value = APPS_SCRIPT_URL;

document.getElementById('btn-guardar-url').addEventListener('click', () => {
  const url = document.getElementById('apps-script-url').value.trim();
  APPS_SCRIPT_URL = url;
  localStorage.setItem(LS_KEYS.APPS_URL, url);
  toast(url ? 'URL guardada. Se usará para sincronizar con Sheets.' : 'Se borró la URL. La app funcionará en modo local.');
});

function irAHomeTrasLogin(){
  // Saca el foco de los campos (cierra teclado en mobile) y recién ahí
  // navega, para que el "ir arriba" sea inmediato y no quede a mitad de pantalla.
  document.getElementById('login-user').blur();
  document.getElementById('login-pass').blur();
  sessionStorage.setItem(LS_KEYS.SESSION, '1');
  setTimeout(() => iniciarApp(), 80);
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = document.getElementById('login-user').value.trim();
  const clave = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  // 1) Intentar validar contra Sheets si está configurado
  let auth = getAuth();
  if (APPS_SCRIPT_URL) {
    const remoto = await apiCall('login', { usuario, clave });
    if (remoto && remoto.ok) {
      // sincroniza credenciales válidas también localmente
      setAuth({ usuario, clave });
      irAHomeTrasLogin();
      return;
    } else if (remoto && remoto.offline) {
      // sin conexión: seguimos con validación local
    } else {
      errorEl.textContent = 'Usuario o contraseña incorrectos.';
      return;
    }
  }

  // 2) Validación local (modo offline o sin backend configurado)
  if (usuario === auth.usuario && clave === auth.clave) {
    irAHomeTrasLogin();
  } else {
    errorEl.textContent = 'Usuario o contraseña incorrectos.';
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem(LS_KEYS.SESSION);
  goTo('login');
});

/* =========================================================
   REGISTRAR · SELECCIÓN DE MES
   ========================================================= */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function poblarSelectMeses(){
  const sel = document.getElementById('select-mes');
  sel.innerHTML = '';
  const anioActual = new Date().getFullYear();
  [anioActual - 1, anioActual, anioActual + 1].forEach(anio => {
    MESES.forEach((mes, idx) => {
      const opt = document.createElement('option');
      opt.value = `${mes}-${anio}`;
      opt.textContent = `${mes} ${anio}`;
      if (anio === anioActual && idx === new Date().getMonth()) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

let mesActual = null;

document.getElementById('btn-crear-mes').addEventListener('click', async () => {
  mesActual = document.getElementById('select-mes').value;
  document.getElementById('mes-actual-label').textContent = mesActual.replace('-', ' ');
  document.getElementById('mes-status').textContent = 'Preparando hoja en Google Sheets...';

  const r = await apiCall('crearHojaMes', { hoja: mesActual });
  document.getElementById('mes-status').textContent = r.ok
    ? '✓ Hoja lista en Google Sheets.'
    : 'Trabajando en modo local (se sincronizará cuando conectes Sheets).';

  // cargar datos existentes de ese mes (por si se retoma)
  const md = getMonthData(mesActual);
  transferenciasActuales = [...md.transferencias];
  veinteActuales = [...md.veinte];
  renderTransferencias();
  goTo('transferencias');
});

/* =========================================================
   REGISTRAR · TRANSFERENCIAS
   ========================================================= */
let transferenciasActuales = [];

const inputTransferencia = document.getElementById('input-transferencia');
attachMontoMask(inputTransferencia);

function renderTransferencias(){
  const ul = document.getElementById('lista-transferencias');
  ul.innerHTML = '';
  transferenciasActuales.forEach((monto, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><span class="num">#${i + 1}</span>${formatARS(monto)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.title = 'Quitar';
    btn.addEventListener('click', () => {
      transferenciasActuales.splice(i, 1);
      renderTransferencias();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
  const total = transferenciasActuales.reduce((a, b) => a + b, 0);
  document.getElementById('total-transferencias').textContent = formatARS(total);
}

document.getElementById('btn-add-transferencia').addEventListener('click', () => {
  const val = parseARSInput(inputTransferencia.value);
  if (val <= 0) { toast('Ingresá un monto válido.', 'error'); return; }
  transferenciasActuales.push(val);
  inputTransferencia.value = '';
  renderTransferencias();
  inputTransferencia.focus();
});
inputTransferencia.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-transferencia').click(); }
});

document.getElementById('btn-listo-transferencias').addEventListener('click', () => {
  if (transferenciasActuales.length === 0) { toast('Agregá al menos un valor.', 'error'); return; }
  const total = transferenciasActuales.reduce((a, b) => a + b, 0);
  document.getElementById('total-transf-grande').textContent = formatARS(total);
  goTo('total-transf');
});

document.getElementById('btn-siguiente-20').addEventListener('click', () => {
  const total = transferenciasActuales.reduce((a, b) => a + b, 0);
  veinteObjetivo = total * 0.2;
  veinteActuales = [];
  document.getElementById('veinte-calculado').textContent = formatARS(veinteObjetivo);
  renderVeinte();
  goTo('veinte');
});

/* =========================================================
   REGISTRAR · 20%
   ========================================================= */
let veinteActuales = [];
let veinteObjetivo = 0;

const inputVeinte = document.getElementById('input-veinte');
attachMontoMask(inputVeinte);

function renderVeinte(){
  const ul = document.getElementById('lista-veinte');
  ul.innerHTML = '';
  veinteActuales.forEach((monto, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><span class="num">#${i + 1}</span>${formatARS(monto)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      veinteActuales.splice(i, 1);
      renderVeinte();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });

  const acumulado = veinteActuales.reduce((a, b) => a + b, 0);
  const restante = Math.max(veinteObjetivo - acumulado, 0);
  document.getElementById('veinte-restante').textContent = formatARS(restante);

  const pct = veinteObjetivo > 0 ? Math.min((acumulado / veinteObjetivo) * 100, 100) : 0;
  document.getElementById('veinte-progreso').style.width = pct + '%';

  document.getElementById('btn-finalizar-veinte').disabled = !(restante <= 0.004 && veinteActuales.length > 0);
}

document.getElementById('btn-add-veinte').addEventListener('click', () => {
  const val = parseARSInput(inputVeinte.value);
  if (val <= 0) { toast('Ingresá un monto válido.', 'error'); return; }
  veinteActuales.push(val);
  inputVeinte.value = '';
  renderVeinte();
  inputVeinte.focus();
});
inputVeinte.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-veinte').click(); }
});

document.getElementById('btn-finalizar-veinte').addEventListener('click', () => {
  const totalTransf = transferenciasActuales.reduce((a, b) => a + b, 0);
  const totalVeinte = veinteActuales.reduce((a, b) => a + b, 0);
  const totalFacturado = totalTransf + totalVeinte;

  document.getElementById('resumen-transf').textContent = formatARS(totalTransf);
  document.getElementById('resumen-veinte').textContent = formatARS(totalVeinte);
  document.getElementById('total-facturado-grande').textContent = formatARS(totalFacturado);
  goTo('total-facturado');
});

/* =========================================================
   GUARDAR MES (LOCAL + SHEETS)
   ========================================================= */
document.getElementById('btn-guardar-final').addEventListener('click', async () => {
  const statusEl = document.getElementById('guardar-status');
  statusEl.textContent = 'Guardando...';

  const monthData = { transferencias: transferenciasActuales, veinte: veinteActuales };
  saveMonthData(mesActual, monthData);

  const r = await apiCall('guardarMes', {
    hoja: mesActual,
    transferencias: transferenciasActuales,
    veinte: veinteActuales
  });

  statusEl.textContent = r.ok
    ? '✓ Guardado en Google Sheets y localmente.'
    : '✓ Guardado localmente. Se sincronizará cuando conectes Sheets.';

  setTimeout(() => {
    goTo('home');
    statusEl.textContent = '';
  }, 1200);
});

/* =========================================================
   REVISAR
   ========================================================= */
let chartInstance = null;

async function cargarRevisar(){
  const statusEl = document.getElementById('revisar-status');
  statusEl.textContent = 'Cargando datos...';

  let data = getAllData();

  // intenta traer datos actualizados de Sheets (mejor esfuerzo)
  const remoto = await apiCall('obtenerTodo');
  if (remoto && remoto.ok && remoto.data) {
    data = remoto.data;
    saveAllData(data); // refresca respaldo local
  }

  const meses = Object.keys(data).filter(k => (data[k].transferencias?.length || data[k].veinte?.length));
  const ul = document.getElementById('lista-meses-revisar');
  ul.innerHTML = '';

  if (meses.length === 0) {
    statusEl.textContent = 'Todavía no registraste ningún mes.';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  statusEl.textContent = '';

  const totales = meses.map(k => {
    const t = (data[k].transferencias || []).reduce((a, b) => a + b, 0);
    const v = (data[k].veinte || []).reduce((a, b) => a + b, 0);
    return { mes: k, total: t + v, transf: t, veinte: v };
  });

  const sumaAnual = totales.reduce((a, b) => a + b.total, 0);

  totales.forEach(item => {
    const li = document.createElement('li');
    const pct = sumaAnual > 0 ? ((item.total / sumaAnual) * 100).toFixed(1) : '0.0';
    li.innerHTML = `
      <div class="mes-info">
        <span class="mes-nombre">${item.mes.replace('-', ' ')}</span>
        <span class="mes-pct">${pct}% del total anual</span>
      </div>
      <span class="mes-monto">${formatARS(item.total)}</span>
      <div class="mes-acciones">
        <button class="btn-exportar" data-mes="${item.mes}" data-formato="pdf">PDF</button>
        <button class="btn-exportar" data-mes="${item.mes}" data-formato="png">IMAGEN</button>
      </div>
    `;
    ul.appendChild(li);
  });

  ul.querySelectorAll('.btn-exportar').forEach(btn => {
    btn.addEventListener('click', () => exportarMes(btn.dataset.mes, data[btn.dataset.mes], btn.dataset.formato));
  });

  // Gráfico de torta
  const ctx = document.getElementById('grafico-torta');
  const colores = ['#00549f','#0080c9','#1e8e5a','#f2a900','#c0392b','#7a5195','#ef5675','#374c80','#003f5c','#ffa600','#665191','#2f4b7c'];
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: totales.map(t => t.mes.replace('-', ' ')),
      datasets: [{
        data: totales.map(t => t.total),
        backgroundColor: totales.map((_, i) => colores[i % colores.length]),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: getComputedStyle(document.body).fontFamily, size: 11 } } }
      },
      animation: { animateScale: true, animateRotate: true }
    }
  });
}

/* =========================================================
   EXPORTAR (imagen o PDF)
   ========================================================= */
async function exportarMes(mesKey, monthData, formato){
  try {
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
      toast('No se pudieron cargar las librerías de exportación. Revisá tu conexión a internet o si algún bloqueador de anuncios/contenido está frenando cdnjs.cloudflare.com, y volvé a intentar.', 'error');
      return;
    }

    const transferencias = monthData.transferencias || [];
    const veinte = monthData.veinte || [];
    // El 20% facturado es la suma de lo cargado en esa etapa (cuando el mes
    // se guardó completo, esa suma equivale al 20% calculado sobre las transferencias).
    const totalTransf = transferencias.reduce((a, b) => a + b, 0);
    const totalVeinte = veinte.reduce((a, b) => a + b, 0);
    const totalFacturacion = totalTransf + totalVeinte; // TOTAL = transferencias + 20%

    document.getElementById('export-mes-titulo').textContent = mesKey.replace('-', ' ');

    const listaEl = document.getElementById('export-lista-transferencias');
    listaEl.innerHTML = transferencias.length
      ? transferencias.map((m, i) => `<li><span><span class="num">#${i + 1}</span>Transferencia</span><strong>${formatARS(m)}</strong></li>`).join('')
      : '<li><span>Sin valores cargados</span></li>';

    document.getElementById('export-total-transf').textContent = formatARS(totalTransf);
    document.getElementById('export-veinte').textContent = formatARS(totalVeinte);
    document.getElementById('export-total').textContent = formatARS(totalFacturacion);

    const tarjeta = document.getElementById('tarjeta-exportar');
    // La tarjeta ya está posicionada fuera del área visible (ver style.css),
    // así que la capturamos directamente, sin tocar su opacidad/visibilidad.
    const canvas = await html2canvas(tarjeta, { scale: 2, backgroundColor: '#ffffff' });

    if (formato === 'png') {
      const link = document.createElement('a');
      link.download = `Facturacion_${mesKey}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      const { jsPDF } = window.jspdf;
      // Convertimos el tamaño real de la tarjeta (en px CSS, ya que el canvas
      // está capturado al doble de escala) a milímetros, para que el PDF
      // respete la proporción exacta y no salga estirado ni cortado.
      const anchoPxCSS = canvas.width / 2;
      const altoPxCSS = canvas.height / 2;
      const PX_A_MM = 25.4 / 96;
      const anchoMM = anchoPxCSS * PX_A_MM;
      const altoMM = altoPxCSS * PX_A_MM;
      const margenMM = 10;

      // No pasamos "orientation" junto con un array en "format": jsPDF puede
      // invertir ancho/alto en ese caso. El array ya define el tamaño exacto.
      const pdf = new jsPDF({
        unit: 'mm',
        format: [anchoMM + margenMM * 2, altoMM + margenMM * 2]
      });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margenMM, margenMM, anchoMM, altoMM);
      pdf.save(`Facturacion_${mesKey}.pdf`);
    }
    toast('Exportación lista.');
  } catch (err) {
    console.error('Error al exportar:', err);
    toast('No se pudo exportar. Probá de nuevo; si sigue fallando, revisá la consola del navegador.', 'error');
  }
}

/* =========================================================
   AJUSTES
   ========================================================= */
function cargarAjustesForm(){
  const auth = getAuth();
  document.getElementById('ajustes-user').value = auth.usuario;
  document.getElementById('ajustes-pass').value = '';

  const s = getSettings();
  document.getElementById('ajustes-size').value = s.size;
  document.getElementById('ajustes-color').value = s.color;

  const sel = document.getElementById('ajustes-fuente');
  const match = [...sel.options].some(o => o.value === s.fuente);
  if (match) {
    sel.value = s.fuente;
    document.getElementById('campo-fuente-otra').style.display = 'none';
  } else {
    sel.value = 'otra';
    document.getElementById('campo-fuente-otra').style.display = 'block';
    document.getElementById('ajustes-fuente-otra').value = s.fuente;
  }
}

document.getElementById('ajustes-fuente').addEventListener('change', (e) => {
  document.getElementById('campo-fuente-otra').style.display = e.target.value === 'otra' ? 'block' : 'none';
});

document.getElementById('btn-guardar-user').addEventListener('click', async () => {
  const usuario = document.getElementById('ajustes-user').value.trim();
  const clave = document.getElementById('ajustes-pass').value;
  if (!usuario || !clave) { toast('Completá usuario y contraseña.', 'error'); return; }

  setAuth({ usuario, clave });
  await apiCall('actualizarAuth', { usuario, clave });
  toast('Usuario y contraseña actualizados.');
});

document.getElementById('btn-aplicar-ajustes').addEventListener('click', () => {
  const size = parseInt(document.getElementById('ajustes-size').value, 10) || 16;
  const color = document.getElementById('ajustes-color').value;
  const selFuente = document.getElementById('ajustes-fuente').value;
  const fuente = selFuente === 'otra' ? (document.getElementById('ajustes-fuente-otra').value.trim() || 'Arial, sans-serif') : selFuente;

  const settings = { size, color, fuente };
  setSettings(settings);
  aplicarTema(settings);
  toast('Ajustes aplicados.');
});

function aplicarTema(s){
  const root = document.documentElement;
  root.style.setProperty('--font-size', s.size + 'px');
  root.style.setProperty('--font', s.fuente);
  root.style.setProperty('--accent', s.color);
  // genera automáticamente una variante más oscura y una clara para mantener coherencia visual
  root.style.setProperty('--accent-dark', oscurecer(s.color, 0.25));
  root.style.setProperty('--accent-light', aclarar(s.color, 0.88));
}
function oscurecer(hex, factor){
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}
function aclarar(hex, factor){
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}
function hexToRgb(hex){
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b){
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* =========================================================
   INICIO
   ========================================================= */
function iniciarApp(){
  poblarSelectMeses();
  aplicarTema(getSettings());
  goTo('home');
}

(function init(){
  aplicarTema(getSettings());
  if (sessionStorage.getItem(LS_KEYS.SESSION) === '1') {
    iniciarApp();
  } else {
    goTo('login');
  }
})();
