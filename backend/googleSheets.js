import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SPREADSHEET_CONFIG_PATH = path.join(__dirname, 'spreadsheet_config.json');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const OAUTH_PORT = parseInt(process.env.OAUTH_PORT) || 3333;
const REDIRECT_URI = 'http://localhost:' + OAUTH_PORT;
const MASTER_SHEET_NAME = 'GMB Scraper - Negocios';

// Anchos de columna predefinidos (en pixeles)
const COLUMN_WIDTHS = {
  0: 40,   // #
  1: 200,  // Nombre
  2: 150,  // Categoria
  3: 60,   // Rating
  4: 70,   // Resenas
  5: 120,  // Telefono
  6: 180,  // Email
  7: 180,  // Sitio Web
  8: 250,  // Direccion
  9: 150,  // Instagram
  10: 150, // Facebook
  11: 120, // WhatsApp
  12: 150, // Horarios
  13: 200, // URL Perfil
  14: 100  // Fecha
};

const HEADERS = [
  '#', 'Nombre', 'Categoria', 'Rating', 'Resenas',
  'Telefono', 'Email', 'Sitio Web', 'Direccion',
  'Instagram', 'Facebook', 'WhatsApp',
  'Horarios', 'URL Perfil', 'Fecha'
];

export class GoogleSheetsExporter {
  constructor() {
    this.sheets = null;
    this.oauth2Client = null;
    this.authServer = null;
    this.spreadsheetId = null;
  }

  isConfigured() {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
  }

  isAuthenticated() { return fs.existsSync(TOKEN_PATH); }

