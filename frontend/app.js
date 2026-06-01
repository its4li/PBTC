/**
 * Polymarket Bitcoin Dashboard - Frontend App
 */

// ============================================
//  تنظیمات
// ============================================
const API_BASE = "http://localhost:5000/api";
const REFRESH_INTERVAL = 60000; // 60 ثانیه
let allMarkets = [];
let currentChart = null;
let refreshTimer = null;

// ============================================
//  راه‌اندازی اولیه
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Starting Bitcoin Dashboard...");
    loadDashboard();
    startAutoRefresh();
    
    // کلید Escape برای بستن مودال
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });
});

// ============================================
//  بارگذاری داشبورد
// ============================================
async function loadDashboard() {
    showLoading(true);
    updateStatus("loading");
    
    try {
        const response = await fetch(`${API_BASE}/dashboard`);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            const data = result.data;
            
            // بروزرسانی آمار
            updateStats(data.summary);
            
            // ذخیره و نمایش بازارها
            allMarkets = data.active_markets || [];
            renderMarkets(allMarkets);
            
            // بازارهای برتر
            renderTopMarkets(data.top_by_volume || []);
            
            // بروزرسانی وضعیت
            updateStatus("connected");
            updateLastRefreshTime();
            
            console.log(`✅ Loaded ${allMarkets.length} Bitcoin markets`);
        } else {
            throw new Error(result.error || "Unknown error");
        }
        
    } catch (error) {
        console.error("❌ Dashboard load error:", error);
        updateStatus("error");
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================
//  بروزرسانی آمار
// ============================================
function updateStats(summary) {
    if (!summary) return;
    
    animateNumber("totalMarkets", summary.total_markets || 0);
    animateNumber("activeMarkets", summary.active_markets || 0);
    
    const volume = summary.total_volume || 0;
    document.getElementById("totalVolume").textContent = formatCurrency(volume);
    
    const liquidity = summary.total_liquidity || 0;
    document.getElementById("totalLiquidity").textContent = formatCurrency(liquidity);
}

function animateNumber(elementId, target) {
    const element = document.getElementById(elementId);
    const start = parseInt(element.textContent) || 0;
    const duration = 800;
    const startTime = performance.now();
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = Math.round(start + (target - start) * eased);
        element.textContent = current.toLocaleString("fa-IR");
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

// ============================================
//  رندر بازارها
// ============================================
function renderMarkets(markets) {
    const grid = document.getElementById("marketsGrid");
    const countBadge = document.getElementById("marketCount");
    
    countBadge.textContent = markets.length;
    
    if (markets.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-state-icon">🔍</div>
                <h3>بازاری یافت نشد</h3>
                <p>هیچ بازار پیش‌بینی بیت‌کوینی فعال نیست</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = markets.map((market, index) => {
        const prices = getMarketPrices(market);
        const yesProb = prices.yes;
        const noProb = prices.no;
        const volume = parseFloat(market.volume || 0);
        const liquidity = parseFloat(market.liquidity || 0);
        const isActive = market.active && !market.closed;
        
        return `
            <div class="market-card" onclick="openMarketDetail('${escapeHtml(market.id || market.condition_id || '')}', ${index})"
                 style="animation: fadeInUp 0.4s ease-out ${index * 0.05}s both;">
                <div class="market-header">
                    <h3 class="market-title">${escapeHtml(market.title || 'بدون عنوان')}</h3>
                    <span class="market-status ${isActive ? 'active' : 'closed'}">
                        ${isActive ? '🟢 فعال' : '🔴 بسته'}
                    </span>
                </div>
                
                <div class="probability-bar">
                    <div class="probability-labels">
                        <div>
                            <span class="prob-label">بله (Yes)</span>
                            <span class="prob-yes">${yesProb}%</span>
                        </div>
                        <div style="text-align: left;">
                            <span class="prob-label">خیر (No)</span>
                            <span class="prob-no">${noProb}%</span>
                        </div>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${yesProb}%"></div>
                    </div>
                </div>
                
                <div class="market-stats">
                    <div class="market-stat">
                        <span class="market-stat-value">$${formatNumber(volume)}</span>
                        <span class="market-stat-label">حجم معاملات</span>
                    </div>
                    <div class="market-stat">
                        <span class="market-stat-value">$${formatNumber(liquidity)}</span>
                        <span class="market-stat-label">نقدینگی</span>
                    </div>
                    ${market.end_date ? `
                    <div class="market-stat">
                        <span class="market-stat-value">${formatDate(market.end_date)}</span>
                        <span class="market-stat-label">تاریخ پایان</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join("");
}

// ============================================
//  رندر بازارهای برتر
// ============================================
function renderTopMarkets(markets) {
    const list = document.getElementById("topMarketsList");
    
    if (markets.length === 0) {
        list.innerHTML = '<p class="empty-state">داده‌ای موجود نیست</p>';
        return;
    }
    
    list.innerHTML = markets.slice(0, 10).map((market, index) => {
        const prices = getMarketPrices(market);
        const volume = parseFloat(market.volume || 0);
        const probClass = prices.yes >= 70 ? 'high' : prices.yes >= 40 ? 'medium' : 'low';
        const medals = ['🥇', '🥈', '🥉'];
        
        return `
            <div class="top-market-item" onclick="openMarketDetail('${escapeHtml(market.id || market.condition_id || '')}', -1)"
                 style="animation: fadeInUp 0.3s ease-out ${index * 0.05}s both;">
                <span class="top-rank">${medals[index] || (index + 1)}</span>
                <div class="top-market-info">
                    <div class="top-market-title">${escapeHtml(market.title || 'بدون عنوان')}</div>
                    <div class="top-market-meta">
                        <span>💰 $${formatNumber(volume)}</span>
                        <span>📊 ${market.outcomes ? market.outcomes.length : 2} پیامد</span>
                    </div>
                </div>
                <div class="top-market-prob">
                    <div class="top-prob-value ${probClass}">${prices.yes}%</div>
                    <span style="font-size:0.7rem;color:var(--text-muted);">احتمال Yes</span>
                </div>
            </div>
        `;
    }).join("");
}

// ============================================
//  مودال جزئیات بازار
// ============================================
async function openMarketDetail(marketId, index) {
    const modal = document.getElementById("marketModal");
    const modalBody = document.getElementById("modalBody");
    
    // پیدا کردن بازار
    let market = null;
    if (index >= 0 && index < allMarkets.length) {
        market = allMarkets[index];
    } else {
        market = allMarkets.find(m => 
            (m.id === marketId) || (m.condition_id === marketId)
        );
    }
    
    if (!market) {
        // تلاش برای دریافت از API
        try {
            const response = await fetch(`${API_BASE}/market/${marketId}`);
            const result = await response.json();
            if (result.success) market = result.data;
        } catch (e) {
            console.error("Error fetching market detail:", e);
        }
    }
    
    if (!market) {
        modalBody.innerHTML = '<p class="empty-state">اطلاعات بازار یافت نشد</p>';
        modal.classList.add("active");
        return;
    }
    
    const prices = getMarketPrices(market);
    const volume = parseFloat(market.volume || 0);
    const liquidity = parseFloat(market.liquidity || 0);
    const slug = market.slug || market.market_slug || "";
    
    modalBody.innerHTML = `
        <h2 class="modal-title">${escapeHtml(market.title || 'بدون عنوان')}</h2>
        
        <!-- آمار -->
        <div class="modal-section">
            <h3>📊 آمار بازار</h3>
            <div class="modal-stats-grid">
                <div class="modal-stat-card">
                    <div class="modal-stat-value" style="color:var(--accent-green);">${prices.yes}%</div>
                    <div class="modal-stat-label">احتمال Yes</div>
                </div>
                <div class="modal-stat-card">
                    <div class="modal-stat-value" style="color:var(--accent-red);">${prices.no}%</div>
                    <div class="modal-stat-label">احتمال No</div>
                </div>
                <div class="modal-stat-card">
                    <div class="modal-stat-value">$${formatNumber(volume)}</div>
                    <div class="modal-stat-label">حجم معاملات</div>
                </div>
                <div class="modal-stat-card">
                    <div class="modal-stat-value">$${formatNumber(liquidity)}</div>
                    <div class="modal-stat-label">نقدینگی</div>
                </div>
            </div>
        </div>
        
        <!-- نوار احتمال بزرگ -->
        <div class="modal-section">
            <div class="probability-bar">
                <div class="probability-labels">
                    <div>
                        <span class="prob-label">بله (Yes)</span>
                        <span class="prob-yes" style="font-size:1.4rem;">${prices.yes}%</span>
                    </div>
                    <div style="text-align:left;">
                        <span class="prob-label">خیر (No)</span>
                        <span class="prob-no" style="font-size:1.4rem;">${prices.no}%</span>
                    </div>
                </div>
                <div class="bar-track" style="height:14px;">
                    <div class="bar-fill" style="width:${prices.yes}%"></div>
                </div>
            </div>
        </div>
        
        <!-- نمودار تاریخچه قیمت -->
        <div class="modal-section">
            <h3>📈 تاریخچه قیمت</h3>
            <div class="chart-container">
                <canvas id="priceChart"></canvas>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn" onclick="loadPriceChart('${getTokenId(market, 0)}', '1d')">۱ روز</button>
                <button class="btn" onclick="loadPriceChart('${getTokenId(market, 0)}', '1w')">۱ هفته</button>
                <button class="btn" onclick="loadPriceChart('${getTokenId(market, 0)}', '1m')">۱ ماه</button>
                <button class="btn" onclick="loadPriceChart('${getTokenId(market, 0)}', 'all')">همه</button>
            </div>
        </div>
        
        <!-- پیامدها -->
        <div class="modal-section">
            <h3>🎯 پیامدها</h3>
            <div class="outcomes-detail">
                ${(market.outcomes || ["Yes", "No"]).map((outcome, i) => {
                    const isYes = i === 0;
                    const prob = isYes ? prices.yes : prices.no;
                    return `
                        <div class="outcome-chip ${isYes ? 'yes' : 'no'}">
                            ${outcome}: ${prob}%
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
        
        ${market.description ? `
        <div class="modal-section">
            <h3>📝 توضیحات</h3>
            <p class="modal-description">${escapeHtml(market.description)}</p>
        </div>
        ` : ''}
        
        ${market.end_date ? `
        <div class="modal-section">
            <h3>📅 تاریخ‌ها</h3>
            <p class="modal-description">
                ${market.start_date ? `شروع: ${formatDate(market.start_date)}` : ''}
                ${market.end_date ? ` | پایان: ${formatDate(market.end_date)}` : ''}
            </p>
        </div>
        ` : ''}
        
        <!-- لینک به Polymarket -->
        <div class="modal-section">
            ${slug ? `
                <a href="https://polymarket.com/event/${slug}" target="_blank" class="polymarket-link">
                    🔗 مشاهده در Polymarket
                </a>
            ` : ''}
        </div>
    `;
    
    modal.classList.add("active");
    
    // بارگذاری نمودار
    const tokenId = getTokenId(market, 0);
    if (tokenId) {
        loadPriceChart(tokenId, '1w');
    }
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("marketModal").classList.remove("active");
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

// ============================================
//  نمودار تاریخچه قیمت
// ============================================
async function loadPriceChart(tokenId, interval = '1w') {
    if (!tokenId || tokenId === 'undefined') {
        console.warn("No token ID for chart");
        return;
    }
    
    try {
        const response = await fetch(
            `${API_BASE}/price-history/${tokenId}?interval=${interval}&fidelity=60`
        );
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            renderChart(result.data);
        } else {
            const canvas = document.getElementById("priceChart");
            if (canvas) {
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#64748b";
                ctx.font = "14px Vazirmatn";
                ctx.textAlign = "center";
                ctx.fillText("داده‌ای برای نمایش نمودار موجود نیست", canvas.width / 2, canvas.height / 2);
            }
        }
    } catch (error) {
        console.error("Chart load error:", error);
    }
}

function renderChart(historyData) {
    const canvas = document.getElementById("priceChart");
    if (!canvas) return;
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const labels = historyData.map(point => {
        const timestamp = point.t || point.timestamp || point.time;
        if (!timestamp) return '';
        const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
        return date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }) + 
               ' ' + date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    });
    
    const prices = historyData.map(point => {
        const price = point.p || point.price || point.mid || 0;
        return (parseFloat(price) * 100).toFixed(1);
    });
    
    currentChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'احتمال (%)',
                data: prices,
                borderColor: '#f7931a',
                backgroundColor: 'rgba(247, 147, 26, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#f7931a',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#f7931a',
                    titleFont: { family: 'Vazirmatn' },
                    bodyFont: { family: 'Vazirmatn', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y}%`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(30, 41, 59, 0.5)' },
                    ticks: { 
                        color: '#64748b',
                        maxTicksLimit: 8,
                        font: { family: 'Vazirmatn', size: 10 }
                    }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(30, 41, 59, 0.5)' },
                    ticks: { 
                        color: '#64748b',
                        callback: (val) => val + '%',
                        font: { family: 'Vazirmatn', size: 10 }
                    },
                    min: 0,
                    max: 100
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// ============================================
//  فیلتر و جستجو
// ============================================
function applyFilters() {
    const sortBy = document.getElementById("sortSelect").value;
    const status = document.getElementById("statusSelect").value;
    
    let filtered = [...allMarkets];
    
    // فیلتر وضعیت
    if (status === "active") {
        filtered = filtered.filter(m => m.active && !m.closed);
    } else if (status === "closed") {
        filtered = filtered.filter(m => m.closed);
    }
    
    // مرتب‌سازی
    if (sortBy === "volume") {
        filtered.sort((a, b) => parseFloat(b.volume || 0) - parseFloat(a.volume || 0));
    } else if (sortBy === "liquidity") {
        filtered.sort((a, b) => parseFloat(b.liquidity || 0) - parseFloat(a.liquidity || 0));
    } else if (sortBy === "newest") {
        filtered.sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
    } else if (sortBy === "probability") {
        filtered.sort((a, b) => {
            const probA = getMarketPrices(a).yes;
            const probB = getMarketPrices(b).yes;
            return probB - probA;
        });
    }
    
    // اعمال جستجو
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(m => {
            const title = (m.title || "").toLowerCase();
            const desc = (m.description || "").toLowerCase();
            return title.includes(searchTerm) || desc.includes(searchTerm);
        });
    }
    
    renderMarkets(filtered);
}

function filterBySearch() {
    applyFilters();
}

// ============================================
//  بروزرسانی خودکار
// ============================================
function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        console.log("🔄 Auto-refreshing...");
        loadDashboard();
    }, REFRESH_INTERVAL);
}

async function refreshData() {
    const btn = document.getElementById("refreshBtn");
    btn.classList.add("loading");
    btn.textContent = "⏳ در حال بروزرسانی...";
    
    try {
        // پاک‌سازی کش سرور
        await fetch(`${API_BASE}/refresh`, { method: "POST" });
        // بارگذاری مجدد
        await loadDashboard();
    } catch (e) {
        console.error("Refresh error:", e);
    } finally {
        btn.classList.remove("loading");
        btn.textContent = "🔄 بروزرسانی";
    }
}

// ============================================
//  توابع کمکی
// ============================================
function getMarketPrices(market) {
    let yes = 50, no = 50;
    
    // بررسی live_prices
    if (market.live_prices && market.live_prices.length >= 2) {
        yes = parseFloat(market.live_prices[0]) || 0;
        no = parseFloat(market.live_prices[1]) || 0;
        
        // اگر بین 0 و 1 هستند، به درصد تبدیل کن
        if (yes <= 1 && no <= 1) {
            yes = Math.round(yes * 100);
            no = Math.round(no * 100);
        } else {
            yes = Math.round(yes);
            no = Math.round(no);
        }
    }
    // بررسی outcome_prices
    else if (market.outcome_prices) {
        let op = market.outcome_prices;
        if (typeof op === "string") {
            try {
                op = JSON.parse(op);
            } catch (e) {
                op = [];
            }
        }
        if (Array.isArray(op) && op.length >= 2) {
            yes = parseFloat(op[0]) || 0;
            no = parseFloat(op[1]) || 0;
            if (yes <= 1 && no <= 1) {
                yes = Math.round(yes * 100);
                no = Math.round(no * 100);
            } else {
                yes = Math.round(yes);
                no = Math.round(no);
            }
        }
    }
    
    // اطمینان از محدوده معتبر
    yes = Math.max(0, Math.min(100, yes));
    no = Math.max(0, Math.min(100, no));
    
    // اگر مجموع 100 نیست، نرمالایز کن
    if (yes + no > 0 && Math.abs((yes + no) - 100) > 5) {
        const total = yes + no;
        yes = Math.round((yes / total) * 100);
        no = 100 - yes;
    }
    
    return { yes, no };
}

function getTokenId(market, index) {
    const tokens = market.tokens || [];
    if (Array.isArray(tokens) && tokens.length > index) {
        const token = tokens[index];
        if (typeof token === "string") return token;
        if (typeof token === "object") return token.token_id || "";
    }
    return "";
}

function formatCurrency(amount) {
    if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (show) {
        overlay.classList.remove("hidden");
    } else {
        overlay.classList.add("hidden");
    }
}

function updateStatus(status) {
    const badge = document.getElementById("statusBadge");
    if (status === "connected") {
        badge.className = "status-badge";
        badge.innerHTML = '<span class="status-dot"></span> متصل';
    } else if (status === "error") {
        badge.className = "status-badge error";
        badge.innerHTML = '<span class="status-dot" style="background:var(--accent-red)"></span> خطا';
    } else {
        badge.className = "status-badge";
        badge.innerHTML = '<span class="status-dot" style="animation:spin 0.8s linear infinite"></span> بارگذاری...';
    }
}

function updateLastRefreshTime() {
    const el = document.getElementById("lastUpdate");
    const now = new Date();
    el.textContent = `آخرین بروزرسانی: ${now.toLocaleTimeString('fa-IR')}`;
}

function showError(message) {
    const grid = document.getElementById("marketsGrid");
    grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
            <div class="empty-state-icon">⚠️</div>
            <h3>خطا در بارگذاری</h3>
            <p>${escapeHtml(message)}</p>
            <button class="btn btn-refresh" onclick="loadDashboard()" style="margin-top:16px;">
                🔄 تلاش مجدد
            </button>
        </div>
    `;
}

// CSS Animation keyframe (اضافه شده از طریق JS)
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
