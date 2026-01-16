/**
 * GMB Scraper Pro v2.0 - Frontend Application
 */

const state = {
  isLoading: false,
  results: [],
  stats: null,
  exports: { json: null, csv: null },
  googleSheets: { configured: false, authenticated: false, url: null },
  activeTab: 'ciudad',
  previewData: null
};

const elements = {};

async function init() {
  // Cache elements
  elements.form = document.getElementById('searchForm');
  elements.searchBtn = document.getElementById('searchBtn');
  elements.previewBtn = document.getElementById('previewBtn');
  elements.progressSection = document.getElementById('progressSection');
  elements.progressText = document.getElementById('progressText');
  elements.progressPercent = document.getElementById('progressPercent');
  elements.progressFill = document.getElementById('progressFill');
  elements.messageSection = document.getElementById('messageSection');
  elements.messageBox = document.getElementById('messageBox');
  elements.statsSection = document.getElementById('statsSection');
  elements.resultsSection = document.getElementById('resultsSection');
  elements.resultsCount = document.getElementById('resultsCount');
  elements.resultsBody = document.getElementById('resultsBody');
  elements.exportCsv = document.getElementById('exportCsv');
  elements.exportJson = document.getElementById('exportJson');
  elements.exportSheets = document.getElementById('exportSheets');
  elements.googleIcon = document.getElementById('googleIcon');
  elements.googleStatusText = document.getElementById('googleStatusText');
  elements.googleConnectBtn = document.getElementById('googleConnectBtn');
  elements.sheetsOptionGroup = document.getElementById('sheetsOptionGroup');
  elements.exportToSheets = document.getElementById('exportToSheets');
  elements.filtersToggle = document.getElementById('filtersToggle');
  elements.filtersContent = document.getElementById('filtersContent');

  // Preview elements
  elements.previewSection = document.getElementById('previewSection');
  elements.previewTitle = document.getElementById('previewTitle');
  elements.previewCount = document.getElementById('previewCount');
  elements.previewSamples = document.getElementById('previewSamples');
  elements.previewCancel = document.getElementById('previewCancel');
  elements.previewConfirm = document.getElementById('previewConfirm');

  // Event listeners
  elements.form.addEventListener('submit', handleSubmit);
  elements.previewBtn.addEventListener('click', handlePreview);
  elements.previewCancel.addEventListener('click', hidePreview);
  elements.previewConfirm.addEventListener('click', confirmScrape);
  elements.exportCsv.addEventListener('click', function() { downloadExport('csv'); });
  elements.exportJson.addEventListener('click', function() { downloadExport('json'); });
  elements.exportSheets.addEventListener('click', openGoogleSheets);
  elements.googleConnectBtn.addEventListener('click', connectGoogleSheets);

  // Tabs
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });

  // Filters toggle
  elements.filtersToggle.addEventListener('click', function() {
    this.classList.toggle('collapsed');
    elements.filtersContent.classList.toggle('collapsed');
  });

  await checkGoogleStatus();

  setInterval(async function() {
    if (!state.googleSheets.authenticated) {
      await checkGoogleStatus();
    }
  }, 3000);
}

function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.toggle('active', content.id === 'tab-' + tabName);
  });

  // Update required fields
  const cityInputs = document.querySelectorAll('#tab-ciudad input');
  const geoInputs = document.querySelectorAll('#tab-geo input');

  cityInputs.forEach(function(input) {
    if (input.name === 'businessType' || input.name === 'city' || input.name === 'country') {
      input.required = tabName === 'ciudad';
    }
  });

  geoInputs.forEach(function(input) {
    if (input.name === 'businessTypeGeo' || input.name === 'latitude' || input.name === 'longitude') {
      input.required = tabName === 'geo';
    }
  });
}

