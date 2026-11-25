/* TGC CRYPTO — Digital Asset Market Platform */
"use strict";

const API = "https://api.coingecko.com/api/v3";
const KEYS = {
  watchlist: "tgc_crypto_watchlist",
  portfolio: "tgc_crypto_portfolio",
  currency: "tgc_crypto_currency",
  autoRefresh: "tgc_crypto_auto_refresh"
};

let coins = [];
let globalData = null;
let currentPage = "dashboard";
let searchQuery = "";
let refreshTimer = null;
let toastTimer = null;
let requestInProgress = false;

let watchlist = load(KEYS.watchlist, []);
let portfolio = load(KEYS.portfolio, []);
let currency = localStorage.getItem(KEYS.currency) || "idr";
let autoRefresh = localStorage.getItem(KEYS.autoRefresh) !== "false";

const $ = id => document.getElementById(id);

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Unable to save browser data.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function number(value) {
  return Number(value) || 0;
}

function formatPrice(value) {
  if (value === null || value === undefined) return "N/A";
  const amount = number(value);
  return new Intl.NumberFormat(currency === "idr" ? "id-ID" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: currency === "idr" ? (amount < 100 ? 2 : 0) : (amount < 1 ? 6 : 2)
  }).format(amount);
}

function formatCompact(value) {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat(currency === "idr" ? "id-ID" : "en-US", {
    style: "currency", currency: currency.toUpperCase(),
    notation: "compact", maximumFractionDigits: 2
  }).format(number(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 8 }).format(number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined) return "N/A";
  const amount = number(value);
  return (amount > 0 ? "+" : "") + amount.toFixed(2) + "%";
}

function changeClass(value) {
  return number(value) >= 0 ? "positive" : "negative";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* Navigation */
function navigate(page) {
  const validPages = ["dashboard", "market", "watchlist", "portfolio", "settings"];
  if (!validPages.includes(page)) return;

  currentPage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  $(page + "Page").classList.add("active");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  const title = page.charAt(0).toUpperCase() + page.slice(1);
  $("pageTitle").textContent = title;
  $("breadcrumb").textContent = title;
  $("sidebar").classList.remove("open");
  renderPage();
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});
document.querySelectorAll("[data-goto]").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.goto));
});
$("menuToggle").addEventListener("click", () => $("sidebar").classList.add("open"));
$("closeSidebar").addEventListener("click", () => $("sidebar").classList.remove("open"));

