/**
 * Proxy Manager - Sistema de rotacion de proxies con soporte para proxies gratuitos
 */

import https from 'https';
import http from 'http';

// Lista de APIs de proxies gratuitos
const FREE_PROXY_APIS = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt'
];

export class ProxyManager {
  constructor(options = {}) {
    this.proxies = options.proxies || [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map();
    this.rotateOnFail = options.rotateOnFail !== false;
    this.maxFailures = options.maxFailures || 2;
    this.useProxies = options.useProxies || false;
    this.lastFetch = null;
  }

  // Obtener proxies gratuitos de APIs publicas
  async fetchFreeProxies(maxProxies = 20) {
    console.log('Obteniendo proxies gratuitos...');
    const allProxies = [];

    for (const apiUrl of FREE_PROXY_APIS) {
      try {
        const proxies = await this._fetchFromUrl(apiUrl);
        allProxies.push(...proxies);
        if (allProxies.length >= maxProxies * 2) break;
      } catch (error) {
        console.log('Error obteniendo de', apiUrl.substring(0, 50) + '...:', error.message);
      }
    }

    // Limpiar y formatear proxies
    const cleanProxies = [...new Set(allProxies)]
      .filter(p => p && p.match(/^\d+\.\d+\.\d+\.\d+:\d+$/))
      .slice(0, maxProxies);

    console.log('Proxies obtenidos:', cleanProxies.length);
    
    // Probar algunos proxies y agregar los que funcionen
    const workingProxies = [];
    for (const proxy of cleanProxies.slice(0, Math.min(10, cleanProxies.length))) {
      const isWorking = await this._quickTest(proxy);
      if (isWorking) {
        workingProxies.push('http://' + proxy);
        console.log('  ✓ Proxy funcional:', proxy);
        if (workingProxies.length >= 5) break;
      }
    }

    if (workingProxies.length > 0) {
      this.addProxies(workingProxies);
      this.useProxies = true;
      this.lastFetch = new Date();
    }

    console.log('Proxies funcionales agregados:', workingProxies.length);
    return workingProxies;
  }

  _fetchFromUrl(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const request = protocol.get(url, { timeout: 10000 }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          const proxies = data.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
          resolve(proxies);
        });
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });
  }

  async _quickTest(proxy, timeout = 5000) {
    return new Promise((resolve) => {
      const [host, port] = proxy.split(':');
      const req = http.request({
        host, port: parseInt(port),
        method: 'CONNECT',
        path: 'www.google.com:443',
        timeout
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
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
    if (this.proxies.length === 0 || !this.useProxies) return null;
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
    if (this.proxies.length === 0 || !this.useProxies) return null;
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
    return {
      total: this.proxies.length,
      active: this.proxies.length - this.failedProxies.size,
      failed: this.failedProxies.size,
      useProxies: this.useProxies,
      lastFetch: this.lastFetch
    };
  }

  resetFailedProxies() {
    this.failedProxies.clear();
    for (const [, stats] of this.proxyStats.entries()) { stats.failures = 0; }
  }

  isEnabled() {
    return this.useProxies && this.proxies.length > 0;
  }

  enable() { this.useProxies = true; }
  disable() { this.useProxies = false; }
}

export default ProxyManager;
