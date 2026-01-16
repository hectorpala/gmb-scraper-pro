import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleMapsScraper } from './scraper.js';
import { DataExporter } from './exporter.js';
import { GoogleSheetsExporter } from './googleSheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

let lastSearchResults = null;
let lastSearchParams = null;

const googleSheets = new GoogleSheetsExporter();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

/**
 * POST /api/scrape - Scraping principal
 */
app.post('/api/scrape', async (req, res) => {
  const { businessType, city, country, maxResults, exportToGoogleSheets } = req.body;
  const limit = Math.min(Math.max(parseInt(maxResults) || 50, 10), 200);

  if (!businessType || !city || !country) {
    return res.status(400).json({
      success: false,
      error: 'Todos los campos son requeridos: businessType, city, country'
    });
  }

  console.log('Iniciando scraping:', { businessType, city, country, limit });

  const scraper = new GoogleMapsScraper();

  try {
    const startTime = Date.now();
    const businesses = await scraper.scrape(businessType, city, country, limit);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('Scraping completado en ' + duration + 's. Resultados: ' + businesses.length);

    lastSearchResults = businesses;
    lastSearchParams = { businessType, city, country };

    const exporter = new DataExporter();
    const exportResults = exporter.exportAll(businesses, businessType, city, country);

    const response = {
      success: true,
      data: {
        query: { businessType, city, country },
        totalResults: businesses.length,
        duration: duration + 's',
        businesses,
        exports: {
          json: '/output/' + exportResults.json.filename,
          csv: '/output/' + exportResults.csv.filename
        }
      }
    };

    // Exportar a Google Sheets si esta habilitado
    if (googleSheets.isConfigured()) {
      try {
        const isAuth = await googleSheets.initialize();
        if (isAuth) {
          console.log('Exportando a Google Sheets...');
          const sheetsResult = await googleSheets.exportToSheets(
            businesses, businessType, city, country
          );
          response.data.googleSheets = {
            url: sheetsResult.spreadsheetUrl,
            title: sheetsResult.title,
            rowCount: sheetsResult.rowCount
          };
          console.log('Exportado a Google Sheets: ' + sheetsResult.spreadsheetUrl);
        }
      } catch (gsError) {
        console.error('Error exportando a Google Sheets:', gsError.message);
        response.data.googleSheetsError = gsError.message;
      }
    }

    res.json(response);

  } catch (error) {
    console.error('Error en scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Error durante el scraping: ' + error.message
    });
  }
});
/**
 * POST /api/v2/preview - Vista previa rapida sin extraccion completa
 */
app.post('/api/v2/preview', async (req, res) => {
  const { businessType, city, country, maxResults } = req.body;
  const limit = Math.min(Math.max(parseInt(maxResults) || 50, 10), 200);

  if (!businessType || !city || !country) {
    return res.status(400).json({
      success: false,
      data: { message: 'Todos los campos son requeridos: businessType, city, country' }
    });
  }

  console.log('Preview:', { businessType, city, country, limit });

  const scraper = new GoogleMapsScraper();

  try {
    const previewData = await scraper.preview(businessType, city, country, limit);
    
    res.json({
      success: true,
      data: {
        count: Math.min(previewData.count, limit),
        sampleNames: previewData.sampleNames,
        query: { businessType, city, country }
      }
    });

  } catch (error) {
    console.error('Error en preview:', error);
    res.status(500).json({
      success: false,
      data: { message: 'Error en preview: ' + error.message }
    });
  }
});

/**
 * GET /api/google/status - Estado de Google Sheets
 */
app.get('/api/google/status', async (req, res) => {
  const configured = googleSheets.isConfigured();
  let authenticated = false;

  if (configured) {
    try {
      authenticated = await googleSheets.initialize();
    } catch (e) {
      // No autenticado
    }
  }

  res.json({
    success: true,
    data: { configured, authenticated }
  });
});

/**
 * GET /api/google/connect - Inicia el flujo OAuth de escritorio
 */
app.get('/api/google/connect', async (req, res) => {
  if (!googleSheets.isConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Credenciales no configuradas. Revisa las variables GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env'
    });
  }

  try {
    await googleSheets.initialize();
    
    // Iniciar servidor de callback en background
    const authPromise = googleSheets.startAuthServer();
    
    // Obtener URL de autorizacion
    const authUrl = googleSheets.getAuthUrl();
    
    // Responder con la URL para que el frontend la abra
    res.json({
      success: true,
      data: { authUrl }
    });

    // Esperar a que se complete la autorizacion
    authPromise.then(() => {
      console.log('Autorizacion de Google completada');
    }).catch((err) => {
      console.error('Error en autorizacion:', err.message);
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/google/export - Exportar manualmente a Google Sheets
 */
app.post('/api/google/export', async (req, res) => {
  if (!lastSearchResults || lastSearchResults.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No hay resultados para exportar. Realiza una busqueda primero.'
    });
  }

  if (!googleSheets.isConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Google Sheets no esta configurado'
    });
  }

  try {
    const isAuth = await googleSheets.initialize();
    if (!isAuth) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado con Google. Conecta tu cuenta primero.'
      });
    }

    const { businessType, city, country } = lastSearchParams;
    const result = await googleSheets.exportToSheets(
      lastSearchResults, businessType, city, country
    );

    res.json({
      success: true,
      data: {
        url: result.spreadsheetUrl,
        title: result.title,
        rowCount: result.rowCount
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error exportando: ' + error.message
    });
  }
});

/**
 * GET /api/export/:format
 */
app.get('/api/export/:format', (req, res) => {
  const { format } = req.params;

  if (!['json', 'csv'].includes(format)) {
    return res.status(400).json({ success: false, error: 'Formato no valido' });
  }

  if (!lastSearchResults || lastSearchResults.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay resultados' });
  }

  const exporter = new DataExporter();
  const { businessType, city, country } = lastSearchParams;

  try {
    const result = format === 'json' 
      ? exporter.toJSON(lastSearchResults, businessType, city, country)
      : exporter.toCSV(lastSearchResults, businessType, city, country);

    res.json({
      success: true,
      data: { downloadUrl: '/output/' + result.filename, filename: result.filename, size: result.size }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports', (req, res) => {
  const exporter = new DataExporter();
  const files = exporter.listExports();
  res.json({
    success: true,
    data: files.map(f => ({ ...f, downloadUrl: '/output/' + f.filename }))
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  Google My Business Scraper');
  console.log('========================================');
  console.log('');
  console.log('  Servidor: http://localhost:' + PORT);
  console.log('');
  
  if (googleSheets.isConfigured()) {
    console.log('  Google Sheets: Configurado');
    console.log('  Estado: ' + (googleSheets.isAuthenticated() ? 'Conectado' : 'Pendiente de conexion'));
  } else {
    console.log('  Google Sheets: No configurado');
    console.log('  (Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env)');
  }
  
  console.log('');
  console.log('========================================');
});

export default app;