  async initialize() {
    if (!this.isConfigured()) throw new Error('Credenciales no configuradas');

    this.oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

    if (this.isAuthenticated()) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      this.oauth2Client.setCredentials(token);
      this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
      if (fs.existsSync(SPREADSHEET_CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(SPREADSHEET_CONFIG_PATH, 'utf-8'));
        this.spreadsheetId = config.spreadsheetId;
      }
      return true;
    }
    return false;
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  }

  startAuthServer() {
    return new Promise((resolve, reject) => {
      this.authServer = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost:' + OAUTH_PORT);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          if (error) { res.writeHead(400); res.end('Error: ' + error); this.stopAuthServer(); reject(new Error(error)); return; }
          if (code) {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
            this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;background:#e6f4ea"><h1 style="color:#34a853">Autorizado!</h1></body></html>');
            this.stopAuthServer();
            resolve(true);
          }
        } catch (err) { res.writeHead(500); res.end('Error: ' + err.message); this.stopAuthServer(); reject(err); }
      });
      this.authServer.listen(OAUTH_PORT, () => console.log('OAuth en puerto ' + OAUTH_PORT));
      this.authServer.on('error', reject);
    });
  }

  stopAuthServer() { if (this.authServer) { this.authServer.close(); this.authServer = null; } }
  saveSpreadsheetConfig() { fs.writeFileSync(SPREADSHEET_CONFIG_PATH, JSON.stringify({ spreadsheetId: this.spreadsheetId, updatedAt: new Date().toISOString() })); }

  // Sanitizar nombre de ciudad para usarlo como nombre de pestana
  sanitizeSheetName(city) {
    // Google Sheets no permite: : \ / ? * [ ]
    // Maximo 100 caracteres
    return city
      .replace(/[:\\/?*\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  async getOrCreateSpreadsheet() {
    if (this.spreadsheetId) {
      try {
        await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        return this.spreadsheetId;
      }
      catch (err) { this.spreadsheetId = null; }
    }

    console.log('Creando spreadsheet maestro...');
    const response = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title: MASTER_SHEET_NAME },
        sheets: [{ properties: { title: 'Inicio', gridProperties: { frozenRowCount: 1 } } }]
      }
    });

    this.spreadsheetId = response.data.spreadsheetId;
    this.saveSpreadsheetConfig();

    // Agregar instrucciones en la hoja de inicio
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: 'Inicio!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [
        ['GMB Scraper - Base de Datos'],
        [''],
        ['Cada ciudad tiene su propia pestana.'],
        ['Los resultados mas recientes aparecen arriba.'],
        [''],
        ['Creado: ' + new Date().toLocaleString('es-MX')]
      ]}
    });

    return this.spreadsheetId;
  }

  // Obtener o crear pestana para una ciudad especifica
  async getOrCreateCitySheet(spreadsheetId, city) {
    const sheetName = this.sanitizeSheetName(city);

    // Obtener todas las pestanas del spreadsheet
    const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
    const existingSheet = spreadsheet.data.sheets.find(
      s => s.properties.title.toLowerCase() === sheetName.toLowerCase()
    );

    if (existingSheet) {
      console.log('Usando pestana existente: ' + sheetName);
      return { sheetId: existingSheet.properties.sheetId, sheetName, isNew: false };
    }

    // Crear nueva pestana para la ciudad
    console.log('Creando nueva pestana: ' + sheetName);
    const addSheetResponse = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: { frozenRowCount: 1 }
            }
          }
        }]
      }
    });

    const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

    // Agregar headers a la nueva pestana
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetName + '!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] }
    });

    // Aplicar formato a headers y anchos de columna
    const formatRequests = [
      {
        repeatCell: {
          range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
        }
      }
    ];

    // Agregar anchos de columna
    for (const [colIndex, width] of Object.entries(COLUMN_WIDTHS)) {
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: parseInt(colIndex), endIndex: parseInt(colIndex) + 1 },
          properties: { pixelSize: width },
          fields: 'pixelSize'
        }
      });
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests }
    });

    return { sheetId: newSheetId, sheetName, isNew: true };
  }

  generateBatchId() {
    const now = new Date();
    return now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  }

  // Funcion helper para marcar valores vacios
  val(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string' && value.trim() === '') return '-';
    return value;
  }

  async exportToSheets(businesses, businessType, city, country) {
    if (!this.sheets) throw new Error('No autenticado');

    const spreadsheetId = await this.getOrCreateSpreadsheet();
    const batchId = this.generateBatchId();
    const scrapedAt = new Date().toLocaleString('es-MX', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // Obtener o crear pestana para esta ciudad
    const citySheetName = city + ', ' + country;
    const { sheetId, sheetName } = await this.getOrCreateCitySheet(spreadsheetId, citySheetName);

    const rows = businesses.map((b, index) => [
      index + 1,
      this.val(b.name),
      this.val(b.category),
      this.val(b.rating),
      this.val(b.reviewCount),
      this.val(b.phone),
      this.val(b.email),
      this.val(b.website),
      this.val(b.address),
      this.val(b.socialMedia?.instagram),
      this.val(b.socialMedia?.facebook),
      this.val(b.socialMedia?.whatsapp),
      this.val(b.hours),
      this.val(b.profileUrl),
      scrapedAt.split(',')[0]
    ]);

    // Insertar filas al inicio (fila 2, despues del header)
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + rows.length },
            inheritFromBefore: false
          }
        }]
      }
    });

    const appendResult = await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'" + sheetName + "'!A2",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    // Aplicar bordes y alineacion a las nuevas filas
    const updatedRange = appendResult.data.updates.updatedRange;
    const rangeMatch = updatedRange.match(/!A(\d+):/);
    if (rangeMatch) {
      const startRow = parseInt(rangeMatch[1]) - 1;
      const endRow = startRow + rows.length;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateBorders: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 15 },
                top: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                bottom: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                left: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                right: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                innerHorizontal: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
                innerVertical: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } }
              }
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 1 },
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                fields: 'userEnteredFormat.horizontalAlignment'
              }
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 3, endColumnIndex: 5 },
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                fields: 'userEnteredFormat.horizontalAlignment'
              }
            }
          ]
        }
      });
    }

    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit#gid=' + sheetId;
    console.log('Agregadas ' + businesses.length + ' filas a pestana "' + sheetName + '" (Batch: ' + batchId + ')');

    return { spreadsheetId, spreadsheetUrl, title: MASTER_SHEET_NAME, sheetName, rowCount: businesses.length, batchId };
  }
}

export default GoogleSheetsExporter;
