/**
 * Proxy Manager - Sistema de rotacion de proxies
 */

export class ProxyManager {
  constructor(options = {}) {
    this.proxies = options.proxies || [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map();
    this.rotateOnFail = options.rotateOnFail !== false;
    this.maxFailures = options.maxFailures || 3;
  }

  addProxies(proxyList) {
    for (const proxy of proxyList) {
      if (!this.proxies.includes(proxy)) {
        this.proxies.push(proxy);
        this.proxyStats.set(proxy, { success: 0, failures: 0, lastUsed: null });
      }
    }
  }

  getNext() {
    if (this.proxies.length === 0) return null;
    const availableProxies = this.proxies.filter(p => !this.failedProxies.has(p));
    if (availableProxies.length === 0) {
      this.failedProxies.clear();
      return this.proxies[0];
    }
    this.currentIndex = (this.currentIndex + 1) % availableProxies.length;
    const proxy = availableProxies[this.currentIndex];
    const stats = this.proxyStats.get(proxy);
    if (stats) stats.lastUsed = new Date();
    return proxy;
  }

  getCurrent() {
    if (this.proxies.length === 0) return null;
    const availableProxies = this.proxies.filter(p => !this.failedProxies.has(p));
    if (availableProxies.length === 0) return this.proxies[0];
    return availableProxies[this.currentIndex % availableProxies.length];
  }

  markSuccess(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (stats) { stats.success++; stats.failures = 0; }
  }

  markFailed(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (stats) {
      stats.failures++;
      if (stats.failures >= this.maxFailures) {
        this.failedProxies.add(proxy);
        console.log('Proxy deshabilitado:', proxy);
      }
    }
    return this.rotateOnFail ? this.getNext() : null;
  }

  formatForPuppeteer(proxyUrl) {
    if (!proxyUrl) return null;
    if (proxyUrl.includes('@')) {
      const match = proxyUrl.match(/(?:(\w+):\/\/)?(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/);
      if (match) {
        const [, protocol, user, pass, host, port] = match;
        return { server: (protocol || 'http') + '://' + host + ':' + port, username: user, password: pass };
      }
    } else {
      const match = proxyUrl.match(/(?:(\w+):\/\/)?([^:]+):(\d+)/);
      if (match) {
        const [, protocol, host, port] = match;
        return { server: (protocol || 'http') + '://' + host + ':' + port };
      }
    }
    return null;
  }

  getPuppeteerArgs(proxyUrl) {
    const formatted = this.formatForPuppeteer(proxyUrl || this.getCurrent());
    if (!formatted) return [];
    return ['--proxy-server=' + formatted.server];
  }

  getStats() {
    const stats = [];
    for (const [proxy, data] of this.proxyStats.entries()) {
      stats.push({
        proxy: proxy.replace(/:[^:@]+@/, ':***@'),
        ...data,
        isFailed: this.failedProxies.has(proxy),
        successRate: data.success + data.failures > 0 
          ? ((data.success / (data.success + data.failures)) * 100).toFixed(1) + '%' : 'N/A'
      });
    }
    return stats;
  }

  resetFailedProxies() {
    this.failedProxies.clear();
    for (const [, stats] of this.proxyStats.entries()) { stats.failures = 0; }
  }

  async testProxy(proxyUrl, testUrl = 'https://www.google.com') {
    const puppeteer = (await import('puppeteer')).default;
    const formatted = this.formatForPuppeteer(proxyUrl);
    if (!formatted) return { success: false, error: 'Invalid proxy format' };

    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--proxy-server=' + formatted.server]
      });
      const page = await browser.newPage();
      if (formatted.username && formatted.password) {
        await page.authenticate({ username: formatted.username, password: formatted.password });
      }
      const startTime = Date.now();
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return { success: true, responseTime: Date.now() - startTime, proxy: proxyUrl.replace(/:[^:@]+@/, ':***@') };
    } catch (error) {
      return { success: false, error: error.message, proxy: proxyUrl.replace(/:[^:@]+@/, ':***@') };
    } finally {
      if (browser) await browser.close();
    }
  }
}

export default ProxyManager;