async function checkGoogleStatus() {
  try {
    const response = await fetch('/api/google/status');
    const result = await response.json();
    if (result.success) {
      const wasNotAuth = !state.googleSheets.authenticated;
      state.googleSheets.configured = result.data.configured;
      state.googleSheets.authenticated = result.data.authenticated;
      updateGoogleUI();
      if (wasNotAuth && result.data.authenticated) {
        showMessage('Google Sheets conectado exitosamente!', 'success');
      }
    }
  } catch (error) {
    console.error('Error verificando Google:', error);
  }
}

function updateGoogleUI() {
  const { configured, authenticated } = state.googleSheets;
  if (!configured) {
    elements.googleIcon.className = 'google-icon not-configured';
    elements.googleStatusText.textContent = 'Google Sheets no configurado';
    elements.googleConnectBtn.style.display = 'none';
    elements.sheetsOptionGroup.style.display = 'none';
  } else if (!authenticated) {
    elements.googleIcon.className = 'google-icon disconnected';
    elements.googleStatusText.textContent = 'Google Sheets: No conectado';
    elements.googleConnectBtn.style.display = 'inline-flex';
    elements.sheetsOptionGroup.style.display = 'none';
  } else {
    elements.googleIcon.className = 'google-icon connected';
    elements.googleStatusText.textContent = 'Google Sheets: Conectado';
    elements.googleConnectBtn.style.display = 'none';
    elements.sheetsOptionGroup.style.display = 'block';
  }
}

async function connectGoogleSheets() {
  try {
    elements.googleConnectBtn.disabled = true;
    elements.googleConnectBtn.textContent = 'Conectando...';
    const response = await fetch('/api/google/connect');
    const result = await response.json();
    if (result.success && result.data.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=500,height=600');
      showMessage('Completa la autorizacion en la ventana que se abrio', 'info');
    } else {
      showMessage(result.error || 'Error conectando', 'error');
    }
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
  } finally {
    elements.googleConnectBtn.disabled = false;
    elements.googleConnectBtn.textContent = 'Conectar Google Sheets';
  }
}

function getFormData() {
  const formData = new FormData(elements.form);
  let data = {};

  if (state.activeTab === 'ciudad') {
    data = {
      businessType: formData.get('businessType')?.trim(),
      city: formData.get('city')?.trim(),
      country: formData.get('country')?.trim()
    };
    if (!data.businessType || !data.city || !data.country) {
      return { error: 'Por favor complete todos los campos' };
    }
  } else {
    const lat = parseFloat(formData.get('latitude'));
    const lng = parseFloat(formData.get('longitude'));
    const radius = parseFloat(formData.get('radius')) || 5;

    data = {
      businessType: formData.get('businessTypeGeo')?.trim(),
      coordinates: { lat, lng },
      radius: radius
    };

    if (!data.businessType || isNaN(lat) || isNaN(lng)) {
      return { error: 'Por favor complete tipo de negocio, latitud y longitud' };
    }
  }

  // Common options
  data.maxResults = parseInt(formData.get('maxResults')) || 50;
  data.extractEmails = document.getElementById('extractEmails').checked;
  data.extractSocialMedia = document.getElementById('extractSocial').checked;

  // Filters
  data.filters = {};
  const minRating = formData.get('minRating');
  const minReviews = formData.get('minReviews');
  if (minRating) data.filters.minRating = parseFloat(minRating);
  if (minReviews) data.filters.minReviews = parseInt(minReviews);
  if (document.getElementById('requirePhone').checked) data.filters.requirePhone = true;
  if (document.getElementById('requireWebsite').checked) data.filters.requireWebsite = true;

  return data;
}

// ============ PREVIEW FUNCTIONALITY ============

async function handlePreview() {
  if (state.isLoading) return;

  const data = getFormData();
  if (data.error) {
    showMessage(data.error, 'error');
    return;
  }

  setPreviewLoading(true);
  hideMessage();
  hideResults();

  try {
    const response = await fetch('/api/v2/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.data?.message || 'Error en preview');
    }

    state.previewData = data;
    showPreviewResults(result.data);

  } catch (error) {
    showMessage(error.message || 'Error al realizar preview', 'error');
  } finally {
    setPreviewLoading(false);
  }
}

