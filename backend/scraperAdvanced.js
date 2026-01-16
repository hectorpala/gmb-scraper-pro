/**
 * GMB Scraper Pro - Modulo de Scraping Avanzado
 * Extrae 40+ campos de informacion de negocios de Google Maps
 */

import puppeteer from 'puppeteer';
import os from 'os';
import fs from 'fs';
import {
  SCRAPER_CONFIG,
  USER_AGENTS,
  BLOCKED_RESOURCES,
  BLOCKED_DOMAINS,
  SELECTORS,
  PATTERNS
} from './config/scraper.config.js';

// UTILIDADES
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function extractPlaceId(url) {
  const match = url.match(PATTERNS.placeId);
  return match ? match[1] : null;
}

function extractNameFromUrl(url) {
  if (!url) return null;
  const match = url.match(PATTERNS.nameFromUrl);
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// BROWSER MANAGER
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };
    if (executablePath) launchOptions.executablePath = executablePath;
    browserInstance = await puppeteer.launch(launchOptions);
  }
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// SCROLL INTELIGENTE
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
    await delay(100);
  }
  return lastCount;
}

async function smartScroll(page, maxResults) {
  const scroll = SCRAPER_CONFIG.scroll;
  const cardSelector = SELECTORS.businessCard;
  const startTime = Date.now();
  let lastCount = 0;
  let noGrowthCount = 0;
  let attempts = 0;

  console.log('Scroll inteligente iniciado...');
  while (true) {
    attempts++;
    if (attempts > scroll.maxAttempts) {
      console.log('-> Salida: max intentos');
      break;
    }
    if (Date.now() - startTime > scroll.totalTimeout) {
      console.log('-> Salida: timeout');
      break;
    }

    await page.evaluate((amount) => {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) feed.scrollBy(0, amount);
    }, scroll.scrollAmount);

    const count = await waitForStableCount(page, cardSelector, scroll.stabilizeTimeout);

    if (count >= maxResults) {
      console.log('-> Salida: max resultados (' + count + ')');
      break;
    }
    if (count === lastCount) {
      noGrowthCount++;
      if (noGrowthCount >= scroll.noGrowthLimit) {
        console.log('-> Salida: sin crecimiento (' + count + ')');
        break;
      }
    } else {
      if (count > lastCount) console.log('   Cargados:', count);
      noGrowthCount = 0;
      lastCount = count;
    }
  }
  console.log('Scroll completado en ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
  return lastCount;
}

export { getBrowser, closeBrowser, smartScroll, waitForStableCount, deduplicateResults, extractPlaceId, extractNameFromUrl, getRandomUserAgent };

