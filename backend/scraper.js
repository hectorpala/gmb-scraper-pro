import puppeteer from 'puppeteer';
import os from 'os';
import fs from 'fs';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

const BLOCKED_RESOURCES = ['image', 'media', 'font', 'stylesheet'];
const BLOCKED_DOMAINS = [
  'googleadservices.com', 'googlesyndication.com', 'doubleclick.net',
  'google-analytics.com', 'googletagmanager.com', 'facebook.com',
  'facebook.net', 'analytics', 'tracking'
];

const SCROLL_CONFIG = {
  maxAttempts: 30,
  noGrowthLimit: 3,
  totalTimeout: 15000,
  stabilizeTimeout: 2000
};

const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelay: 1000
};

// Detectar bloqueos/captcha
async function checkForBlock(page) {
  const url = page.url();
  if (url.includes('/sorry/') || url.includes('google.com/sorry')) {
    return { blocked: true, reason: 'CAPTCHA detectado (URL /sorry/)' };
  }

  const blockIndicators = await page.evaluate(() => {
    const text = document.body?.innerText?.toLowerCase() || '';
    return {
      captcha: text.includes('unusual traffic') || text.includes('trafico inusual') ||
               text.includes('not a robot') || text.includes('no eres un robot'),
      blocked: text.includes('blocked') || text.includes('bloqueado') ||
               text.includes('access denied') || text.includes('acceso denegado'),
      rateLimit: text.includes('rate limit') || text.includes('too many requests')
    };
  });

  if (blockIndicators.captcha) return { blocked: true, reason: 'CAPTCHA detectado' };
  if (blockIndicators.blocked) return { blocked: true, reason: 'Acceso bloqueado' };
  if (blockIndicators.rateLimit) return { blocked: true, reason: 'Rate limit' };
  return { blocked: false };
}

// Reintento con backoff
async function withRetry(fn, maxRetries = RETRY_CONFIG.maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        const delay = RETRY_CONFIG.baseDelay * attempt;
        console.log('    -> Reintento ' + attempt + '/' + maxRetries + ' en ' + delay + 'ms');
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function extractPlaceId(url) {
  const match = url.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i);
  return match ? match[1] : null;
}

// Extraer nombre desde URL de Google Maps
function extractNameFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/maps\/place\/([^\/]+)/);
  if (match) {
    return decodeURIComponent(match[1]).replace(/\+/g, ' ');
  }
  return null;
}

function getChromePath() {
  const platform = os.platform();
  const chromePaths = {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    linux: '/usr/bin/google-chrome'
  };
  const systemChrome = chromePaths[platform];
  if (systemChrome && fs.existsSync(systemChrome)) return systemChrome;
  
  const altPaths = {
    darwin: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    win32: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    linux: '/usr/bin/chromium-browser'
  };
  const altPath = altPaths[platform];
  if (altPath && fs.existsSync(altPath)) return altPath;
  return undefined;
}

function deduplicateResults(results) {
  const seen = new Map();
  const unique = [];
  let duplicates = 0;

  for (const biz of results) {
    const key = biz.placeId || ((biz.name || '') + '|' + (biz.address || '')).toLowerCase().trim();
    if (!key || key === '|') { unique.push(biz); continue; }
    if (seen.has(key)) { duplicates++; continue; }
    seen.set(key, true);
    unique.push(biz);
  }
  unique.forEach((biz, idx) => biz.position = idx + 1);
  if (duplicates > 0) console.log('Deduplicados:', duplicates, 'registros');
  return unique;
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('Iniciando navegador...');
    const executablePath = getChromePath();
    if (executablePath) {
      console.log('Usando Chrome del sistema:', os.platform());
    } else {
      console.log('Usando Chrome de Puppeteer');
    }
    const launchOptions = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };
    if (executablePath) launchOptions.executablePath = executablePath;
    browserInstance = await puppeteer.launch(launchOptions);
  }
  return browserInstance;
}