function setPreviewLoading(loading) {
  const btnText = elements.previewBtn.querySelector('.btn-text');
  const btnLoading = elements.previewBtn.querySelector('.btn-loading');
  elements.previewBtn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

function showPreviewResults(data) {
  elements.previewCount.textContent = data.count;

  // Show sample names
  if (data.sampleNames && data.sampleNames.length > 0) {
    let html = '<p>Ejemplos de negocios encontrados:</p><ul>';
    data.sampleNames.forEach(function(name) {
      html += '<li>' + escapeHtml(name) + '</li>';
    });
    html += '</ul>';
    elements.previewSamples.innerHTML = html;
    elements.previewSamples.style.display = 'block';
  } else {
    elements.previewSamples.style.display = 'none';
  }

  elements.previewSection.style.display = 'block';
}

function hidePreview() {
  elements.previewSection.style.display = 'none';
  state.previewData = null;
}

async function confirmScrape() {
  const data = state.previewData;
  if (!state.previewData) return;
  hidePreview();
  await performSearch(data);
}

// ============ SEARCH FUNCTIONALITY ============

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isLoading) return;

  const data = getFormData();
  if (data.error) {
    showMessage(data.error, 'error');
    return;
  }

  await performSearch(data);
}

async function performSearch(data) {
  setLoading(true);
  hideMessage();
  hideResults();
  hidePreview();
  showProgress();

  try {
    updateProgress('Conectando con el servidor...', 5);

    const response = await fetch('/api/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    updateProgress('Procesando resultados...', 90);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido');
    }

    updateProgress('Completado!', 100);

    state.results = result.data.businesses;
    state.stats = result.data.stats;
    state.exports = {
      json: result.data.exports.json,
      csv: result.data.exports.csv
    };

    if (result.data.googleSheets) {
      state.googleSheets.url = result.data.googleSheets.url;
      elements.exportSheets.style.display = 'inline-flex';
    }

    setTimeout(function() {
      hideProgress();
      showStats(result.data.stats);
      showResults(result.data);
      if (result.data.googleSheets) {
        showMessage('Guardado en Google Sheets: ' + result.data.googleSheets.title, 'success');
      }
    }, 500);

  } catch (error) {
    hideProgress();
    showMessage(error.message || 'Error al realizar la busqueda', 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  state.isLoading = loading;
  elements.searchBtn.disabled = loading;
  elements.previewBtn.disabled = loading;
  const btnText = elements.searchBtn.querySelector('.btn-text');
  const btnLoading = elements.searchBtn.querySelector('.btn-loading');
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

function showProgress() {
  elements.progressSection.style.display = 'block';
  updateProgress('Iniciando...', 0);
}

function hideProgress() {
  elements.progressSection.style.display = 'none';
}

function updateProgress(text, percent) {
  elements.progressText.textContent = text;
  elements.progressPercent.textContent = percent + '%';
  elements.progressFill.style.width = percent + '%';
}

function showMessage(message, type) {
  elements.messageBox.textContent = message;
  elements.messageBox.className = 'message-box ' + type;
  elements.messageSection.style.display = 'block';
}

function hideMessage() {
  elements.messageSection.style.display = 'none';
}

function showStats(stats) {
  document.getElementById('statTotal').textContent = stats.total || 0;
  document.getElementById('statPhone').textContent = stats.withPhone || 0;
  document.getElementById('statEmail').textContent = stats.withEmail || 0;
  document.getElementById('statWebsite').textContent = stats.withWebsite || 0;
  document.getElementById('statInstagram').textContent = stats.withInstagram || 0;
  document.getElementById('statWhatsapp').textContent = stats.withWhatsapp || 0;
  elements.statsSection.style.display = 'block';
}

function showResults(data) {
  const { businesses, duration } = data;
  elements.resultsCount.textContent = businesses.length + ' negocios en ' + duration;
  elements.resultsBody.innerHTML = '';

  businesses.forEach(function(business, index) {
    const row = createResultRow(business, index + 1);
    elements.resultsBody.appendChild(row);
  });

  elements.resultsSection.style.display = 'block';
}

function hideResults() {
  elements.resultsSection.style.display = 'none';
  elements.statsSection.style.display = 'none';
  elements.exportSheets.style.display = 'none';
}

function createResultRow(business, position) {
  const tr = document.createElement('tr');

  const ratingHtml = business.rating
    ? '<span class="rating-star">&#9733;</span> ' + business.rating.toFixed(1)
    : '-';

  const phoneHtml = business.phone
    ? '<span class="badge badge-phone">' + escapeHtml(business.phone) + '</span>'
    : '-';

  const emailHtml = business.email
    ? '<span class="badge badge-email">' + escapeHtml(business.email) + '</span>'
    : '-';

  // Social media icons
  let socialHtml = '<div class="social-icons">';
  if (business.socialMedia) {
    if (business.socialMedia.instagram) {
      socialHtml += '<a href="' + escapeHtml(business.socialMedia.instagram) + '" target="_blank" class="social-icon ig" title="Instagram">IG</a>';
    }
    if (business.socialMedia.facebook) {
      socialHtml += '<a href="' + escapeHtml(business.socialMedia.facebook) + '" target="_blank" class="social-icon fb" title="Facebook">FB</a>';
    }
    if (business.socialMedia.whatsapp) {
      socialHtml += '<a href="https://wa.me/' + escapeHtml(business.socialMedia.whatsapp) + '" target="_blank" class="social-icon wa" title="WhatsApp">WA</a>';
    }
    if (business.socialMedia.twitter) {
      socialHtml += '<a href="' + escapeHtml(business.socialMedia.twitter) + '" target="_blank" class="social-icon tw" title="Twitter">TW</a>';
    }
  }
  socialHtml += '</div>';
  if (socialHtml === '<div class="social-icons"></div>') socialHtml = '-';

  const websiteHtml = business.website
    ? '<a href="' + escapeHtml(business.website) + '" target="_blank">Ver</a>'
    : '-';

  const profileHtml = business.profileUrl
    ? '<a href="' + escapeHtml(business.profileUrl) + '" target="_blank">Maps</a>'
    : '-';

  tr.innerHTML =
    '<td>' + position + '</td>' +
    '<td><strong>' + escapeHtml(business.name || '-') + '</strong></td>' +
    '<td>' + ratingHtml + '</td>' +
    '<td>' + escapeHtml(business.category || '-') + '</td>' +
    '<td>' + phoneHtml + '</td>' +
    '<td>' + emailHtml + '</td>' +
    '<td>' + socialHtml + '</td>' +
    '<td>' + websiteHtml + '</td>' +
    '<td>' + profileHtml + '</td>';

  return tr;
}

function downloadExport(format) {
  const url = state.exports[format];
  if (url) window.open(url, '_blank');
}

function openGoogleSheets() {
  if (state.googleSheets.url) window.open(state.googleSheets.url, '_blank');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);

// ============ DATABASE FUNCTIONALITY ============

async function initDatabase() {
  const dbToggle = document.getElementById('dbToggle');
  const dbContent = document.getElementById('dbContent');
  const dbRefresh = document.getElementById('dbRefresh');
  const dbExport = document.getElementById('dbExport');
  const dbLimpiar = document.getElementById('dbLimpiar');
  const dbSearchBtn = document.getElementById('dbSearchBtn');
  const dbSearchInput = document.getElementById('dbSearchInput');

  if (!dbToggle) return;

  // Toggle database section
  dbToggle.addEventListener('click', function() {
    const isOpen = dbContent.style.display !== 'none';
    dbContent.style.display = isOpen ? 'none' : 'block';
    dbToggle.classList.toggle('open', !isOpen);
    
    if (!isOpen) {
      loadDatabaseStats();
    }
  });

  // Refresh stats
  if (dbRefresh) {
    dbRefresh.addEventListener('click', loadDatabaseStats);
  }

  // Export all
  if (dbExport) {
    dbExport.addEventListener('click', exportDatabase);
  }

  // Clean duplicates
  if (dbLimpiar) {
    dbLimpiar.addEventListener('click', cleanDuplicates);
  }

  // Search
  if (dbSearchBtn && dbSearchInput) {
    dbSearchBtn.addEventListener('click', searchDatabase);
    dbSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') searchDatabase();
    });
  }

  // Load initial stats
  loadDatabaseStats();
}