// EXTRACTOR DE DATOS EXTENDIDO
async function extractBusinessDetails(page) {
  return await page.evaluate((SELECTORS) => {
    const data = {
      name: null, rating: null, reviewCount: null, category: null, categories: [],
      address: null, phone: null, website: null,
      coordinates: null, plusCode: null,
      hours: null, hoursDetailed: [], isOpenNow: null,
      priceLevel: null,
      services: [],
      attributes: {
        delivery: false, takeout: false, dineIn: false, curbside: false,
        wheelchair: false, wifi: false, parking: false
      },
      reservationUrl: null, menuUrl: null, orderUrl: null,
      mainPhoto: null, photosCount: 0,
      topReviews: [],
      profileUrl: window.location.href,
      claimedBusiness: false
    };

    // NOMBRE
    const nameSelectors = SELECTORS.name;
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 1) {
        data.name = el.textContent.trim();
        break;
      }
    }
    if (!data.name) {
      const match = window.location.href.match(/\/maps\/place\/([^\/]+)/);
      if (match) data.name = decodeURIComponent(match[1]).replace(/\+/g, ' ');
    }

    // RATING
    const ratingEl = document.querySelector(SELECTORS.rating);
    if (ratingEl) {
      data.rating = parseFloat(ratingEl.textContent.replace(',', '.'));
    }

    // REVIEW COUNT
    const reviewEl = document.querySelector(SELECTORS.reviewCount);
    if (reviewEl) {
      const label = reviewEl.getAttribute('aria-label') || reviewEl.textContent;
      const m = label.match(/([\d,\.]+)/);
      if (m) data.reviewCount = parseInt(m[1].replace(/[,\.]/g, ''));
    }

    // CATEGORIAS
    document.querySelectorAll(SELECTORS.category).forEach((btn, idx) => {
      const cat = btn.textContent?.trim();
      if (cat) {
        if (idx === 0) data.category = cat;
        data.categories.push(cat);
      }
    });

    // TELEFONO
    const phoneBtn = document.querySelector(SELECTORS.buttons.phone);
    if (phoneBtn) {
      const phoneText = phoneBtn.querySelector('.Io6YTe, .fontBodyMedium, span');
      data.phone = phoneText?.textContent?.trim();
      if (!data.phone) {
        const dataId = phoneBtn.getAttribute('data-item-id');
        const match = dataId?.match(/phone:tel:([^\s]+)/);
        if (match) data.phone = match[1].replace(/\+52/, '');
      }
    }
    if (!data.phone) {
      const phoneByLabel = document.querySelector('button[aria-label*="Telefono:"], button[aria-label*="Phone:"]');
      if (phoneByLabel) {
        const label = phoneByLabel.getAttribute('aria-label');
        const match = label.match(/(?:Telefono|Phone):\s*([^\s]+)/i);
        if (match) data.phone = match[1];
      }
    }
    if (!data.phone) {
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) data.phone = telLink.href.replace('tel:', '').replace(/\+52/, '');
    }

    // DIRECCION
    const addrBtn = document.querySelector(SELECTORS.buttons.address);
    if (addrBtn) {
      data.address = addrBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim();
    }

    // SITIO WEB
    const webBtn = document.querySelector(SELECTORS.buttons.website);
    if (webBtn) data.website = webBtn.href;

    // HORARIOS
    const hoursBtn = document.querySelector(SELECTORS.buttons.hours);
    if (hoursBtn) {
      const hoursText = hoursBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim();
      if (hoursText) {
        data.hours = hoursText.split('Ver mas')[0]?.trim();
        if (hoursText.toLowerCase().includes('abierto') || hoursText.toLowerCase().includes('open')) {
          data.isOpenNow = true;
        } else if (hoursText.toLowerCase().includes('cerrado') || hoursText.toLowerCase().includes('closed')) {
          data.isOpenNow = false;
        }
      }
    }

    // PLUS CODE
    const plusCodeBtn = document.querySelector(SELECTORS.buttons.plusCode);
    if (plusCodeBtn) {
      data.plusCode = plusCodeBtn.querySelector('.Io6YTe, .fontBodyMedium')?.textContent?.trim();
    }

    // COORDENADAS
    const url = window.location.href;
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      data.coordinates = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
    }

    // NIVEL DE PRECIOS
    const priceIndicators = document.querySelectorAll('[aria-label*="Precio"], [aria-label*="Price"]');
    priceIndicators.forEach(el => {
      const label = el.getAttribute('aria-label') || el.textContent;
      const match = label.match(/(\$+)/);
      if (match) data.priceLevel = match[1];
    });

    // ATRIBUTOS
    if (document.querySelector('[data-item-id*="delivery"], [aria-label*="Entrega"], [aria-label*="Delivery"]')) {
      data.attributes.delivery = true;
    }
    if (document.querySelector('[data-item-id*="takeout"], [aria-label*="Para llevar"], [aria-label*="Takeout"]')) {
      data.attributes.takeout = true;
    }
    if (document.querySelector('[data-item-id*="dine_in"], [aria-label*="Comer"], [aria-label*="Dine-in"]')) {
      data.attributes.dineIn = true;
    }
    if (document.querySelector('[aria-label*="Wi-Fi"], [aria-label*="WiFi"]')) {
      data.attributes.wifi = true;
    }

    // SERVICIOS
    document.querySelectorAll('[data-item-id^="place-info-links"]').forEach(el => {
      const text = el.textContent?.trim();
      if (text) data.services.push(text);
    });

    // MENU
    const menuLink = document.querySelector(SELECTORS.buttons.menu);
    if (menuLink) data.menuUrl = menuLink.href;

    // RESERVACIONES
    const reservationLink = document.querySelector(SELECTORS.buttons.reservations);
    if (reservationLink) data.reservationUrl = reservationLink.href;

    // FOTOS
    const mainPhotoEl = document.querySelector('button[class*="aoRNLd"] img, img[class*="Ia"]');
    if (mainPhotoEl && mainPhotoEl.src) data.mainPhoto = mainPhotoEl.src;
    
    const photosBtn = document.querySelector('button[aria-label*="fotos"], button[aria-label*="photos"]');
    if (photosBtn) {
      const label = photosBtn.getAttribute('aria-label');
      const match = label.match(/(\d+)/);
      if (match) data.photosCount = parseInt(match[1]);
    }

    // TOP REVIEWS
    const reviewContainers = document.querySelectorAll('div[data-review-id], div.jftiEf');
    reviewContainers.forEach((container, idx) => {
      if (idx >= 3) return;
      const review = { author: null, rating: null, text: null, date: null };
      
      const authorEl = container.querySelector('.d4r55, .WNxzHc');
      if (authorEl) review.author = authorEl.textContent?.trim();
      
      const ratingEl = container.querySelector('span[aria-label*="estrellas"], span[aria-label*="stars"]');
      if (ratingEl) {
        const match = ratingEl.getAttribute('aria-label').match(/(\d)/);
        if (match) review.rating = parseInt(match[1]);
      }
      
      const textEl = container.querySelector('.wiI7pd, .MyEned');
      if (textEl) review.text = textEl.textContent?.trim().substring(0, 300);
      
      const dateEl = container.querySelector('.rsqaWe, .DU9Pgb');
      if (dateEl) review.date = dateEl.textContent?.trim();
      
      if (review.author || review.text) data.topReviews.push(review);
    });

    // NEGOCIO RECLAMADO
    if (document.querySelector('[aria-label*="verificado"], [aria-label*="verified"]')) {
      data.claimedBusiness = true;
    }

    return data;
  }, SELECTORS);
}