async function waitForStableCount(page, selector, timeout = 2000) {
  const startTime = Date.now();
  let lastCount = 0;
  let stableIterations = 0;
  while (Date.now() - startTime < timeout) {
    const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    if (count === lastCount) {
      stableIterations++;
      if (stableIterations >= 2) return count;
    } else {
      stableIterations = 0;
      lastCount = count;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return lastCount;
}

async function smartScroll(page, maxResults) {
  const cardSelector = 'div[role="feed"] a[href*="/maps/place/"]';
  const startTime = Date.now();
  let lastCount = 0;
  let noGrowthCount = 0;
  let attempts = 0;

  console.log('Scroll inteligente iniciado...');
  while (true) {
    attempts++;
    if (attempts > SCROLL_CONFIG.maxAttempts) { console.log('-> Salida: max intentos'); break; }
    if (Date.now() - startTime > SCROLL_CONFIG.totalTimeout) { console.log('-> Salida: timeout'); break; }
    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) feed.scrollBy(0, 800);
    });
    const count = await waitForStableCount(page, cardSelector, SCROLL_CONFIG.stabilizeTimeout);
    if (count >= maxResults) { console.log('-> Salida: max resultados (' + count + ')'); break; }
    if (count === lastCount) {
      noGrowthCount++;
      if (noGrowthCount >= SCROLL_CONFIG.noGrowthLimit) { console.log('-> Salida: sin crecimiento (' + count + ')'); break; }
    } else {
      if (count > lastCount) console.log('   Cargados:', count);
      noGrowthCount = 0;
      lastCount = count;
    }
  }
  console.log('Scroll completado en ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
  return lastCount;
}

export class GoogleMapsScraper {
  constructor() {
    this.maxResults = 50;
  }

