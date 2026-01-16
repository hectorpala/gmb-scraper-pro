/**
 * Configuracion avanzada del Scraper GMB Pro
 */

export const SCRAPER_CONFIG = {
  scroll: {
    maxAttempts: 50,
    noGrowthLimit: 5,
    totalTimeout: 30000,
    stabilizeTimeout: 2000,
    scrollAmount: 800
  },
  timeouts: {
    navigation: 30000,
    selector: 10000,
    detail: 5000,
    emailExtraction: 8000
  },
  limits: {
    minResults: 10,
    maxResults: 500,
    defaultResults: 50,
    maxReviewsToExtract: 5,
    maxPhotosToExtract: 3
  },
  retry: {
    maxAttempts: 3,
    delayMs: 2000,
    backoffMultiplier: 1.5
  }
};

export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
];

export const BLOCKED_RESOURCES = ['image', 'media', 'font'];

export const BLOCKED_DOMAINS = [
  'googleadservices.com', 'googlesyndication.com', 'doubleclick.net',
  'google-analytics.com', 'googletagmanager.com', 'facebook.com',
  'facebook.net', 'fbcdn.net', 'analytics', 'tracking', 'adservice', 'pagead'
];

export const SELECTORS = {
  feed: 'div[role="feed"]',
  businessCard: 'div[role="feed"] a[href*="/maps/place/"]',
  name: [
    'h1.DUwDvf', 'h1[class*="fontHeadlineLarge"]', 'h1[class*="headline"]',
    'div[role="main"] h1', '.fontHeadlineSmall', '[class*="qBF1Pd"]', 'h1'
  ],
  rating: 'div.F7nice span[aria-hidden="true"]',
  reviewCount: 'div.F7nice span[aria-label*="opiniones"], div.F7nice span[aria-label*="reviews"]',
  category: 'button[jsaction*="category"]',
  buttons: {
    phone: 'button[data-item-id^="phone:"]',
    address: 'button[data-item-id="address"]',
    website: 'a[data-item-id="authority"]',
    hours: 'button[data-item-id="oh"]',
    plusCode: 'button[data-item-id="oloc"]',
    menu: 'a[data-item-id="menu"]',
    reservations: 'a[data-item-id="reservations"]'
  },
  priceLevel: ['span[aria-label*="Precio"]', 'span[aria-label*="Price"]', '[class*="price"]'],
  attributes: {
    delivery: '[data-item-id*="delivery"], [aria-label*="Entrega"], [aria-label*="Delivery"]',
    takeout: '[data-item-id*="takeout"], [aria-label*="Para llevar"], [aria-label*="Takeout"]',
    dineIn: '[data-item-id*="dine_in"], [aria-label*="Comer"], [aria-label*="Dine-in"]',
    curbside: '[data-item-id*="curbside"], [aria-label*="Recoger"]',
    wheelchair: '[aria-label*="silla de ruedas"], [aria-label*="wheelchair"]',
    wifi: '[aria-label*="Wi-Fi"], [aria-label*="WiFi"]',
    parking: '[aria-label*="Estacionamiento"], [aria-label*="parking"]'
  },
  reviews: {
    container: 'div[data-review-id]',
    text: '.wiI7pd',
    author: '.d4r55',
    rating: 'span[aria-label*="estrellas"], span[aria-label*="stars"]',
    date: '.rsqaWe'
  },
  photos: {
    main: 'button[class*="aoRNLd"] img',
    gallery: 'button[data-photo-index] img',
    count: 'button[aria-label*="fotos"], button[aria-label*="photos"]'
  }
};

export const PATTERNS = {
  coordinates: /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  placeId: /!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i,
  nameFromUrl: /\/maps\/place\/([^\/]+)/,
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  priceLevel: /(\${1,4})/,
  reviewCount: /([\d,\.]+)/,
  whatsapp: /(?:wa\.me|whatsapp\.com|api\.whatsapp\.com)\/(\+?\d+)/,
  instagram: /instagram\.com\/([a-zA-Z0-9_.]+)/,
  facebook: /facebook\.com\/([a-zA-Z0-9.]+)/
};

export const FILTER_OPTIONS = {
  rating: { min: 0, max: 5, step: 0.5 },
  reviewCount: { min: 0, max: 10000 },
  priceLevel: ['$', '$$', '$$$', '$$$$'],
  distance: { min: 0.1, max: 50, unit: 'km' }
};

export const ERROR_MESSAGES = {
  NO_RESULTS: 'No se encontraron resultados para esta busqueda',
  BLOCKED: 'Google ha bloqueado temporalmente las solicitudes. Intenta mas tarde.',
  TIMEOUT: 'La busqueda tardo demasiado. Intenta con menos resultados.',
  INVALID_LOCATION: 'No se pudo encontrar la ubicacion especificada',
  PROXY_ERROR: 'Error con el proxy. Cambiando a conexion directa.',
  CAPTCHA: 'Se detecto un captcha. Requiere intervencion manual.'
};

export default {
  SCRAPER_CONFIG, USER_AGENTS, BLOCKED_RESOURCES, BLOCKED_DOMAINS,
  SELECTORS, PATTERNS, FILTER_OPTIONS, ERROR_MESSAGES
};