// EXTRACTOR DE EMAIL DESDE SITIO WEB
async function extractEmailFromWebsite(browser, websiteUrl, timeout = 8000) {
  if (!websiteUrl) return null;
  
  const result = {
    email: null,
    emails: [],
    socialMedia: {
      instagram: null, facebook: null, twitter: null, whatsapp: null,
      linkedin: null, youtube: null, tiktok: null
    }
  };

  let page = null;
  try {
    page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
        return req.abort();
      }
      req.continue();
    });

    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: timeout });

    const extracted = await page.evaluate(() => {
      const data = { emails: [], social: {} };
      const html = document.documentElement.outerHTML;

      // Buscar emails
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const foundEmails = (html.match(emailPattern) || [])
        .filter(email => {
          const lower = email.toLowerCase();
          return !lower.includes('example') && !lower.includes('email@') &&
                 !lower.includes('@sentry') && !lower.includes('webpack') &&
                 !lower.includes('.png') && !lower.includes('.jpg') && email.length < 60;
        });
      data.emails = [...new Set(foundEmails)];

      // Buscar redes sociales
      const socialPatterns = {
        instagram: /instagram\.com\/([a-zA-Z0-9_.]+)/,
        facebook: /facebook\.com\/([a-zA-Z0-9.]+)/,
        twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/,
        linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/,
        youtube: /youtube\.com\/(?:channel|c|user|@)\/([a-zA-Z0-9_-]+)/,
        tiktok: /tiktok\.com\/@([a-zA-Z0-9_.]+)/
      };

      for (const [platform, pattern] of Object.entries(socialPatterns)) {
        const match = html.match(pattern);
        if (match) data.social[platform] = match[0];
      }

      // WhatsApp
      const waPatterns = [/wa\.me\/(\+?\d+)/, /whatsapp\.com\/send\?phone=(\d+)/];
      for (const pattern of waPatterns) {
        const match = html.match(pattern);
        if (match) { data.social.whatsapp = match[1]; break; }
      }

      // mailto links
      document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
        const email = link.href.replace('mailto:', '').split('?')[0];
        if (email && !data.emails.includes(email)) data.emails.unshift(email);
      });

      return data;
    });

    result.emails = extracted.emails;
    result.email = extracted.emails[0] || null;
    result.socialMedia = { ...result.socialMedia, ...extracted.social };

  } catch (error) {
    // Silenciar errores
  } finally {
    if (page) await page.close().catch(() => {});
  }

  return result;
}

