# Control de Facturación

App web (HTML + CSS + JS puro, sin dependencias de build) para registrar y revisar tu facturación mensual, con Google Sheets como base de datos.

Funciona **sin conexión** con guardado local, y se sincroniza con tu planilla de Google Sheets cuando configurás la conexión (paso 2).

---

## 1. Estructura del proyecto

```
afip-facturacion/
├── index.html          → pantallas de la app
├── style.css            → estética y animaciones
├── app.js                → toda la lógica
├── apps-script/
│   └── Code.gs           → backend que conecta con Google Sheets
└── README.md
```

---

## 2. Vincular Google Sheets (paso a paso)

La forma más simple y segura de usar una planilla como "base de datos" desde una web sin backend propio es publicar un **Google Apps Script** como aplicación web. Así no necesitás exponer ninguna contraseña ni API key.

1. Andá a [sheets.google.com](https://sheets.google.com) y creá una planilla nueva. Llamala, por ejemplo, **"Facturación"**.
2. Dentro de la planilla, andá a **Extensiones → Apps Script**.
3. Se abrirá el editor con un archivo `Code.gs` vacío. Borrá el contenido y pegá **todo** el contenido del archivo [`apps-script/Code.gs`](./apps-script/Code.gs) de este proyecto.
4. Guardá el proyecto (ícono de disquete o `Ctrl+S`). Podés nombrarlo "Backend Facturación".
5. En la barra de funciones de arriba, seleccioná la función `inicializar` y tocá **Ejecutar** (▶). La primera vez te va a pedir permisos: aceptá y autorizá tu cuenta de Google (es tu propio script, es seguro).
   - Esto crea automáticamente una hoja llamada **"Config"** con el usuario `elimlecnik` y contraseña `Mlecnik1` como valores iniciales.
6. Ahora publicá el script como app web:
   - Arriba a la derecha, tocá **Implementar → Nueva implementación**.
   - En "Seleccionar tipo", elegí **Aplicación web**.
   - Configurá:
     - **Ejecutar como:** Yo (tu cuenta)
     - **Quién tiene acceso:** Cualquier usuario
   - Tocá **Implementar** y autorizá de nuevo si te lo pide.
7. Copiá la **URL de la aplicación web** que te muestra (termina en `/exec`).
8. Abrí la app (`index.html`), en la pantalla de login desplegá **"Configuración de conexión (Google Sheets)"**, pegá esa URL y tocá **Guardar URL**.

Listo. A partir de ahora, cada vez que registres un mes o cambies el usuario/contraseña, la app va a intentar guardar esos datos también en tu planilla, en una hoja nueva con el nombre `Mes-Año` (por ejemplo `Agosto-2026`).

> **Nota:** si en algún momento no hay conexión a internet o la URL no está configurada, la app sigue funcionando 100% en modo local (guarda todo en el navegador) y se sincroniza la próxima vez que tengas conexión y vuelvas a guardar o entrar a "Revisar".

### Si más adelante cambiás algo en `Code.gs`
Cada vez que edites el script, tenés que hacer **Implementar → Administrar implementaciones → ✏️ (editar) → Nueva versión → Implementar** para que los cambios se reflejen en la URL ya publicada.

---

## 3. Subir el proyecto a GitHub (paso a paso)

### Opción A — Desde la web de GitHub (sin usar la terminal)

1. Entrá a [github.com](https://github.com) e iniciá sesión (o creá una cuenta gratis).
2. Tocá el botón **+** arriba a la derecha → **New repository**.
3. Ponele un nombre, por ejemplo `control-facturacion`. Dejalo en **Public** (o Private si preferís). No marques "Add a README" porque ya tenés uno. Tocá **Create repository**.
4. En la pantalla del repo recién creado, tocá el link **"uploading an existing file"**.
5. Arrastrá **todos** los archivos y carpetas del proyecto (`index.html`, `style.css`, `app.js`, la carpeta `apps-script/`, y `README.md`).
6. Abajo, escribí un mensaje de commit como "Primera versión de la app" y tocá **Commit changes**.

### Opción B — Con Git en la terminal

```bash
cd afip-facturacion
git init
git add .
git commit -m "Primera versión de la app"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/control-facturacion.git
git push -u origin main
```

### 3.1 Publicar la app con GitHub Pages (para tener un link que funcione en el celular)

1. En tu repositorio de GitHub, andá a **Settings → Pages**.
2. En "Source", elegí **Deploy from a branch**.
3. En "Branch", elegí `main` y la carpeta `/ (root)`. Tocá **Save**.
4. Esperá 1-2 minutos. GitHub te va a dar un link como:
   `https://TU-USUARIO.github.io/control-facturacion/`
5. Entrá a ese link desde cualquier dispositivo (celular, computadora) y ahí vas a poder loguearte y usar la app. Podés agregarlo a la pantalla de inicio de tu celular como si fuera una app.

---

## 4. Uso de la app

- **Login:** usuario `elimlecnik` / contraseña `Mlecnik1` (se puede cambiar desde AJUSTES).
- **REGISTRAR:** elegí el mes → cargá cada transferencia (se van listando) → LISTO → ves el total → SIGUIENTE → se calcula el 20% y vas cargando los pagos hasta cubrirlo → resumen final → Guardar.
- **REVISAR:** ves el total facturado por mes, el % que representa sobre el año (gráfico de torta) y podés exportar cada mes como imagen PNG o PDF con los valores, separados por rayas: Transferencias / Total transferencias / 20% / Total facturado.
- **AJUSTES:** cambiar usuario/contraseña, tamaño de letra (en píxeles), color principal de la app y tipografía (Aptos, Calibri, Arial, Lexend, Cambria u otra que escribas vos).

---

## 5. Notas técnicas

- No requiere instalación ni build: es HTML/CSS/JS plano, se puede abrir el `index.html` directamente en el navegador para probarlo.
- El formato de moneda es argentino: punto para miles, coma para decimales (ej: `$ 12.345,67`).
- Los datos se guardan siempre primero en el navegador (`localStorage`), así nunca se pierde nada aunque falle la conexión a internet o a Sheets.
- Las librerías externas (Chart.js, html2canvas, jsPDF) se cargan desde CDN, por lo que necesitás internet la primera vez que abrís la app (o cada vez, si tu navegador no las cachea).