/* Market API */
async function fetchMarket() {
  if (requestInProgress) return;
  requestInProgress = true;
  $("connectionText").textContent = "Updating...";
  $("marketUpdated").textContent = "Fetching market information...";

  try {
    const params = new URLSearchParams({
      vs_currency: currency,
      order: "market_cap_desc",
      per_page: "100",
      page: "1",
      sparkline: "true",
      price_change_percentage: "1h,24h,7d"
    });

    const response = await fetch(`${API}/coins/markets?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Market API error: " + response.status);

    const result = await response.json();
    if (!Array.isArray(result)) throw new Error("Invalid market data");

    coins = result;
    await fetchGlobal();

    $("connectionText").textContent = "Connected";
    $("marketUpdated").textContent = "Last updated: " + new Date().toLocaleString("id-ID");
    renderPage();
  } catch (error) {
    console.error("TGC CRYPTO:", error);
    $("connectionText").textContent = "Connection Error";
    $("marketUpdated").textContent = "Unable to update market data. Please try again later.";
    if (!coins.length) {
      $("dashboardCoins").innerHTML = '<tr><td colspan="6" class="empty-state">Unable to load market data. Please refresh.</td></tr>';
      $("marketCoins").innerHTML = '<tr><td colspan="9" class="empty-state">Market data unavailable. Please try again.</td></tr>';
    }
    showToast("Market data could not be updated.");
    renderPage();
  } finally {
    requestInProgress = false;
  }
}

async function fetchGlobal() {
  try {
    const response = await fetch(`${API}/global`, { cache: "no-store" });
    if (!response.ok) throw new Error("Global data unavailable");
    const result = await response.json();
    globalData = result.data;
    renderGlobal();
  } catch (error) {
    console.warn("Global market data unavailable:", error);
  }
}

function renderGlobal() {
  if (!globalData) return;
  const cap = globalData.total_market_cap?.[currency];
  const volume = globalData.total_volume?.[currency];
  const dominance = globalData.market_cap_percentage?.btc;
  $("totalMarketCap").textContent = formatCompact(cap);
  $("totalVolume").textContent = formatCompact(volume);
  $("btcDominance").textContent = dominance != null ? dominance.toFixed(2) + "%" : "N/A";
  const change = globalData.market_cap_change_percentage_24h_usd;
  $("marketCapChange").textContent = change != null
    ? formatPercent(change) + " market cap change (24H)"
    : "Global cryptocurrency market";
}

/* Market rendering */
function coinRow(coin, index, mode) {
  const change1h = coin.price_change_percentage_1h_in_currency;
  const change24 = coin.price_change_percentage_24h;
  const isWatched = watchlist.includes(coin.id);

  return `
    <tr>
      <td>${index + 1}</td>
      <td><div class="coin-info coin-open" data-coin="${escapeHTML(coin.id)}">
        <img src="${escapeHTML(coin.image)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="coin-name"><strong>${escapeHTML(coin.name)}</strong><small>${escapeHTML(coin.symbol.toUpperCase())}</small></div>
      </div></td>
      <td>${formatPrice(coin.current_price)}</td>
      ${mode === "dashboard" ? "" : `<td class="${changeClass(change1h)}">${formatPercent(change1h)}</td>`}
      <td class="${changeClass(change24)}">${formatPercent(change24)}</td>
      ${mode === "dashboard" ? "" : `<td>${sparkline(coin)}</td><td>${formatCompact(coin.total_volume)}</td>`}
      <td>${formatCompact(coin.market_cap)}</td>
      <td><button class="favorite-btn ${isWatched ? "selected" : ""}" data-watch="${escapeHTML(coin.id)}" title="Toggle watchlist">${isWatched ? "★" : "☆"}</button></td>
    </tr>`;
}

function sparkline(coin) {
  const prices = coin.sparkline_in_7d?.price;
  if (!Array.isArray(prices) || prices.length < 2) return '<span class="muted">N/A</span>';
  const values = prices.filter(Number.isFinite);
  if (values.length < 2) return "N/A";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const sampled = values.filter((_, i) => i % Math.max(1, Math.floor(values.length / 25)) === 0);
  const points = sampled.map((v, i) => {
    const x = i / Math.max(sampled.length - 1, 1) * 100;
    const y = 25 - ((v - min) / range * 22);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = values[values.length - 1] >= values[0] ? "#35d49a" : "#f16d79";
  return `<svg width="85" height="28" viewBox="0 0 100 28" aria-label="7 day price trend"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderDashboard() {
  $("dashboardCoins").innerHTML = coins.length
    ? coins.slice(0, 10).map((coin, i) => coinRow(coin, i, "dashboard")).join("")
    : '<tr><td colspan="6" class="loading">Loading market data...</td></tr>';

  const watched = coins.filter(coin => watchlist.includes(coin.id));
  $("dashboardWatchlist").innerHTML = watched.length
    ? watched.slice(0, 3).map(watchCard).join("")
    : '<div class="empty-state">No favorite assets yet. Add assets from Market.</div>';

  $("trackedAssets").textContent = portfolio.length;
}

function renderMarket() {
  const filtered = coins.filter(coin =>
    coin.name.toLowerCase().includes(searchQuery) ||
    coin.symbol.toLowerCase().includes(searchQuery)
  );
  $("marketCoins").innerHTML = filtered.length
    ? filtered.map((coin, i) => coinRow(coin, i, "market")).join("")
    : '<tr><td colspan="9" class="empty-state">No cryptocurrency found.</td></tr>';
}

$("searchInput").addEventListener("input", event => {
  searchQuery = event.target.value.trim().toLowerCase();
  renderMarket();
});
$("clearSearch").addEventListener("click", () => {
  $("searchInput").value = "";
  searchQuery = "";
  renderMarket();
});

/* Watchlist */
function watchCard(coin) {
  return `<div class="watch-card" data-coin="${escapeHTML(coin.id)}">
    <div class="watch-card-top"><div class="coin-info">
      <img src="${escapeHTML(coin.image)}" alt="" width="27" height="27">
      <div class="coin-name"><strong>${escapeHTML(coin.name)}</strong><small>${escapeHTML(coin.symbol.toUpperCase())}</small></div>
    </div><button class="favorite-btn selected" data-watch="${escapeHTML(coin.id)}">★</button></div>
    <h3>${formatPrice(coin.current_price)}</h3>
    <p class="${changeClass(coin.price_change_percentage_24h)}">${formatPercent(coin.price_change_percentage_24h)} (24H)</p>
  </div>`;
}

function renderWatchlist() {
  const watched = coins.filter(coin => watchlist.includes(coin.id));
  $("watchlistCoins").innerHTML = watched.length
    ? watched.map(watchCard).join("")
    : '<div class="empty-state">Your watchlist is empty. Visit Market to add coins.</div>';
}

function toggleWatch(id) {
  if (watchlist.includes(id)) {
    watchlist = watchlist.filter(item => item !== id);
    showToast("Removed from watchlist.");
  } else {
    watchlist.push(id);
    showToast("Added to watchlist.");
  }
  save(KEYS.watchlist, watchlist);
  renderPage();
}

/* Portfolio */
function renderPortfolio() {
  let total = 0;
  const rows = portfolio.map(item => {
    const coin = coins.find(c => c.id === item.id);
    if (!coin) return "";
    const quantity = number(item.quantity);
    const value = quantity * number(coin.current_price);
    total += value;

    return `<tr>
      <td><div class="coin-info"><img src="${escapeHTML(coin.image)}" alt=""><div class="coin-name"><strong>${escapeHTML(coin.name)}</strong><small>${escapeHTML(coin.symbol.toUpperCase())}</small></div></div></td>
      <td>${formatNumber(quantity)}</td><td>${formatPrice(coin.current_price)}</td><td>${formatPrice(value)}</td>
      <td><button class="danger-btn" data-remove-asset="${escapeHTML(item.id)}">Remove</button></td>
    </tr>`;
  }).join("");

  $("portfolioCoins").innerHTML = rows || '<tr><td colspan="5" class="empty-state">No assets recorded yet.</td></tr>';
  $("portfolioValue").textContent = formatPrice(total);
  $("portfolioCount").textContent = portfolio.length;
  $("trackedAssets").textContent = portfolio.length;
}

function openAssetModal() {
  $("assetSelect").innerHTML = '<option value="">Select asset</option>' +
    coins.map(coin => `<option value="${escapeHTML(coin.id)}">${escapeHTML(coin.name)} (${escapeHTML(coin.symbol.toUpperCase())})</option>`).join("");
  $("assetModal").classList.add("show");
}

$("addAssetBtn").addEventListener("click", openAssetModal);
$("assetForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("assetSelect").value;
  const quantity = Number($("assetQuantity").value);

  if (!id || !Number.isFinite(quantity) || quantity <= 0) {
    showToast("Please enter a valid asset and quantity.");
    return;
  }

  const existing = portfolio.find(item => item.id === id);
  if (existing) existing.quantity += quantity;
  else portfolio.push({ id, quantity });

  save(KEYS.portfolio, portfolio);
  $("assetForm").reset();
  closeModal("assetModal");
  renderPortfolio();
  showToast("Portfolio updated successfully.");
});

function removeAsset(id) {
  if (!confirm("Remove this asset from your portfolio?")) return;
  portfolio = portfolio.filter(item => item.id !== id);
  save(KEYS.portfolio, portfolio);
  renderPortfolio();
  showToast("Asset removed.");
}

/* Coin details */
function openCoin(id) {
  const coin = coins.find(item => item.id === id);
  if (!coin) return;

  $("coinDetailContent").innerHTML = `
    <div class="coin-info"><img class="detail-logo" src="${escapeHTML(coin.image)}" alt="">
      <div><strong>${escapeHTML(coin.name)}</strong><small class="muted">${escapeHTML(coin.symbol.toUpperCase())}</small></div>
    </div>
    <div class="detail-price">${formatPrice(coin.current_price)}</div>
    <div class="detail-change ${changeClass(coin.price_change_percentage_24h)}">${formatPercent(coin.price_change_percentage_24h)} (24H)</div>
    <div class="detail-row"><span>Market Cap</span><strong>${formatPrice(coin.market_cap)}</strong></div>
    <div class="detail-row"><span>Trading Volume 24H</span><strong>${formatPrice(coin.total_volume)}</strong></div>
    <div class="detail-row"><span>24H High</span><strong>${formatPrice(coin.high_24h)}</strong></div>
    <div class="detail-row"><span>24H Low</span><strong>${formatPrice(coin.low_24h)}</strong></div>
    <div class="detail-row"><span>Circulating Supply</span><strong>${formatNumber(coin.circulating_supply)}</strong></div>
    <div class="detail-row"><span>Market Rank</span><strong>#${coin.market_cap_rank ?? "N/A"}</strong></div>
    <button class="primary-btn" style="width:100%;margin-top:20px" data-watch="${escapeHTML(coin.id)}">${watchlist.includes(coin.id) ? "★ Remove from Watchlist" : "☆ Add to Watchlist"}</button>`;
  $("coinModal").classList.add("show");
}

/* Delegated actions */
document.addEventListener("click", event => {
  const watchButton = event.target.closest("[data-watch]");
  if (watchButton) {
    event.stopPropagation();
    const id = watchButton.dataset.watch;
    toggleWatch(id);
    if ($("coinModal").classList.contains("show")) openCoin(id);
    return;
  }

  const removeButton = event.target.closest("[data-remove-asset]");
  if (removeButton) {
    removeAsset(removeButton.dataset.removeAsset);
    return;
  }

  const coinElement = event.target.closest("[data-coin]");
  if (coinElement) {
    openCoin(coinElement.dataset.coin);
    return;
  }

  const closeButton = event.target.closest("[data-close]");
  if (closeButton) closeModal(closeButton.dataset.close);
});

function closeModal(id) {
  $(id).classList.remove("show");
}

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.classList.remove("show");
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal.show").forEach(modal => modal.classList.remove("show"));
    $("sidebar").classList.remove("open");
  }
});