  async scrape(businessType, city, country, maxResults = 50) {
    this.maxResults = maxResults;
    const browser = await getBrowser();
    const context = browser.createBrowserContext
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      if (BLOCKED_RESOURCES.includes(resourceType)) return req.abort();
      if (BLOCKED_DOMAINS.some(domain => url.includes(domain))) return req.abort();
      req.continue();
    });

    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    console.log('User-Agent:', userAgent.substring(0, 50) + '...');

    try {
      await page.setViewport({ width: 1400, height: 900 });
      console.log('Buscando:', businessType, 'en', city, country);

      const query = encodeURIComponent(businessType + ' en ' + city + ', ' + country);
      await page.goto('https://www.google.com/maps/search/' + query, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForSelector('div[role="feed"]', { timeout: 10000 });

      // Verificar bloqueo/captcha
      const blockCheck = await checkForBlock(page);
      if (blockCheck.blocked) {
        throw new Error('BLOQUEADO: ' + blockCheck.reason + '. Intenta mas tarde o usa otra IP.');
      }

      const acceptBtn = await page.$('button[aria-label*="Aceptar"], button[aria-label*="Accept"]');
      if (acceptBtn) await acceptBtn.click().catch(() => {});

      await smartScroll(page, this.maxResults);

      // Extraccion mejorada de links con multiples selectores
      const businessLinks = await page.evaluate((max) => {
        const links = [];
        const cards = document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]');
        
        for (let i = 0; i < Math.min(cards.length, max); i++) {
          const card = cards[i];
          let name = null;
          
          // Selectores en orden de prioridad
          const selectors = [
            '.fontHeadlineSmall',
            '[class*="qBF1Pd"]',
            '[class*="fontHeadline"]',
            'div[class*="NrDZNb"]',
            'div[class*="rgM]"'
          ];
          
          for (const sel of selectors) {
            const el = card.querySelector(sel);
            if (el && el.textContent && el.textContent.trim().length > 1) {
              name = el.textContent.trim();
              break;
            }
          }
          
          // Fallback: aria-label del link
          if (!name) {
            const ariaLabel = card.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.length > 1) {
              name = ariaLabel;
            }
          }
          
          // Fallback: extraer de URL
          if (!name && card.href) {
            const match = card.href.match(/\/maps\/place\/([^\/]+)/);
            if (match) {
              name = decodeURIComponent(match[1]).replace(/\+/g, ' ');
            }
          }
          
          links.push({
            name: name || 'Sin nombre',
            href: card.href
          });
        }
        return links;
      }, this.maxResults);

      console.log('Extrayendo detalles de', businessLinks.length, 'negocios...');

      const results = [];

      for (let i = 0; i < businessLinks.length; i++) {
        const biz = businessLinks[i];
        console.log('[' + (i + 1) + '/' + businessLinks.length + '] ' + biz.name);

        try {
          const details = await withRetry(async () => {
            await page.evaluate((href) => {
              const link = document.querySelector('a[href="' + href + '"]');
              if (link) link.click();
            }, biz.href);

            // Check block on each business
            const midCheck = await checkForBlock(page);
            if (midCheck.blocked) throw new Error(midCheck.reason);

            await page.waitForSelector('h1', { timeout: 3000 }).catch(() => {});
          await waitForStableCount(page, 'button[data-item-id]', 1500);

          const currentUrl = page.url();
          const placeId = extractPlaceId(currentUrl);

          const details = await page.evaluate(() => {
            const data = {
              name: null, rating: null, reviewCount: null, category: null,
              categories: [], address: null, phone: null, website: null,
              hours: null, plusCode: null, coordinates: null, services: [],
              profileUrl: window.location.href
            };

            // Nombre: multiples selectores
            const nameSelectors = [
              'h1.DUwDvf',
              'h1[class*="fontHeadlineLarge"]',
              'h1[class*="headline"]',
              'div[role="main"] h1',
              'h1'
            ];
            for (const sel of nameSelectors) {
              const el = document.querySelector(sel);
              if (el && el.textContent && el.textContent.trim().length > 1) {
                data.name = el.textContent.trim();
                break;
              }
            }
            
            // Fallback: extraer de URL
            if (!data.name) {
              const match = window.location.href.match(/\/maps\/place\/([^\/]+)/);
              if (match) {
                data.name = decodeURIComponent(match[1]).replace(/\+/g, ' ');
              }
            }

            const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
            if (ratingEl) data.rating = parseFloat(ratingEl.textContent.replace(',', '.'));

            const reviewEl = document.querySelector('div.F7nice span[aria-label*="opiniones"], div.F7nice span[aria-label*="reviews"]');
            if (reviewEl) {
              const m = reviewEl.getAttribute('aria-label').match(/([\d,\.]+)/);
              if (m) data.reviewCount = parseInt(m[1].replace(/[,\.]/g, ''));
            }

            document.querySelectorAll('button[jsaction*="category"]').forEach((btn, idx) => {
              const cat = btn.textContent?.trim();
              if (cat) { if (idx === 0) data.category = cat; data.categories.push(cat); }
            });

            const phoneBtn = document.querySelector('button[data-item-id^="phone:"]');
            if (phoneBtn) {
              const phoneText = phoneBtn.querySelector('.Io6YTe, .fontBodyMedium, span[jstcache]');
              data.phone = phoneText?.textContent?.trim();
              if (!data.phone) {
                const dataId = phoneBtn.getAttribute('data-item-id');
                const match = dataId.match(/phone:tel:([^\s]+)/);
                if (match) data.phone = match[1].replace(/\+52/, '');
              }
            }
            if (!data.phone) {
              const phoneByLabel = document.querySelector('button[aria-label*="Teléfono:"], button[aria-label*="Phone:"]');
              if (phoneByLabel) {
                const label = phoneByLabel.getAttribute('aria-label');
                const match = label.match(/(?:Teléfono|Phone):\s*([^\s]+)/i);
                if (match) data.phone = match[1];
              }
            }
            if (!data.phone) {
              const telLink = document.querySelector('a[href^="tel:"]');
              if (telLink) data.phone = telLink.href.replace('tel:', '').replace(/\+52/, '');
            }

            const addrBtn = document.querySelector('button[data-item-id="address"]');
            if (addrBtn) data.address = addrBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim();

            const webBtn = document.querySelector('a[data-item-id="authority"]');
            if (webBtn) data.website = webBtn.href;

            const hoursBtn = document.querySelector('button[data-item-id="oh"]');
            if (hoursBtn) data.hours = hoursBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim()?.split('Ver más')[0]?.trim();

            const plusCodeBtn = document.querySelector('button[data-item-id="oloc"]');
            if (plusCodeBtn) data.plusCode = plusCodeBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim();

            const url = window.location.href;
            const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (coordMatch) data.coordinates = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };

            document.querySelectorAll('[data-item-id^="place-info-links"]').forEach(el => {
              const text = el.textContent?.trim();
              if (text) data.services.push(text);
            });

            return data;
          });

          // Fallback final: usar nombre del link si details.name esta vacio
          if (!details.name || details.name === 'Sin nombre') {
            details.name = biz.name !== 'Sin nombre' ? biz.name : extractNameFromUrl(biz.href);
          }

            return extractedDetails;
          }); // end withRetry

          const currentUrl = page.url();
          const placeId = extractPlaceId(currentUrl);

          if (details.name) console.log('    -> Nombre:', details.name);
          if (details.phone) console.log('    -> Tel:', details.phone);

          results.push({
            position: i + 1,
            placeId,
            ...details,
            scrapedAt: new Date().toISOString()
          });

        } catch (err) {
          // Si es bloqueo, abortar todo
          if (err.message && err.message.includes('BLOQUEADO')) {
            console.error('\n*** ' + err.message + ' ***\n');
            break;
          }
          const fallbackName = biz.name !== 'Sin nombre' ? biz.name : extractNameFromUrl(biz.href);
          results.push({
            position: i + 1,
            placeId: null,
            name: fallbackName,
            profileUrl: biz.href,
            scrapedAt: new Date().toISOString()
          });
        }
      }

      const uniqueResults = deduplicateResults(results);
      const phonesFound = uniqueResults.filter(r => r.phone).length;
      const namesFound = uniqueResults.filter(r => r.name && r.name !== 'Sin nombre').length;
      
      console.log('Final:', uniqueResults.length, 'unicos |', namesFound, 'con nombre |', phonesFound, 'con telefono');
      return uniqueResults;

    } finally {
      await context.close();
    }
  }

  async preview(businessType, city, country, maxResults = 50) {
    const browser = await getBrowser();
    const context = browser.createBrowserContext
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      if (BLOCKED_RESOURCES.includes(resourceType)) return req.abort();
      if (BLOCKED_DOMAINS.some(domain => url.includes(domain))) return req.abort();
      req.continue();
    });

    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);

    try {
      await page.setViewport({ width: 1400, height: 900 });
      console.log('Preview:', businessType, 'en', city, country);

      const query = encodeURIComponent(businessType + ' en ' + city + ', ' + country);
      await page.goto('https://www.google.com/maps/search/' + query, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForSelector('div[role="feed"]', { timeout: 10000 });

      const blockCheck = await checkForBlock(page);
      if (blockCheck.blocked) {
        throw new Error('BLOQUEADO: ' + blockCheck.reason);
      }

      const acceptBtn = await page.$('button[aria-label*="Aceptar"], button[aria-label*="Accept"]');
      if (acceptBtn) await acceptBtn.click().catch(() => {});

      await smartScroll(page, maxResults);

      const previewData = await page.evaluate((max) => {
        const names = [];
        const cards = document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]');

        for (let i = 0; i < Math.min(cards.length, max); i++) {
          const card = cards[i];
          let name = null;

          const selectors = ['.fontHeadlineSmall', '[class*="qBF1Pd"]', '[class*="fontHeadline"]'];
          for (const sel of selectors) {
            const el = card.querySelector(sel);
            if (el && el.textContent && el.textContent.trim().length > 1) {
              name = el.textContent.trim();
              break;
            }
          }

          if (!name) {
            const ariaLabel = card.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.length > 1) name = ariaLabel;
          }

          if (name) names.push(name);
        }
        return { count: cards.length, sampleNames: names.slice(0, 5) };
      }, maxResults);

      console.log('Preview completado:', previewData.count, 'negocios encontrados');
      return previewData;

    } finally {
      await context.close();
    }
  }
}

process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit();
});

export default GoogleMapsScraper;
