import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleMapsScraperAdvanced, previewSearch, initFreeProxies, getProxyStatus } from './scraperAdvanced.js';
import { DataExporterAdvanced } from './exporterAdvanced.js';
import { GoogleSheetsExporter } from './googleSheets.js';
import { ProxyManager } from './services/proxyManager.js';
import * as database from './services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Estado global
let lastSearchResults = null;
let lastSearchParams = null;
let lastSearchStats = null;
let activeJobs = new Map();

// Instancias
const googleSheets = new GoogleSheetsExporter();
const proxyManager = new ProxyManager();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

/**
 * POST /api/scrape - Scraping basico (compatibilidad)
 */
app.post('/api/scrape', async (req, res) => {
  const { businessType, city, country, maxResults } = req.body;
  
  // Redirigir al endpoint avanzado
  req.body.extractEmails = true;
  return handleAdvancedScrape(req, res);
});


/**
 * POST /api/v2/preview - Preview rapido: cuenta negocios sin extraer detalles
 */
app.post('/api/v2/preview', async (req, res) => {
  const {
    businessType,
    city,
    country,
    coordinates = null,
    radius = null,
    maxResults = 200
  } = req.body;

  if (!businessType || (!city && !coordinates)) {
    return res.status(400).json({
      success: false,
      error: 'Campos requeridos: businessType y (city/country o coordinates)'
    });
  }

  console.log('\n========================================');
  console.log('PREVIEW: Contando negocios...');
  console.log('Busqueda:', businessType, 'en', city || 'coordenadas');
  console.log('========================================\n');

  try {
    const result = await previewSearch({
      businessType,
      city: city || '',
      country: country || '',
      maxResults: Math.min(parseInt(maxResults) || 200, 500),
      coordinates,
      radius
    });

    res.json({
      success: result.success,
      data: {
        count: result.count,
        sampleNames: result.sampleNames || [],
        query: result.query,
        message: result.message || result.error
      }
    });

  } catch (error) {
    console.error('Error en preview:', error);
    res.status(500).json({
      success: false,
      error: 'Error durante el preview: ' + error.message
    });
  }
});
/**
 * POST /api/v2/scrape - Scraping avanzado con todas las opciones
 */
app.post('/api/v2/scrape', handleAdvancedScrape);