// CLASE PRINCIPAL: GoogleMapsScraperAdvanced
export class GoogleMapsScraperAdvanced {
  constructor(options = {}) {
    this.maxResults = options.maxResults || SCRAPER_CONFIG.limits.defaultResults;
    this.extractEmails = options.extractEmails !== false;
    this.extractSocialMedia = options.extractSocialMedia !== false;
    this.filters = options.filters || {};
    this.proxyUrl = options.proxyUrl || null;
    this.onProgress = options.onProgress || null;
  }

  getZoomFromRadius(radiusKm) {
    if (radiusKm <= 0.5) return 17;
    if (radiusKm <= 1) return 16;
    if (radiusKm <= 2) return 15;
    if (radiusKm <= 5) return 14;
    if (radiusKm <= 10) return 13;
    if (radiusKm <= 20) return 12;
    if (radiusKm <= 50) return 11;
    return 10;
  }

  shouldInclude(business, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;
    if (filters.minRating && business.rating && business.rating < filters.minRating) return false;
    if (filters.minReviews && business.reviewCount && business.reviewCount < filters.minReviews) return false;
    if (filters.requirePhone && !business.phone) return false;
    if (filters.requireWebsite && !business.website) return false;
    if (filters.requireDelivery && !business.attributes?.delivery) return false;
    return true;
  }

