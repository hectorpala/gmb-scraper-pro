import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Exportador de datos a CSV y JSON
 */
export class DataExporter {
  constructor(outputDir = null) {
    this.outputDir = outputDir || path.join(__dirname, '..', 'output');
    this.ensureOutputDir();
  }

  /**
   * Asegura que el directorio de salida exista
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Genera un nombre de archivo unico basado en los parametros de busqueda
   */
  generateFilename(businessType, city, country, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sanitize = (str) => str.toLowerCase().replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    return sanitize(businessType) + '_' + sanitize(city) + '_' + sanitize(country) + '_' + timestamp + '.' + extension;
  }

  /**
   * Exporta los datos a formato JSON
   */
  toJSON(businesses, businessType, city, country) {
    const filename = this.generateFilename(businessType, city, country, 'json');
    const filepath = path.join(this.outputDir, filename);

    const exportData = {
      metadata: {
        query: {
          businessType,
          city,
          country
        },
        totalResults: businesses.length,
        exportedAt: new Date().toISOString()
      },
      businesses
    };

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8');
    
    return {
      filename,
      filepath,
      size: fs.statSync(filepath).size
    };
  }

  /**
   * Exporta los datos a formato CSV
   */
  toCSV(businesses, businessType, city, country) {
    const filename = this.generateFilename(businessType, city, country, 'csv');
    const filepath = path.join(this.outputDir, filename);

    if (businesses.length === 0) {
      fs.writeFileSync(filepath, '', 'utf-8');
      return { filename, filepath, size: 0 };
    }

    // Definir las columnas del CSV
    const columns = [
      'position',
      'name',
      'rating',
      'reviewCount',
      'category',
      'priceLevel',
      'address',
      'phone',
      'website',
      'hours',
      'latitude',
      'longitude',
      'plusCode',
      'profileUrl',
      'scrapedAt'
    ];

    // Funcion para escapar valores CSV
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    // Crear encabezado
    const header = columns.join(',');

    // Crear filas
    const rows = businesses.map((business) => {
      return columns.map((col) => {
        if (col === 'latitude') {
          return escapeCSV(business.coordinates?.lat);
        }
        if (col === 'longitude') {
          return escapeCSV(business.coordinates?.lng);
        }
        return escapeCSV(business[col]);
      }).join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    fs.writeFileSync(filepath, csvContent, 'utf-8');

    return {
      filename,
      filepath,
      size: fs.statSync(filepath).size
    };
  }

  /**
   * Exporta a ambos formatos
   */
  exportAll(businesses, businessType, city, country) {
    const jsonResult = this.toJSON(businesses, businessType, city, country);
    const csvResult = this.toCSV(businesses, businessType, city, country);

    return {
      json: jsonResult,
      csv: csvResult
    };
  }

  /**
   * Lista los archivos exportados
   */
  listExports() {
    const files = fs.readdirSync(this.outputDir);
    return files.map((file) => {
      const filepath = path.join(this.outputDir, file);
      const stats = fs.statSync(filepath);
      return {
        filename: file,
        filepath,
        size: stats.size,
        createdAt: stats.birthtime
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Obtiene la ruta de un archivo exportado
   */
  getFilePath(filename) {
    return path.join(this.outputDir, filename);
  }
}

export default DataExporter;
