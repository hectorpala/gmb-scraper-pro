/**
 * GMB Scraper Pro v2.0 - Frontend Application
 */

const state = {
  isLoading: false,
  results: [],
  stats: null,
  exports: { json: null, csv: null },
  googleSheets: { configured: false, authenticated: false, url: null },
  activeTab: 'ciudad'
};

const elements = {};

async function init() {
  // Cache elements
  elements.form = document.getElementById('searchForm');
  elements.searchBtn = document.getElementById('searchBtn');
  elements.btnText = document.querySelector('.btn-text');
  elements.btnLoading = document.querySelector('.btn-loading');
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

  // Event listeners
  elements.form.addEventListener('submit', handleSubmit);
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

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isLoading) return;

  const formData = new FormData(elements.form);
  let data = {};

  if (state.activeTab === 'ciudad') {
    data = {
      businessType: formData.get('businessType')?.trim(),
      city: formData.get('city')?.trim(),
      country: formData.get('country')?.trim()
    };
    if (!data.businessType || !data.city || !data.country) {
      showMessage('Por favor complete todos los campos', 'error');
      return;
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
      showMessage('Por favor complete tipo de negocio, latitud y longitud', 'error');
      return;
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

  await performSearch(data);
}

async function performSearch(data) {
  setLoading(true);
  hideMessage();
  hideResults();
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
  elements.btnText.style.display = loading ? 'none' : 'inline';
  elements.btnLoading.style.display = loading ? 'inline-flex' : 'none';
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