  async scrape(params) {
    const {
      businessType, city, country,
      maxResults = this.maxResults,
      coordinates = null,
      radius = null,
      filters = this.filters
    } = params;

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

      let searchUrl;
      if (coordinates && radius) {
        const { lat, lng } = coordinates;
        const query = encodeURIComponent(businessType);
        const zoom = this.getZoomFromRadius(radius);
        searchUrl = 'https://www.google.com/maps/search/' + query + '/@' + lat + ',' + lng + ',' + zoom + 'z';
        console.log('Buscando:', businessType, 'en coordenadas:', lat, lng, 'radio:', radius, 'km');
      } else {
        const query = encodeURIComponent(businessType + ' en ' + city + ', ' + country);
        searchUrl = 'https://www.google.com/maps/search/' + query;
        console.log('Buscando:', businessType, 'en', city, country);
      }

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: SCRAPER_CONFIG.timeouts.navigation
      });

      await page.waitForSelector(SELECTORS.feed, { timeout: SCRAPER_CONFIG.timeouts.selector });

      const acceptBtn = await page.$('button[aria-label*="Aceptar"], button[aria-label*="Accept"]');
      if (acceptBtn) await acceptBtn.click().catch(() => {});

      await smartScroll(page, maxResults);

      const businessLinks = await page.evaluate((max, SELECTORS) => {
        const links = [];
        const cards = document.querySelectorAll(SELECTORS.businessCard);

        for (let i = 0; i < Math.min(cards.length, max); i++) {
          const card = cards[i];
          let name = null;

          for (const sel of SELECTORS.name) {
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

          if (!name && card.href) {
            const match = card.href.match(/\/maps\/place\/([^\/]+)/);
            if (match) name = decodeURIComponent(match[1]).replace(/\+/g, ' ');
          }

          links.push({ name: name || 'Sin nombre', href: card.href });
        }
        return links;
      }, maxResults, SELECTORS);

      console.log('Extrayendo detalles de', businessLinks.length, 'negocios...');

      const results = [];
      const totalBusinesses = businessLinks.length;

      for (let i = 0; i < businessLinks.length; i++) {
        const biz = businessLinks[i];
        console.log('[' + (i + 1) + '/' + totalBusinesses + '] ' + biz.name);

        if (this.onProgress) {
          this.onProgress({
            current: i + 1,
            total: totalBusinesses,
            businessName: biz.name,
            percentage: Math.round(((i + 1) / totalBusinesses) * 100)
          });
        }

        try {
          await page.evaluate((href) => {
            const link = document.querySelector('a[href="' + href + '"]');
            if (link) link.click();
          }, biz.href);

          await page.waitForSelector('h1', { timeout: 3000 }).catch(() => {});
          await waitForStableCount(page, 'button[data-item-id]', 1500);

          const currentUrl = page.url();
          const placeId = extractPlaceId(currentUrl);

          const details = await extractBusinessDetails(page);

          let websiteData = null;
          if (this.extractEmails && details.website) {
            console.log('    -> Extrayendo datos del sitio web...');
            websiteData = await extractEmailFromWebsite(browser, details.website, SCRAPER_CONFIG.timeouts.emailExtraction);
          }

          if (!details.name || details.name === 'Sin nombre') {
            details.name = biz.name !== 'Sin nombre' ? biz.name : extractNameFromUrl(biz.href);
          }

          if (this.shouldInclude(details, filters)) {
            const businessData = {
              position: results.length + 1,
              placeId,
              ...details,
              email: websiteData?.email || null,
              allEmails: websiteData?.emails || [],
              socialMedia: websiteData?.socialMedia || {
                instagram: null, facebook: null, twitter: null, whatsapp: null,
                linkedin: null, youtube: null, tiktok: null
              },
              searchQuery: { businessType, city, country, coordinates, radius },
              scrapedAt: new Date().toISOString()
            };

            results.push(businessData);

            if (details.name) console.log('    -> Nombre:', details.name);
            if (details.phone) console.log('    -> Tel:', details.phone);
            if (websiteData?.email) console.log('    -> Email:', websiteData.email);
            if (websiteData?.socialMedia?.instagram) console.log('    -> IG:', websiteData.socialMedia.instagram);
            if (websiteData?.socialMedia?.whatsapp) console.log('    -> WA:', websiteData.socialMedia.whatsapp);
          }

        } catch (err) {
          const fallbackName = biz.name !== 'Sin nombre' ? biz.name : extractNameFromUrl(biz.href);
          results.push({
            position: results.length + 1,
            placeId: null,
            name: fallbackName,
            profileUrl: biz.href,
            searchQuery: { businessType, city, country },
            scrapedAt: new Date().toISOString(),
            error: err.message
          });
        }
      }

      const uniqueResults = deduplicateResults(results);

      const stats = {
        total: uniqueResults.length,
        withPhone: uniqueResults.filter(r => r.phone).length,
        withEmail: uniqueResults.filter(r => r.email).length,
        withWebsite: uniqueResults.filter(r => r.website).length,
        withInstagram: uniqueResults.filter(r => r.socialMedia?.instagram).length,
        withWhatsapp: uniqueResults.filter(r => r.socialMedia?.whatsapp).length
      };

      console.log('\n=== ESTADISTICAS ===');
      console.log('Total:', stats.total);
      console.log('Con telefono:', stats.withPhone);
      console.log('Con email:', stats.withEmail);
      console.log('Con sitio web:', stats.withWebsite);
      console.log('Con Instagram:', stats.withInstagram);
      console.log('Con WhatsApp:', stats.withWhatsapp);

      return {
        businesses: uniqueResults,
        stats,
        query: { businessType, city, country, coordinates, radius, filters }
      };

    } finally {
      await context.close();
    }
  }
}

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit();
});

export default GoogleMapsScraperAdvanced;