async function handleAdvancedScrape(req, res) {
  const {
    businessType,
    city,
    country,
    maxResults = 50,
    coordinates = null,
    radius = null,
    extractEmails = true,
    extractSocialMedia = true,
    filters = {}
  } = req.body;

  const limit = Math.min(Math.max(parseInt(maxResults) || 50, 10), 500);

  if (!businessType || (!city && !coordinates)) {
    return res.status(400).json({
      success: false,
      error: 'Campos requeridos: businessType y (city/country o coordinates)'
    });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  
  console.log('\n========================================');
  console.log('Job ID:', jobId);
  console.log('Parametros:', { businessType, city, country, limit, coordinates, radius });
  console.log('Filtros:', filters);
  console.log('========================================\n');

  const scraper = new GoogleMapsScraperAdvanced({
    maxResults: limit,
    extractEmails,
    extractSocialMedia,
    filters,
    onProgress: (progress) => {
      activeJobs.set(jobId, progress);
    }
  });

  try {
    const startTime = Date.now();
    
    const result = await scraper.scrape({
      businessType,
      city: city || '',
      country: country || '',
      maxResults: limit,
      coordinates,
      radius,
      filters
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\nScraping completado en ' + duration + 's');

    lastSearchResults = result.businesses;
    lastSearchParams = { businessType, city, country, coordinates, radius };
    lastSearchStats = result.stats;

    // Exportar
    const exporter = new DataExporterAdvanced();
    const exportResults = exporter.exportAll(
      result.businesses,
      businessType,
      city || 'geo',
      country || 'search',
      result.stats
    );

    const response = {
      success: true,
      data: {
        jobId,
        query: { businessType, city, country, coordinates, radius, filters },
        totalResults: result.businesses.length,
        stats: result.stats,
        duration: duration + 's',
        businesses: result.businesses,
        exports: {
          json: '/output/' + exportResults.json.filename,
          csv: '/output/' + exportResults.csv.filename
        }
      }
    };


    // Guardar en base de datos
    const startDbSave = Date.now();
    const busquedaId = database.registrarBusqueda({
      businessType,
      city: city || '',
      country: country || '',
      coordinates,
      radius,
      totalEncontrados: result.businesses.length,
      duracion: parseFloat(duration)
    });

    const dbResult = database.guardarNegocios(result.businesses, busquedaId);
    console.log('Base de datos: ' + dbResult.nuevos + ' nuevos, ' + dbResult.actualizados + ' actualizados, ' + dbResult.errores + ' errores');

    // Actualizar búsqueda con estadísticas
    response.data.database = {
      busquedaId,
      nuevos: dbResult.nuevos,
      actualizados: dbResult.actualizados,
      duplicados: dbResult.duplicados,
      tiempoGuardado: ((Date.now() - startDbSave) / 1000).toFixed(2) + 's'
    };

    // Google Sheets
    if (googleSheets.isConfigured()) {
      try {
        const isAuth = await googleSheets.initialize();
        if (isAuth) {
          console.log('Exportando a Google Sheets...');
          const sheetsResult = await googleSheets.exportToSheets(
            result.businesses, businessType, city || 'geo', country || 'search'
          );
          response.data.googleSheets = {
            url: sheetsResult.spreadsheetUrl,
            title: sheetsResult.title,
            rowCount: sheetsResult.rowCount
          };
        }
      } catch (gsError) {
        response.data.googleSheetsError = gsError.message;
      }
    }

    activeJobs.delete(jobId);
    res.json(response);

  } catch (error) {
    console.error('Error en scraping:', error);
    activeJobs.delete(jobId);
    res.status(500).json({
      success: false,
      error: 'Error durante el scraping: ' + error.message
    });
  }
}

/**
 * GET /api/v2/scrape/progress/:jobId - Progreso de un job
 */
app.get('/api/v2/scrape/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const progress = activeJobs.get(jobId);
  
  if (progress) {
    res.json({ success: true, data: progress });
  } else {
    res.json({ success: true, data: null, message: 'Job no encontrado o completado' });
  }
});

/**
 * GET /api/v2/stats - Estadisticas de la ultima busqueda
 */
app.get('/api/v2/stats', (req, res) => {
  if (!lastSearchStats) {
    return res.status(404).json({ success: false, error: 'No hay estadisticas disponibles' });
  }
  res.json({ success: true, data: lastSearchStats });
});

/**
 * POST /api/v2/businesses/filter - Filtrar resultados existentes
 */
app.post('/api/v2/businesses/filter', (req, res) => {
  if (!lastSearchResults) {
    return res.status(404).json({ success: false, error: 'No hay resultados para filtrar' });
  }

  const { minRating, minReviews, requirePhone, requireEmail, requireWebsite, hasDelivery } = req.body;

  let filtered = [...lastSearchResults];

  if (minRating) {
    filtered = filtered.filter(b => b.rating && b.rating >= minRating);
  }
  if (minReviews) {
    filtered = filtered.filter(b => b.reviewCount && b.reviewCount >= minReviews);
  }
  if (requirePhone) {
    filtered = filtered.filter(b => b.phone);
  }
  if (requireEmail) {
    filtered = filtered.filter(b => b.email);
  }
  if (requireWebsite) {
    filtered = filtered.filter(b => b.website);
  }
  if (hasDelivery) {
    filtered = filtered.filter(b => b.attributes?.delivery);
  }

  // Recalcular estadisticas
  const exporter = new DataExporterAdvanced();
  const stats = exporter.calculateStats(filtered);

  res.json({
    success: true,
    data: {
      totalResults: filtered.length,
      stats,
      businesses: filtered
    }
  });
});

/**
 * GET /api/v2/export/:format - Exportar con formato especifico
 */
app.get('/api/v2/export/:format', (req, res) => {
  const { format } = req.params;

  if (!['json', 'csv', 'excel'].includes(format)) {
    return res.status(400).json({ success: false, error: 'Formato no valido. Usa: json, csv, excel' });
  }

  if (!lastSearchResults || lastSearchResults.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay resultados para exportar' });
  }

  const exporter = new DataExporterAdvanced();
  const { businessType, city, country } = lastSearchParams;

  try {
    let result;
    if (format === 'json') {
      result = exporter.toJSON(lastSearchResults, businessType, city, country, lastSearchStats);
    } else if (format === 'csv') {
      result = exporter.toCSV(lastSearchResults, businessType, city, country);
    } else if (format === 'excel') {
      result = exporter.toExcel(lastSearchResults, businessType, city, country);
    }

    res.json({
      success: true,
      data: { downloadUrl: '/output/' + result.filename, filename: result.filename, size: result.size }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS EXISTENTES (compatibilidad) ============

app.get('/api/google/status', async (req, res) => {
  const configured = googleSheets.isConfigured();
  let authenticated = false;
  if (configured) {
    try { authenticated = await googleSheets.initialize(); } catch (e) {}
  }
  res.json({ success: true, data: { configured, authenticated } });
});

app.get('/api/google/connect', async (req, res) => {
  if (!googleSheets.isConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Credenciales no configuradas. Revisa GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env'
    });
  }
  try {
    await googleSheets.initialize();
    const authPromise = googleSheets.startAuthServer();
    const authUrl = googleSheets.getAuthUrl();
    res.json({ success: true, data: { authUrl } });
    authPromise.then(() => console.log('Autorizacion de Google completada'))
               .catch((err) => console.error('Error en autorizacion:', err.message));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/google/export', async (req, res) => {
  if (!lastSearchResults || lastSearchResults.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay resultados para exportar' });
  }
  if (!googleSheets.isConfigured()) {
    return res.status(400).json({ success: false, error: 'Google Sheets no configurado' });
  }
  try {
    const isAuth = await googleSheets.initialize();
    if (!isAuth) {
      return res.status(401).json({ success: false, error: 'No autenticado con Google' });
    }
    const { businessType, city, country } = lastSearchParams;
    const result = await googleSheets.exportToSheets(lastSearchResults, businessType, city, country);
    res.json({ success: true, data: { url: result.spreadsheetUrl, title: result.title, rowCount: result.rowCount } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/export/:format', (req, res) => {
  const { format } = req.params;
  if (!['json', 'csv'].includes(format)) {
    return res.status(400).json({ success: false, error: 'Formato no valido' });
  }
  if (!lastSearchResults || lastSearchResults.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay resultados' });
  }
  const exporter = new DataExporterAdvanced();
  const { businessType, city, country } = lastSearchParams;
  try {
    const result = format === 'json'
      ? exporter.toJSON(lastSearchResults, businessType, city, country)
      : exporter.toCSV(lastSearchResults, businessType, city, country);
    res.json({ success: true, data: { downloadUrl: '/output/' + result.filename, filename: result.filename, size: result.size } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/exports', (req, res) => {
  const exporter = new DataExporterAdvanced();
  const files = exporter.listExports();
  res.json({ success: true, data: files.map(f => ({ ...f, downloadUrl: '/output/' + f.filename })) });
});

/**
 * POST /api/v2/proxies/init - Inicializar proxies gratuitos
 */
app.post('/api/v2/proxies/init', async (req, res) => {
  console.log('Inicializando proxies gratuitos...');
  try {
    const success = await initFreeProxies();
    const status = getProxyStatus();
    res.json({
      success,
      data: {
        message: success ? 'Proxies activados' : 'No se encontraron proxies funcionales',
        ...status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/proxies/status - Estado de los proxies
 */
app.get('/api/v2/proxies/status', (req, res) => {
  const status = getProxyStatus();
  res.json({ success: true, data: status });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', version: '2.0', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ============ INICIO DEL SERVIDOR ============

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  GMB Scraper Pro v2.0');
  console.log('========================================');
  console.log('');
  console.log('  Servidor: http://localhost:' + PORT);
  console.log('');
  console.log('  Nuevas caracteristicas:');
  console.log('  - Extraccion de 40+ campos');
  console.log('  - Emails desde sitios web');
  console.log('  - Redes sociales (IG, FB, WA)');
  console.log('  - Busqueda por geolocalizacion');
  console.log('  - Filtros avanzados');
  console.log('');
  
  if (googleSheets.isConfigured()) {
    console.log('  Google Sheets: Configurado');
    console.log('  Estado: ' + (googleSheets.isAuthenticated() ? 'Conectado' : 'Pendiente'));
  } else {
    console.log('  Google Sheets: No configurado');
  }
  
  console.log('');
  console.log('========================================');
});

export default app;

// ============ ENDPOINTS DE BASE DE DATOS ============

/**
 * GET /api/db/stats - Estadísticas generales de la base de datos
 */
app.get('/api/db/stats', (req, res) => {
  try {
    const stats = database.obtenerEstadisticas();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/negocios - Buscar negocios en la base de datos
 */
app.get('/api/db/negocios', (req, res) => {
  try {
    const filtros = {
      ciudad: req.query.ciudad,
      categoria: req.query.categoria,
      minRating: req.query.minRating ? parseFloat(req.query.minRating) : null,
      minResenas: req.query.minResenas ? parseInt(req.query.minResenas) : null,
      conTelefono: req.query.conTelefono === 'true',
      conEmail: req.query.conEmail === 'true',
      conWebsite: req.query.conWebsite === 'true',
      busqueda: req.query.q,
      orderBy: req.query.orderBy || 'fecha_creacion',
      orderDir: req.query.orderDir || 'DESC',
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const negocios = database.buscarNegocios(filtros);
    res.json({ 
      success: true, 
      data: { 
        total: negocios.length,
        negocios 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/negocios/:id - Obtener un negocio por ID
 */
app.get('/api/db/negocios/:id', (req, res) => {
  try {
    const negocio = database.obtenerNegocio(parseInt(req.params.id));
    if (!negocio) {
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    res.json({ success: true, data: negocio });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/db/negocios/:id - Eliminar un negocio
 */
app.delete('/api/db/negocios/:id', (req, res) => {
  try {
    const result = database.eliminarNegocio(parseInt(req.params.id));
    res.json({ success: true, data: { deleted: result.changes > 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/historial - Historial de búsquedas
 */
app.get('/api/db/historial', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const historial = database.obtenerHistorialBusquedas(limit);
    res.json({ success: true, data: historial });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/ciudades/:ciudad - Negocios por ciudad
 */
app.get('/api/db/ciudades/:ciudad', (req, res) => {
  try {
    const negocios = database.obtenerPorCiudad(req.params.ciudad);
    res.json({ success: true, data: { total: negocios.length, negocios } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/categorias/:categoria - Negocios por categoría
 */
app.get('/api/db/categorias/:categoria', (req, res) => {
  try {
    const negocios = database.obtenerPorCategoria(req.params.categoria);
    res.json({ success: true, data: { total: negocios.length, negocios } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/db/limpiar-duplicados - Eliminar duplicados
 */
app.post('/api/db/limpiar-duplicados', (req, res) => {
  try {
    const eliminados = database.limpiarDuplicados();
    res.json({ success: true, data: { eliminados } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/db/exportar - Exportar datos de la base de datos
 */
app.get('/api/db/exportar', (req, res) => {
  try {
    const filtros = {
      ciudad: req.query.ciudad,
      categoria: req.query.categoria,
      minRating: req.query.minRating ? parseFloat(req.query.minRating) : null,
      conTelefono: req.query.conTelefono === 'true',
      conEmail: req.query.conEmail === 'true'
    };

    const datos = database.exportarDatos(filtros);
    
    // Crear archivo de exportación
    const exporter = new DataExporterAdvanced();
    const result = exporter.toCSV(datos, 'database_export', filtros.ciudad || 'todas', 'mx');
    
    res.json({ 
      success: true, 
      data: { 
        total: datos.length,
        downloadUrl: '/output/' + result.filename,
        filename: result.filename 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