async function loadDatabaseStats() {
  try {
    const response = await fetch('/api/db/stats');
    const result = await response.json();

    if (result.success) {
      const stats = result.data;
      
      document.getElementById('dbTotalNegocios').textContent = stats.totalNegocios || 0;
      document.getElementById('dbTotalCiudades').textContent = stats.totalCiudades || 0;
      document.getElementById('dbTotalCategorias').textContent = stats.totalCategorias || 0;
      document.getElementById('dbTotalBusquedas').textContent = stats.totalBusquedas || 0;
      
      document.getElementById('dbConTelefono').textContent = stats.conTelefono || 0;
      document.getElementById('dbConEmail').textContent = stats.conEmail || 0;
      document.getElementById('dbConWebsite').textContent = stats.conWebsite || 0;
      document.getElementById('dbRatingPromedio').textContent = stats.ratingPromedio || '0.0';
    }
  } catch (error) {
    console.error('Error loading database stats:', error);
  }
}

async function exportDatabase() {
  try {
    showMessage('Exportando base de datos...', 'info');
    const response = await fetch('/api/db/exportar');
    const result = await response.json();

    if (result.success) {
      showMessage('Exportado: ' + result.data.total + ' negocios', 'success');
      window.open(result.data.downloadUrl, '_blank');
    } else {
      showMessage('Error: ' + result.error, 'error');
    }
  } catch (error) {
    showMessage('Error exportando: ' + error.message, 'error');
  }
}

