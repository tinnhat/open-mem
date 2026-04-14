const API_BASE = '';

let currentTab = 'timeline';
let observations = [];
let searchResults = [];
let stats = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  document.getElementById('refreshBtn').addEventListener('click', loadCurrentTab);
  loadCurrentTab();
});

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      loadCurrentTab();
    });
  });
}

function loadCurrentTab() {
  switch (currentTab) {
    case 'timeline': loadTimeline(); break;
    case 'search': loadSearch(); break;
    case 'stats': loadStats(); break;
  }
}

async function api(endpoint) {
  const res = await fetch(API_BASE + endpoint);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadTimeline() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api('/api/observations?limit=50');
    observations = data.observations || [];
    renderTimeline();
  } catch (e) {
    content.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function renderTimeline() {
  const content = document.getElementById('content');
  if (observations.length === 0) {
    content.innerHTML = '<div class="empty">No observations yet</div>';
    return;
  }

  const grouped = {};
  observations.forEach(obs => {
    const date = obs.created_at.split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(obs);
  });

  let html = '';
  Object.keys(grouped).sort().reverse().forEach(date => {
    html += `<div class="date-group">
      <div class="date-header">${date}</div>`;
    grouped[date].forEach(obs => {
      const time = new Date(obs.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      html += `<div class="observation">
        <span class="type-icon type-${obs.type}">${obs.type}</span>
        <div class="obs-content">
          <div class="obs-title">${escapeHtml(obs.title)}</div>
          <div class="obs-time">${time}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  content.innerHTML = html;
}

async function loadSearch() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="search-box">
    <input type="text" id="searchInput" placeholder="Search memories..." />
    <button id="searchBtn">Search</button>
  </div>
  <div id="searchResults"></div>`;

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') doSearch();
  });
}

async function doSearch() {
  const query = document.getElementById('searchInput').value.trim();
  const resultsDiv = document.getElementById('searchResults');
  if (!query) return;
  
  resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
    searchResults = data.results || [];
    renderSearchResults();
  } catch (e) {
    resultsDiv.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function renderSearchResults() {
  const resultsDiv = document.getElementById('searchResults');
  if (searchResults.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No results found</div>';
    return;
  }

  let html = '';
  searchResults.forEach(obs => {
    const date = new Date(obs.created_at).toLocaleDateString();
    html += `<div class="observation">
      <span class="type-icon type-${obs.type}">${obs.type}</span>
      <div class="obs-content">
        <div class="obs-title">${escapeHtml(obs.title)}</div>
        <div class="obs-time">${date}</div>
      </div>
    </div>`;
  });
  resultsDiv.innerHTML = html;
}

async function loadStats() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Loading...</div>';
  try {
    stats = await api('/api/stats');
    renderStats();
  } catch (e) {
    content.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function renderStats() {
  const content = document.getElementById('content');
  const total = stats.total || 0;
  const byType = stats.byType || {};
  const maxCount = Math.max(...Object.values(byType), 1);

  let html = `<div class="stat-card">
    <div class="stat-label">Total Observations</div>
    <div class="stat-value">${total}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Storage Size</div>
    <div class="stat-value">${stats.storageSize || 'N/A'}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">By Type</div>
    <div class="stat-breakdown">`;

  const typeOrder = ['bugfix', 'feature', 'decision', 'refactor', 'discovery', 'feedback', 'reference'];
  typeOrder.forEach(type => {
    const count = byType[type] || 0;
    if (count > 0 || byType[type] !== undefined) {
      const pct = (count / maxCount) * 100;
      html += `<div class="stat-row">
        <span class="type-icon type-${type}">${type}</span>
        <span>${count}</span>
      </div>
      <div class="stat-bar" style="width:${pct}%"></div>`;
    }
  });

  html += '</div></div>';
  content.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
