/**
 * GMB Scraper Pro - Módulo de Base de Datos
 * Almacena y gestiona todos los negocios scrapeados
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'gmb_scraper.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
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
      codigo_postal TEXT,
      latitud REAL,
      longitud REAL,
      horarios TEXT,
      instagram TEXT,
      facebook TEXT,
      whatsapp TEXT,
      twitter TEXT,
      linkedin TEXT,
      youtube TEXT,
      tiktok TEXT,
      profile_url TEXT,
      imagen_url TEXT,
      descripcion TEXT,
      precio_nivel TEXT,
      servicios TEXT,
      atributos TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      busqueda_id INTEGER,
      FOREIGN KEY (busqueda_id) REFERENCES busquedas(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS busquedas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_negocio TEXT NOT NULL,
      ciudad TEXT,
      pais TEXT,
      latitud REAL,
      longitud REAL,
      radio_km REAL,
      total_encontrados INTEGER DEFAULT 0,
      total_nuevos INTEGER DEFAULT 0,
      total_actualizados INTEGER DEFAULT 0,
      total_duplicados INTEGER DEFAULT 0,
      duracion_segundos REAL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ciudades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      pais TEXT,
      total_negocios INTEGER DEFAULT 0,
      ultima_busqueda DATETIME,
      UNIQUE(nombre, pais)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      total_negocios INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_negocios_ciudad ON negocios(ciudad);
    CREATE INDEX IF NOT EXISTS idx_negocios_categoria ON negocios(categoria);
    CREATE INDEX IF NOT EXISTS idx_negocios_rating ON negocios(rating);
    CREATE INDEX IF NOT EXISTS idx_negocios_telefono ON negocios(telefono);
    CREATE INDEX IF NOT EXISTS idx_negocios_email ON negocios(email);
    CREATE INDEX IF NOT EXISTS idx_negocios_place_id ON negocios(place_id);
    CREATE INDEX IF NOT EXISTS idx_busquedas_fecha ON busquedas(fecha);
  `);

  console.log('Base de datos inicializada:', DB_PATH);
}

initializeDatabase();

function generarPlaceId(negocio) {
  const nombre = negocio.name || negocio.nombre || '';
  const direccion = negocio.address || negocio.direccion || '';
  const ciudad = negocio.city || negocio.ciudad || '';
  return 'gen_' + Buffer.from(nombre + direccion + ciudad).toString('base64').substring(0, 20);
}

function guardarNegocio(negocio, busquedaId = null) {
  const placeId = negocio.placeId || negocio.place_id || generarPlaceId(negocio);
  const existente = db.prepare('SELECT id FROM negocios WHERE place_id = ?').get(placeId);

  if (existente) {
    const stmt = db.prepare(`
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
        instagram = COALESCE(?, instagram),
        facebook = COALESCE(?, facebook),
        whatsapp = COALESCE(?, whatsapp),
        horarios = COALESCE(?, horarios),
        profile_url = COALESCE(?, profile_url),
        fecha_actualizacion = CURRENT_TIMESTAMP,
        busqueda_id = COALESCE(?, busqueda_id)
      WHERE place_id = ?
    `);

    stmt.run(
      negocio.name || negocio.nombre,
      negocio.category || negocio.categoria,
      negocio.rating,
      negocio.reviewCount || negocio.resenas,
      negocio.phone || negocio.telefono,
      negocio.email,
      negocio.website || negocio.sitio_web,
      negocio.address || negocio.direccion,
      negocio.city || negocio.ciudad,
      negocio.socialMedia?.instagram || negocio.instagram,
      negocio.socialMedia?.facebook || negocio.facebook,
      negocio.socialMedia?.whatsapp || negocio.whatsapp,
      typeof negocio.hours === 'object' ? JSON.stringify(negocio.hours) : negocio.hours,
      negocio.profileUrl || negocio.profile_url,
      busquedaId,
      placeId
    );

    return { action: 'updated', id: existente.id };
  }

  const stmt = db.prepare(`
    INSERT INTO negocios (
      place_id, nombre, categoria, rating, resenas, telefono, email,
      sitio_web, direccion, ciudad, estado, pais, latitud, longitud,
      horarios, instagram, facebook, whatsapp, twitter, linkedin,
      youtube, tiktok, profile_url, imagen_url, descripcion,
      precio_nivel, servicios, atributos, busqueda_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
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
    negocio.state || negocio.estado,
    negocio.country || negocio.pais,
    negocio.coordinates?.lat || negocio.latitud,
    negocio.coordinates?.lng || negocio.longitud,
    typeof negocio.hours === 'object' ? JSON.stringify(negocio.hours) : negocio.hours,
    negocio.socialMedia?.instagram || negocio.instagram,
    negocio.socialMedia?.facebook || negocio.facebook,
    negocio.socialMedia?.whatsapp || negocio.whatsapp,
    negocio.socialMedia?.twitter || negocio.twitter,
    negocio.socialMedia?.linkedin || negocio.linkedin,
    negocio.socialMedia?.youtube || negocio.youtube,
    negocio.socialMedia?.tiktok || negocio.tiktok,
    negocio.profileUrl || negocio.profile_url,
    negocio.imageUrl || negocio.imagen_url,
    negocio.description || negocio.descripcion,
    negocio.priceLevel || negocio.precio_nivel,
    negocio.services ? JSON.stringify(negocio.services) : negocio.servicios,
    negocio.attributes ? JSON.stringify(negocio.attributes) : negocio.atributos,
    busquedaId
  );

  actualizarContadores(negocio.city || negocio.ciudad, negocio.country || negocio.pais, negocio.category || negocio.categoria);
  return { action: 'inserted', id: result.lastInsertRowid };
}

function guardarNegocios(negocios, busquedaId = null) {
  const resultados = { nuevos: 0, actualizados: 0, duplicados: 0, errores: 0, ids: [] };

  const guardarTx = db.transaction((negocios) => {
    for (const negocio of negocios) {
      try {
        const result = guardarNegocio(negocio, busquedaId);
        resultados.ids.push(result.id);
        if (result.action === 'inserted') resultados.nuevos++;
        else if (result.action === 'updated') resultados.actualizados++;
        else resultados.duplicados++;
      } catch (error) {
        console.error('Error guardando negocio:', negocio.name, error.message);
        resultados.errores++;
      }
    }
  });

  guardarTx(negocios);
  return resultados;
}

function buscarNegocios(filtros = {}) {
  let query = 'SELECT * FROM negocios WHERE 1=1';
  const params = [];

  if (filtros.ciudad) {
    query += ' AND ciudad LIKE ?';
    params.push('%' + filtros.ciudad + '%');
  }
  if (filtros.categoria) {
    query += ' AND categoria LIKE ?';
    params.push('%' + filtros.categoria + '%');
  }
  if (filtros.minRating) {
    query += ' AND rating >= ?';
    params.push(filtros.minRating);
  }
  if (filtros.minResenas) {
    query += ' AND resenas >= ?';
    params.push(filtros.minResenas);
  }
  if (filtros.conTelefono) {
    query += " AND telefono IS NOT NULL AND telefono != ''";
  }
  if (filtros.conEmail) {
    query += " AND email IS NOT NULL AND email != ''";
  }
  if (filtros.conWebsite) {
    query += " AND sitio_web IS NOT NULL AND sitio_web != ''";
  }
  if (filtros.busqueda) {
    query += ' AND (nombre LIKE ? OR categoria LIKE ? OR direccion LIKE ?)';
    const term = '%' + filtros.busqueda + '%';
    params.push(term, term, term);
  }

  const orderBy = filtros.orderBy || 'fecha_creacion';
  const orderDir = filtros.orderDir || 'DESC';
  query += ' ORDER BY ' + orderBy + ' ' + orderDir;

  if (filtros.limit) {
    query += ' LIMIT ?';
    params.push(filtros.limit);
  }
  if (filtros.offset) {
    query += ' OFFSET ?';
    params.push(filtros.offset);
  }

  return db.prepare(query).all(...params);
}

function obtenerNegocio(id) {
  return db.prepare('SELECT * FROM negocios WHERE id = ?').get(id);
}

function eliminarNegocio(id) {
  return db.prepare('DELETE FROM negocios WHERE id = ?').run(id);
}

function existeNegocio(placeId) {
  const result = db.prepare('SELECT id FROM negocios WHERE place_id = ?').get(placeId);
  return result ? result.id : null;
}

function registrarBusqueda(datos) {
  const stmt = db.prepare(`
    INSERT INTO busquedas (
      tipo_negocio, ciudad, pais, latitud, longitud, radio_km,
      total_encontrados, total_nuevos, total_actualizados, total_duplicados,
      duracion_segundos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    datos.tipoNegocio || datos.businessType,
    datos.ciudad || datos.city,
    datos.pais || datos.country,
    datos.latitud || datos.coordinates?.lat,
    datos.longitud || datos.coordinates?.lng,
    datos.radio || datos.radius,
    datos.totalEncontrados || 0,
    datos.totalNuevos || 0,
    datos.totalActualizados || 0,
    datos.totalDuplicados || 0,
    datos.duracion || 0
  );

  return result.lastInsertRowid;
}

function obtenerHistorialBusquedas(limit = 50) {
  return db.prepare('SELECT * FROM busquedas ORDER BY fecha DESC LIMIT ?').all(limit);
}

function obtenerBusqueda(id) {
  return db.prepare('SELECT * FROM busquedas WHERE id = ?').get(id);
}

function actualizarContadores(ciudad, pais, categoria) {
  if (ciudad) {
    db.prepare(`
      INSERT INTO ciudades (nombre, pais, total_negocios, ultima_busqueda)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(nombre, pais) DO UPDATE SET
        total_negocios = total_negocios + 1,
        ultima_busqueda = CURRENT_TIMESTAMP
    `).run(ciudad, pais);
  }
  if (categoria) {
    db.prepare(`
      INSERT INTO categorias (nombre, total_negocios)
      VALUES (?, 1)
      ON CONFLICT(nombre) DO UPDATE SET
        total_negocios = total_negocios + 1
    `).run(categoria);
  }
}

function obtenerEstadisticas() {
  const stats = {};
  stats.totalNegocios = db.prepare('SELECT COUNT(*) as count FROM negocios').get().count;
  stats.conTelefono = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE telefono IS NOT NULL AND telefono != ''").get().count;
  stats.conEmail = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE email IS NOT NULL AND email != ''").get().count;
  stats.conWebsite = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE sitio_web IS NOT NULL AND sitio_web != ''").get().count;
  stats.conInstagram = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE instagram IS NOT NULL AND instagram != ''").get().count;
  stats.conFacebook = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE facebook IS NOT NULL AND facebook != ''").get().count;
  stats.conWhatsapp = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE whatsapp IS NOT NULL AND whatsapp != ''").get().count;
  stats.totalCiudades = db.prepare('SELECT COUNT(DISTINCT ciudad) as count FROM negocios WHERE ciudad IS NOT NULL').get().count;
  stats.totalCategorias = db.prepare('SELECT COUNT(DISTINCT categoria) as count FROM negocios WHERE categoria IS NOT NULL').get().count;
  stats.totalBusquedas = db.prepare('SELECT COUNT(*) as count FROM busquedas').get().count;

  const avgRating = db.prepare('SELECT AVG(rating) as avg FROM negocios WHERE rating IS NOT NULL').get();
  stats.ratingPromedio = avgRating.avg ? parseFloat(avgRating.avg.toFixed(2)) : 0;

  stats.ultimasBusquedas = db.prepare('SELECT tipo_negocio, ciudad, total_encontrados, fecha FROM busquedas ORDER BY fecha DESC LIMIT 5').all();
  stats.topCiudades = db.prepare('SELECT ciudad, COUNT(*) as total FROM negocios WHERE ciudad IS NOT NULL GROUP BY ciudad ORDER BY total DESC LIMIT 10').all();
  stats.topCategorias = db.prepare('SELECT categoria, COUNT(*) as total FROM negocios WHERE categoria IS NOT NULL GROUP BY categoria ORDER BY total DESC LIMIT 10').all();

  return stats;
}

function obtenerPorCiudad(ciudad) {
  return db.prepare("SELECT * FROM negocios WHERE ciudad LIKE ? ORDER BY rating DESC").all('%' + ciudad + '%');
}

function obtenerPorCategoria(categoria) {
  return db.prepare("SELECT * FROM negocios WHERE categoria LIKE ? ORDER BY rating DESC").all('%' + categoria + '%');
}

function limpiarDuplicados() {
  const result = db.prepare(`
    DELETE FROM negocios
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM negocios
      GROUP BY COALESCE(place_id, nombre || direccion)
    )
  `).run();
  return result.changes;
}

function exportarDatos(filtros = {}) {
  const negocios = buscarNegocios(filtros);
  return negocios.map(n => ({
    nombre: n.nombre,
    categoria: n.categoria,
    rating: n.rating,
    resenas: n.resenas,
    telefono: n.telefono,
    email: n.email,
    sitio_web: n.sitio_web,
    direccion: n.direccion,
    ciudad: n.ciudad,
    instagram: n.instagram,
    facebook: n.facebook,
    whatsapp: n.whatsapp,
    horarios: n.horarios,
    profile_url: n.profile_url,
    fecha_creacion: n.fecha_creacion
  }));
}

export {
  db,
  initializeDatabase,
  guardarNegocio,
  guardarNegocios,
  buscarNegocios,
  obtenerNegocio,
  eliminarNegocio,
  existeNegocio,
  registrarBusqueda,
  obtenerHistorialBusquedas,
  obtenerBusqueda,
  obtenerEstadisticas,
  obtenerPorCiudad,
  obtenerPorCategoria,
  limpiarDuplicados,
  exportarDatos
};

export default {
  guardarNegocio,
  guardarNegocios,
  buscarNegocios,
  obtenerNegocio,
  eliminarNegocio,
  existeNegocio,
  registrarBusqueda,
  obtenerHistorialBusquedas,
  obtenerEstadisticas,
  obtenerPorCiudad,
  obtenerPorCategoria,
  limpiarDuplicados,
  exportarDatos
};