async function cleanDuplicates() {
  if (!confirm('¿Eliminar negocios duplicados de la base de datos?')) return;

  try {
    showMessage('Limpiando duplicados...', 'info');
    const response = await fetch('/api/db/limpiar-duplicados', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showMessage('Eliminados ' + result.data.eliminados + ' duplicados', 'success');
      loadDatabaseStats();
    } else {
      showMessage('Error: ' + result.error, 'error');
    }
  } catch (error) {
    showMessage('Error limpiando: ' + error.message, 'error');
  }
}

async function searchDatabase() {
  const searchInput = document.getElementById('dbSearchInput');
  const resultsDiv = document.getElementById('dbSearchResults');
  const resultsList = document.getElementById('dbSearchList');
  const countSpan = document.getElementById('dbSearchCount');

  const query = searchInput.value.trim();
  if (!query) return;

  try {
    const response = await fetch('/api/db/negocios?q=' + encodeURIComponent(query) + '&limit=50');
    const result = await response.json();

    if (result.success) {
      const negocios = result.data.negocios;
      countSpan.textContent = negocios.length;
      
      if (negocios.length === 0) {
        resultsList.innerHTML = '<p style="color: #666; text-align: center;">No se encontraron resultados</p>';
      } else {
        resultsList.innerHTML = negocios.map(function(n) {
          return '<div class="db-search-item">' +
            '<div>' +
              '<div class="db-search-item-name">' + escapeHtml(n.nombre || '') + '</div>' +
              '<div class="db-search-item-info">' + escapeHtml(n.categoria || '') + ' - ' + escapeHtml(n.ciudad || '') + '</div>' +
            '</div>' +
            '<div>' +
              '<span class="db-search-item-rating">' + (n.rating ? '★ ' + n.rating : '') + '</span>' +
              (n.telefono ? '<br><small>' + escapeHtml(n.telefono) + '</small>' : '') +
            '</div>' +
          '</div>';
        }).join('');
      }
      
      resultsDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error searching database:', error);
  }
}

// Initialize database when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(initDatabase, 500);
});