/* Settings */
function setCurrency(value) {
  if (!["idr", "usd"].includes(value)) return;
  currency = value;
  localStorage.setItem(KEYS.currency, currency);
  $("currencySelect").value = currency;
  $("settingsCurrency").value = currency;
  if (coins.length) fetchMarket();
}

$("currencySelect").addEventListener("change", event => setCurrency(event.target.value));
$("settingsCurrency").addEventListener("change", event => setCurrency(event.target.value));
$("autoRefresh").checked = autoRefresh;

$("autoRefresh").addEventListener("change", event => {
  autoRefresh = event.target.checked;
  localStorage.setItem(KEYS.autoRefresh, autoRefresh);
  setupAutoRefresh();
  showToast(autoRefresh ? "Auto refresh enabled." : "Auto refresh disabled.");
});

$("resetDataBtn").addEventListener("click", () => {
  if (!confirm("Reset all watchlist and portfolio data?")) return;
  watchlist = [];
  portfolio = [];
  save(KEYS.watchlist, watchlist);
  save(KEYS.portfolio, portfolio);
  renderPage();
  showToast("Local data has been reset.");
});

/* Page rendering and refresh */
function renderPage() {
  if (currentPage === "dashboard") renderDashboard();
  if (currentPage === "market") renderMarket();
  if (currentPage === "watchlist") renderWatchlist();
  if (currentPage === "portfolio") renderPortfolio();
}

function setupAutoRefresh() {
  clearInterval(refreshTimer);
  if (autoRefresh) refreshTimer = setInterval(fetchMarket, 60000);
}

$("refreshBtn").addEventListener("click", () => {
  fetchMarket();
  showToast("Refreshing market data...");
});

function initialize() {
  $("currencySelect").value = currency;
  $("settingsCurrency").value = currency;
  $("autoRefresh").checked = autoRefresh;
  renderPage();
  setupAutoRefresh();
  fetchMarket();
}

initialize();
