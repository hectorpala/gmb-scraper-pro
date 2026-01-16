/**
 * GMB Scraper Pro - Módulo de Base de Datos
 * Con manejo de errores para módulos nativos
 */

let db = null;
let dbEnabled = false;

try {
  const Database = (await import('better-sqlite3')).default;
  const path = (await import('path')).default;
  const { fileURLToPath } = await import('url');
  const fs = (await import('fs')).default;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const DB_PATH = path.join(__dirname, '..', 'data', 'gmb_scraper.db');

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  dbEnabled = true;

  // Crear tablas
  db.exec(`
    CREATE TABLE IF NOT EXISTS negocios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT UNIQUE,
      nombre TEXT NOT NULL,
      categoria TEXT,
      rating REAL,
      resenas INTEGER DEFAULT 0,
      telefono TEXT,
      email TEXT,
      sitio_web TEXT,
      direccion TEXT,
      ciudad TEXT,
      estado TEXT,
      pais TEXT,
      latitud REAL,
      longitud REAL,
      horarios TEXT,
      instagram TEXT,
      facebook TEXT,
      whatsapp TEXT,
      twitter TEXT,
      profile_url TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      busqueda_id INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS busquedas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_negocio TEXT NOT NULL,
      ciudad TEXT,
      pais TEXT,
      total_encontrados INTEGER DEFAULT 0,
      total_nuevos INTEGER DEFAULT 0,
      duracion_segundos REAL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_negocios_ciudad ON negocios(ciudad);
    CREATE INDEX IF NOT EXISTS idx_negocios_place_id ON negocios(place_id);
  `);

  console.log('Base de datos inicializada:', DB_PATH);

} catch (error) {
  console.log('Base de datos no disponible:', error.message);
  console.log('El servidor funcionará sin base de datos local.');
  dbEnabled = false;
}

function isEnabled() {
  return dbEnabled;
}

function generarPlaceId(negocio) {
  const nombre = negocio.name || negocio.nombre || '';
  const direccion = negocio.address || negocio.direccion || '';
  return 'gen_' + Buffer.from(nombre + direccion).toString('base64').substring(0, 20);
}

function guardarNegocio(negocio, busquedaId = null) {
  if (!dbEnabled) return { action: 'skipped', id: null };
  
  const placeId = negocio.placeId || negocio.place_id || generarPlaceId(negocio);
  const existente = db.prepare('SELECT id FROM negocios WHERE place_id = ?').get(placeId);

  if (existente) {
    db.prepare(`
      UPDATE negocios SET
        nombre = COALESCE(?, nombre),
        categoria = COALESCE(?, categoria),
        rating = COALESCE(?, rating),
        resenas = COALESCE(?, resenas),
        telefono = COALESCE(?, telefono),
        email = COALESCE(?, email),
        sitio_web = COALESCE(?, sitio_web),
        direccion = COALESCE(?, direccion),
        ciudad = COALESCE(?, ciudad),
        fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE place_id = ?
    `).run(
      negocio.name || negocio.nombre,
      negocio.category || negocio.categoria,
      negocio.rating,
      negocio.reviewCount || negocio.resenas,
      negocio.phone || negocio.telefono,
      negocio.email,
      negocio.website || negocio.sitio_web,
      negocio.address || negocio.direccion,
      negocio.city || negocio.ciudad,
      placeId
    );
    return { action: 'updated', id: existente.id };
  }

  const result = db.prepare(`
    INSERT INTO negocios (place_id, nombre, categoria, rating, resenas, telefono, email, sitio_web, direccion, ciudad, busqueda_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    placeId,
    negocio.name || negocio.nombre,
    negocio.category || negocio.categoria,
    negocio.rating,
    negocio.reviewCount || negocio.resenas || 0,
    negocio.phone || negocio.telefono,
    negocio.email,
    negocio.website || negocio.sitio_web,
    negocio.address || negocio.direccion,
    negocio.city || negocio.ciudad,
    busquedaId
  );

  return { action: 'inserted', id: result.lastInsertRowid };
}

function guardarNegocios(negocios, busquedaId = null) {
  if (!dbEnabled) return { nuevos: 0, actualizados: 0, errores: 0, ids: [] };
  
  const resultados = { nuevos: 0, actualizados: 0, errores: 0, ids: [] };
  
  const guardarTx = db.transaction((negocios) => {
    for (const negocio of negocios) {
      try {
        const result = guardarNegocio(negocio, busquedaId);
        if (result.id) resultados.ids.push(result.id);
        if (result.action === 'inserted') resultados.nuevos++;
        else if (result.action === 'updated') resultados.actualizados++;
      } catch (error) {
        resultados.errores++;
      }
    }
  });

  guardarTx(negocios);
  return resultados;
}

function buscarNegocios(filtros = {}) {
  if (!dbEnabled) return [];
  
  let query = 'SELECT * FROM negocios WHERE 1=1';
  const params = [];

  if (filtros.ciudad) {
    query += ' AND ciudad LIKE ?';
    params.push('%' + filtros.ciudad + '%');
  }
  if (filtros.busqueda) {
    query += ' AND (nombre LIKE ? OR categoria LIKE ?)';
    params.push('%' + filtros.busqueda + '%', '%' + filtros.busqueda + '%');
  }
  if (filtros.limit) {
    query += ' LIMIT ?';
    params.push(filtros.limit);
  }

  query += ' ORDER BY fecha_creacion DESC';
  return db.prepare(query).all(...params);
}

function registrarBusqueda(datos) {
  if (!dbEnabled) return null;
  
  const result = db.prepare(`
    INSERT INTO busquedas (tipo_negocio, ciudad, pais, total_encontrados, total_nuevos, duracion_segundos)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    datos.businessType || datos.tipoNegocio,
    datos.city || datos.ciudad,
    datos.country || datos.pais,
    datos.totalEncontrados || 0,
    datos.totalNuevos || 0,
    datos.duracion || 0
  );

  return result.lastInsertRowid;
}

