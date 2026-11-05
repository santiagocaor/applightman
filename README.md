# Lightman App

Aplicación web instalable (PWA) para registrar los reemplazos de luminarias de un edificio, y seguir el consumo con estadísticas. La interfaz está en francés y los datos viven en una hoja de Google Sheets.

**App publicada:** <https://santiagocaor.github.io/applightman/>

## Cómo funciona

| Parte | Dónde está | Cómo se actualiza |
|---|---|---|
| App (pantallas y lógica) | `index.html`, `css/`, `js/`, `sw.js` | Con un push a `main`: GitHub Pages la publica y los dispositivos la reciben al abrirla |
| Conexión con la hoja | `apps-script/google_script.js` | Aparte, en Google Apps Script (ver abajo) |
| Datos | Google Sheets | Desde la app o directamente en la hoja |

La app funciona sin conexión: guarda los registros en el dispositivo y los envía cuando vuelve a tener internet. Un aviso en el encabezado indica cuando no hay conexión o quedan registros pendientes.

## Configurar un dispositivo

1. Abre la app y entra a **Configuration** con la tuerca de arriba.
2. Pega la URL de la Web App, la que termina en `/exec`, y el token.
3. Pulsa **Enregistrer**. Debe aparecer "Connecté à Google Sheets".

Sin URL configurada, la app funciona en modo de prueba con datos ficticios que no se envían a ninguna parte.

## Seguridad

Este repositorio es público. Nunca subas aquí:

- La URL `/exec` de la Web App.
- El token de acceso. Vive en la propiedad `API_TOKEN` del proyecto de Apps Script y en cada dispositivo.
- Los archivos de datos internos, como listas de precios o nombres de inquilinos.

## Actualizar Apps Script

Los cambios en `apps-script/google_script.js` no se publican con un push.

**A mano**

1. En la hoja, abre **Extensiones → Apps Script**.
2. Reemplaza el código por el de `apps-script/google_script.js` y guarda.
3. Abre **Implementar → Administrar implementaciones**, y edita la implementación activa con el lápiz.
4. En **Versión**, elige **Nueva versión** y pulsa **Implementar**.

Así se mantiene la misma URL. Si creas una implementación nueva, la URL cambia y hay que ponerla de nuevo en cada dispositivo.

**Con clasp (opcional)**

`clasp` es la herramienta de Google para hacer lo mismo desde la terminal.

1. Activa la API en <https://script.google.com/home/usersettings>.
2. Inicia sesión con `npm run script:login`.
3. Copia `.clasp.json.example` como `.clasp.json` y pon el ID del script, que aparece en **Configuración del proyecto**.
4. Trae los archivos del proyecto real con `npm run script:pull`. Conserva `appsscript.json`, porque sin él `clasp` no puede subir el código, y borra la copia del código con otro nombre, como `Código.js`, para no subirlo duplicado.
5. Sube el código con `npm run script:push`.
6. Publica una versión nueva con `npm run script:deploy -- ID_DE_LA_IMPLEMENTACION`. Así se mantiene la misma URL.

## Copia de seguridad semanal

`apps-script/google_script.js` incluye una copia automática de la hoja. Se activa una sola vez:

1. Actualiza Apps Script como se explica arriba.
2. En el editor, elige la función `installWeeklyBackup` y pulsa **Ejecutar**. Google pedirá permiso para usar Drive.
3. Cada lunes se crea una copia en la carpeta **Lightman - Copies de sécurité** de tu Drive. Se conservan las últimas 8; las anteriores van a la papelera, de donde se pueden recuperar durante 30 días.

Para probarla de inmediato, ejecuta `backupSpreadsheet`.

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
```

```bash
npm test
```

```bash
npm run lint
```

- **Tests:** comprueban fechas, precios, filtros, la cola sin conexión y Apps Script con una hoja simulada.
- **Lint:** ESLint busca errores comunes y código sin uso.
- **Probar la app en local:** sirve la carpeta con cualquier servidor estático. Abrir `index.html` directamente no funciona, porque los módulos de JavaScript necesitan un servidor.
