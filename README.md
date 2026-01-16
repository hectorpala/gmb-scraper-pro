# GMB Scraper - Google My Business Scraper

Aplicacion para extraer informacion de negocios de Google Maps y guardarlos automaticamente en Google Sheets.

## Uso Rapido

**Solo haz doble clic en el icono "GMB Scraper" en tu escritorio.** La aplicacion se abrira automaticamente en tu navegador.

## Caracteristicas

- Busqueda por tipo de negocio, ciudad y pais
- Extraccion de hasta 50 negocios por busqueda
- **Guardado automatico en Google Sheets**
- Exportacion a CSV y JSON local
- Interfaz web simple e intuitiva

### Datos extraidos por negocio:
- Nombre del negocio
- Rating y numero de resenas
- Categoria
- Direccion completa
- Telefono
- Sitio web
- Horarios
- Coordenadas (latitud/longitud)
- URL del perfil de Google Maps

---

## Configuracion de Google Sheets

Para habilitar el guardado automatico en Google Sheets, sigue estos pasos:

### Paso 1: Crear proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google Sheets API**:
   - Menu > APIs y servicios > Biblioteca
   - Busca "Google Sheets API"
   - Haz clic en "Habilitar"

### Paso 2: Crear credenciales OAuth

1. Ve a Menu > APIs y servicios > Credenciales
2. Clic en "Crear credenciales" > "ID de cliente OAuth"
3. Si es la primera vez, configura la pantalla de consentimiento:
   - Tipo: Externo
   - Nombre de la app: GMB Scraper
   - Correo de soporte: tu correo
   - Guarda y continua
4. Tipo de aplicacion: **Aplicacion de escritorio**
5. Nombre: GMB Scraper
6. Clic en "Crear"
7. **Descarga el JSON** (boton de descarga)
8. Renombra el archivo a `credentials.json`
9. Mueve el archivo a la carpeta del proyecto:
   ```
   Scraper google my business/credentials.json
   ```

### Paso 3: Conectar tu cuenta

1. Abre la aplicacion (doble clic en GMB Scraper)
2. Veras el boton "Conectar Google Sheets"
3. Haz clic y autoriza con tu cuenta de Google
4. Listo! Ahora los datos se guardaran automaticamente

---

## Estructura del Proyecto

```
Scraper google my business/
├── backend/
│   ├── server.js          # Servidor Express
│   ├── scraper.js         # Logica de scraping
│   ├── exporter.js        # Exportacion CSV/JSON
│   ├── googleSheets.js    # Integracion Google Sheets
│   └── package.json       # Dependencias
├── frontend/
│   ├── index.html         # Interfaz de usuario
│   ├── styles.css         # Estilos
│   └── app.js             # Logica frontend
├── assets/                # Iconos
├── output/                # Archivos exportados
├── credentials.json       # (tu archivo de Google - agregar)
├── README.md
└── run.sh
```

---

## Ejecucion Manual (alternativa)

Si prefieres no usar la app del escritorio:

```bash
cd "Scraper google my business/backend"
npm start
```

Luego abre http://localhost:8000 en tu navegador.

---

## Solucion de Problemas

### "Google Sheets no configurado"
- Asegurate de tener el archivo `credentials.json` en la carpeta raiz del proyecto

### "El scraping no encuentra resultados"
- Verifica tu conexion a internet
- Intenta con terminos de busqueda mas genericos
- Google puede bloquear si haces muchas busquedas seguidas

### "Error al iniciar el servidor"
- Verifica que Node.js este instalado (version 18+)
- Ejecuta `npm install` en la carpeta backend

### La app no abre
- Abre Terminal y ejecuta manualmente:
  ```bash
  cd "ruta/al/proyecto/backend"
  node server.js
  ```
- Luego abre http://localhost:8000

---

## Tecnologias

- **Backend**: Node.js, Express
- **Scraping**: Puppeteer (headless Chrome)
- **Frontend**: HTML5, CSS3, JavaScript
- **Integracion**: Google Sheets API

## Licencia

MIT - Uso libre para fines personales y educativos.