function obtenerHistorialBusquedas(limit = 50) {
  if (!dbEnabled) return [];
  return db.prepare('SELECT * FROM busquedas ORDER BY fecha DESC LIMIT ?').all(limit);
}

function obtenerEstadisticas() {
  if (!dbEnabled) {
    return {
      enabled: false,
      totalNegocios: 0,
      conTelefono: 0,
      conEmail: 0,
      conWebsite: 0,
      totalCiudades: 0,
      totalBusquedas: 0,
      ratingPromedio: 0,
      topCiudades: [],
      ultimasBusquedas: []
    };
  }

  return {
    enabled: true,
    totalNegocios: db.prepare('SELECT COUNT(*) as count FROM negocios').get().count,
    conTelefono: db.prepare("SELECT COUNT(*) as count FROM negocios WHERE telefono IS NOT NULL AND telefono != ''").get().count,
    conEmail: db.prepare("SELECT COUNT(*) as count FROM negocios WHERE email IS NOT NULL AND email != ''").get().count,
    conWebsite: db.prepare("SELECT COUNT(*) as count FROM negocios WHERE sitio_web IS NOT NULL AND sitio_web != ''").get().count,
    totalCiudades: db.prepare('SELECT COUNT(DISTINCT ciudad) as count FROM negocios WHERE ciudad IS NOT NULL').get().count,
    totalBusquedas: db.prepare('SELECT COUNT(*) as count FROM busquedas').get().count,
    ratingPromedio: db.prepare('SELECT AVG(rating) as avg FROM negocios WHERE rating IS NOT NULL').get().avg || 0,
    topCiudades: db.prepare('SELECT ciudad, COUNT(*) as total FROM negocios WHERE ciudad IS NOT NULL GROUP BY ciudad ORDER BY total DESC LIMIT 5').all(),
    ultimasBusquedas: db.prepare('SELECT tipo_negocio, ciudad, total_encontrados, fecha FROM busquedas ORDER BY fecha DESC LIMIT 5').all()
  };
}

function limpiarDuplicados() {
  if (!dbEnabled) return 0;
  return db.prepare(`DELETE FROM negocios WHERE id NOT IN (SELECT MAX(id) FROM negocios GROUP BY place_id)`).run().changes;
}

function exportarDatos(filtros = {}) {
  return buscarNegocios(filtros);
}

export {
  isEnabled,
  guardarNegocio,
  guardarNegocios,
  buscarNegocios,
  registrarBusqueda,
  obtenerHistorialBusquedas,
  obtenerEstadisticas,
  limpiarDuplicados,
  exportarDatos
};

export default {
  isEnabled,
  guardarNegocio,
  guardarNegocios,
  buscarNegocios,
  registrarBusqueda,
  obtenerHistorialBusquedas,
  obtenerEstadisticas,
  limpiarDuplicados,
  exportarDatos
};
