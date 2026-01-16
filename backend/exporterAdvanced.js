import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Exportador de datos avanzado - Soporta 40+ campos
 */
export class DataExporterAdvanced {
  constructor(outputDir = null) {
    this.outputDir = outputDir || path.join(__dirname, '..', 'output');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  generateFilename(businessType, city, country, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sanitize = (str) => str.toLowerCase().replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    return sanitize(businessType) + '_' + sanitize(city) + '_' + sanitize(country) + '_' + timestamp + '.' + extension;
  }

  toJSON(businesses, businessType, city, country, stats = null) {
    const filename = this.generateFilename(businessType, city, country, 'json');
    const filepath = path.join(this.outputDir, filename);

    const exportData = {
      metadata: {
        query: { businessType, city, country },
        totalResults: businesses.length,
        stats: stats || this.calculateStats(businesses),
        exportedAt: new Date().toISOString(),
        version: '2.0'
      },
      businesses
    };

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8');
    return { filename, filepath, size: fs.statSync(filepath).size };
  }

  toCSV(businesses, businessType, city, country) {
    const filename = this.generateFilename(businessType, city, country, 'csv');
    const filepath = path.join(this.outputDir, filename);

    if (businesses.length === 0) {
      fs.writeFileSync(filepath, '', 'utf-8');
      return { filename, filepath, size: 0 };
    }

    // Columnas extendidas
    const columns = [
      'position', 'placeId', 'name', 'rating', 'reviewCount',
      'category', 'categories', 'priceLevel',
      'address', 'phone', 'email', 'allEmails', 'website',
      'hours', 'isOpenNow',
      'latitude', 'longitude', 'plusCode',
      'delivery', 'takeout', 'dineIn', 'wifi', 'wheelchair', 'parking',
      'instagram', 'facebook', 'whatsapp', 'twitter', 'linkedin', 'youtube', 'tiktok',
      'menuUrl', 'reservationUrl', 'orderUrl',
      'mainPhoto', 'photosCount',
      'topReviewText', 'topReviewRating',
      'profileUrl', 'claimedBusiness', 'scrapedAt'
    ];

    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const header = columns.join(',');

    const rows = businesses.map((biz) => {
      return columns.map((col) => {
        // Coordenadas
        if (col === 'latitude') return escapeCSV(biz.coordinates?.lat);
        if (col === 'longitude') return escapeCSV(biz.coordinates?.lng);
        // Categorias como string
        if (col === 'categories') return escapeCSV((biz.categories || []).join('; '));
        // Emails como string
        if (col === 'allEmails') return escapeCSV((biz.allEmails || []).join('; '));
        // Atributos
        if (col === 'delivery') return escapeCSV(biz.attributes?.delivery ? 'Si' : '');
        if (col === 'takeout') return escapeCSV(biz.attributes?.takeout ? 'Si' : '');
        if (col === 'dineIn') return escapeCSV(biz.attributes?.dineIn ? 'Si' : '');
        if (col === 'wifi') return escapeCSV(biz.attributes?.wifi ? 'Si' : '');
        if (col === 'wheelchair') return escapeCSV(biz.attributes?.wheelchair ? 'Si' : '');
        if (col === 'parking') return escapeCSV(biz.attributes?.parking ? 'Si' : '');
        // Redes sociales
        if (col === 'instagram') return escapeCSV(biz.socialMedia?.instagram);
        if (col === 'facebook') return escapeCSV(biz.socialMedia?.facebook);
        if (col === 'whatsapp') return escapeCSV(biz.socialMedia?.whatsapp);
        if (col === 'twitter') return escapeCSV(biz.socialMedia?.twitter);
        if (col === 'linkedin') return escapeCSV(biz.socialMedia?.linkedin);
        if (col === 'youtube') return escapeCSV(biz.socialMedia?.youtube);
        if (col === 'tiktok') return escapeCSV(biz.socialMedia?.tiktok);
        // Reviews
        if (col === 'topReviewText') return escapeCSV(biz.topReviews?.[0]?.text);
        if (col === 'topReviewRating') return escapeCSV(biz.topReviews?.[0]?.rating);
        // Booleans
        if (col === 'isOpenNow') return escapeCSV(biz.isOpenNow === true ? 'Abierto' : biz.isOpenNow === false ? 'Cerrado' : '');
        if (col === 'claimedBusiness') return escapeCSV(biz.claimedBusiness ? 'Si' : '');
        // Default
        return escapeCSV(biz[col]);
      }).join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    fs.writeFileSync(filepath, csvContent, 'utf-8');

    return { filename, filepath, size: fs.statSync(filepath).size };
  }

  toExcel(businesses, businessType, city, country) {
    // Formato simple de Excel (CSV con BOM para Excel)
    const filename = this.generateFilename(businessType, city, country, 'xlsx.csv');
    const filepath = path.join(this.outputDir, filename);

    const csvResult = this.toCSV(businesses, businessType, city, country);
    const content = fs.readFileSync(csvResult.filepath, 'utf-8');
    
    // Agregar BOM para Excel
    const bom = '\uFEFF';
    fs.writeFileSync(filepath, bom + content, 'utf-8');
    
    return { filename, filepath, size: fs.statSync(filepath).size };
  }

  exportAll(businesses, businessType, city, country, stats = null) {
    const jsonResult = this.toJSON(businesses, businessType, city, country, stats);
    const csvResult = this.toCSV(businesses, businessType, city, country);

    return { json: jsonResult, csv: csvResult };
  }

  calculateStats(businesses) {
    return {
      total: businesses.length,
      withPhone: businesses.filter(b => b.phone).length,
      withEmail: businesses.filter(b => b.email).length,
      withWebsite: businesses.filter(b => b.website).length,
      withInstagram: businesses.filter(b => b.socialMedia?.instagram).length,
      withFacebook: businesses.filter(b => b.socialMedia?.facebook).length,
      withWhatsapp: businesses.filter(b => b.socialMedia?.whatsapp).length,
      avgRating: businesses.filter(b => b.rating).length > 0
        ? (businesses.filter(b => b.rating).reduce((sum, b) => sum + b.rating, 0) / businesses.filter(b => b.rating).length).toFixed(2)
        : null,
      withDelivery: businesses.filter(b => b.attributes?.delivery).length,
      withReservations: businesses.filter(b => b.reservationUrl).length
    };
  }

  listExports() {
    const files = fs.readdirSync(this.outputDir);
    return files.map((file) => {
      const filepath = path.join(this.outputDir, file);
      const stats = fs.statSync(filepath);
      return { filename: file, filepath, size: stats.size, createdAt: stats.birthtime };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  getFilePath(filename) {
    return path.join(this.outputDir, filename);
  }
}

export default DataExporterAdvanced;
