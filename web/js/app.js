/* Parkland front desk toolkit — desktop only */

const STORAGE_KEY = "parkland-front-desk-drafts-v2";
const THEME_KEY = "parkland-theme";
const THEME_CSS_VER = "1.16.1";
const THEME_CSS = {
  light: `css/theme-light.css?v=${THEME_CSS_VER}`, // v1.11 亮綠
  dark: `css/theme-dark.css?v=${THEME_CSS_VER}`, // v1.8 青橘
};

/** 淺色 = v1.11 亮綠；深色 = v1.8 青橘 */
function getTheme() {
  const t =
    document.documentElement.getAttribute("data-theme") ||
    window.__PARKLAND_THEME__ ||
    "light";
  return t === "dark" ? "dark" : "light";
}

function applyTheme(mode, { persist = true } = {}) {
  const theme = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  window.__PARKLAND_THEME__ = theme;
  const link = document.getElementById("theme-stylesheet");
  if (link) link.href = THEME_CSS[theme];
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore */
    }
  }
  syncThemeToggleUI();
}

function syncThemeToggleUI() {
  const theme = getTheme();
  // 掣顯示「可以切去邊個」：而家淺色 → 顯示深色；而家深色 → 顯示淺色
  const nextIsDark = theme !== "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const icon = btn.querySelector(".theme-toggle-icon");
    const label = btn.querySelector(".theme-toggle-label");
    if (icon) icon.textContent = nextIsDark ? "🌙" : "☀️";
    if (label) label.textContent = nextIsDark ? "深色" : "淺色";
    btn.setAttribute(
      "title",
      nextIsDark ? "切換至深色（青橘 v1.8）" : "切換至淺色（亮綠 v1.11）"
    );
    btn.setAttribute("aria-label", nextIsDark ? "切換至深色模式" : "切換至淺色模式");
  });
}

function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}

function bindThemeToggles() {
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    if (btn.dataset.boundTheme) return;
    btn.dataset.boundTheme = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleTheme();
    });
  });
  syncThemeToggleUI();
}

// 登入頁都用得到：DOM ready 即綁
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindThemeToggles);
} else {
  bindThemeToggles();
}

/** 香港天文台 Open Data — 天氣警告（每 5 分鐘 refresh；主 API + 備用） */
const HKO_WARNSUM_URL =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc";
const HKO_WARNING_INFO_URL =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warningInfo&lang=tc";
/** 天氣／臨界警報：每 5 分鐘 scan 一次 */
const HKO_REFRESH_MS = 5 * 60 * 1000;
const HKO_FETCH_TIMEOUT_MS = 10000;
const PAGE_TITLE_BASE = "Parkland 前台工具箱";

/** 臨界 = 黑雨 或 八號／九號／十號（參考 hko-rain-monitor） */
let hkoLastCritical = false;
let hkoTitleTimer = null;
let hkoTitleFlip = false;
let hkoTitleA = "⚠️⚠️ 臨界警報！";
let hkoTitleB = "!!!! ALERT !!!!";

const HKO_CODE_NAME = {
  WFIRE: "火災危險警告",
  WFROST: "霜凍警告",
  WHOT: "酷熱天氣警告",
  WCOLD: "寒冷天氣警告",
  WMSGNL: "強烈季候風信號",
  WTCPRE8: "預警八號熱帶氣旋警告信號",
  WRAIN: "暴雨警告信號",
  WFNTSA: "新界北部水浸特別報告",
  WL: "山泥傾瀉警告",
  WTCSGNL: "熱帶氣旋警告信號",
  WTMW: "海嘯警告",
  WTS: "雷暴警告",
};

const EMOJI_QUICK = [
  "😊", "🙂", "😅", "🙏", "‼️", "✅", "✔️", "❌",
  "👍", "👌", "🎉", "✨", "⚠️", "📌", "🔔", "💬",
  "❤️", "🎵", "📝", "💰", "📅", "🕐", "🏫",
];

const state = {
  tab: "templates",
  templates: [],
  policySnippets: [],
  assets: null,
  branches: null,
  links: null,
  groupFilter: "全部",
  originals: new Map(), // id -> original body
  drafts: new Map(),
  lastFocusedTa: null,
  saveTimer: null,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* ---------- HKO weather bar (uses $ — defined above) ---------- */

/** 將 HKO type 代碼轉成可讀文字（例如 WRAINR → 紅色） */
function hkoTypeLabel(type) {
  if (!type) return "";
  const t = String(type).toUpperCase();
  const map = {
    WRAINA: "黃色",
    WRAINR: "紅色",
    WRAINB: "黑色",
    TC1: "一號戒備",
    TC3: "三號強風",
    TC8NE: "八號東北烈風",
    TC8NW: "八號西北烈風",
    TC8SE: "八號東南烈風",
    TC8SW: "八號西南烈風",
    TC9: "九號烈風或暴風風力增強",
    TC10: "十號颶風",
    CANCEL: "取消",
  };
  if (map[t]) return map[t];
  if (/^TC8/.test(t)) return "八號烈風或暴風";
  if (/黃|紅|黑|一號|三號|八號|九號|十號/.test(type)) return type;
  if (t === "AMBER" || t === "YELLOW") return "黃色";
  if (t === "RED") return "紅色";
  if (t === "BLACK") return "黑色";
  return type;
}

/**
 * 警報嚴重程度（影響頂部條紅／黃）
 * red: 黑雨、紅雨、八號或以上風球等
 * yellow: 黃雨、一／三號、雷暴、酷熱、寒冷等
 */
function hkoSeverity(item) {
  const code = (item.code || "").toUpperCase();
  const type = String(item.type || "").toUpperCase();
  const name = item.name || "";
  const blob = `${code} ${type} ${name}`;

  if (code === "WTCSGNL" || /TC\d/.test(type) || name.includes("熱帶氣旋")) {
    if (/TC8|TC9|TC10|八號|九號|十號/.test(blob)) return "red";
    return "yellow";
  }
  if (code === "WRAIN" || name.includes("暴雨")) {
    if (/WRAINB|BLACK|黑色/.test(blob)) return "red";
    if (/WRAINR|\bRED\b|紅色/.test(blob) && !/WRAINA/.test(type)) return "red";
    return "yellow";
  }
  if (code === "WL" || name.includes("山泥傾瀉")) return "red";
  if (code === "WTMW" || name.includes("海嘯")) return "red";
  if (code === "WFNTSA" || name.includes("水浸")) return "yellow";
  return "yellow";
}

/**
 * 臨界警報原因（只有黑雨 + 八號或以上；參考 hko-rain-monitor）
 * @returns {string[]}
 */
function detectCriticalReasons(items) {
  const reasons = [];
  for (const it of items || []) {
    const code = (it.code || "").toUpperCase();
    const type = String(it.type || "").toUpperCase();
    const name = it.name || "";
    const blob = `${code} ${type} ${name}`;

    // 黑色暴雨
    if (code === "WRAIN" || name.includes("暴雨")) {
      if (/WRAINB|BLACK|黑色/.test(blob)) {
        reasons.push("黑色暴雨警告");
      }
    }
    // 熱帶氣旋 8 / 9 / 10
    if (code === "WTCSGNL" || name.includes("熱帶氣旋") || /TC\d/.test(type)) {
      if (/TC10|十號/.test(blob)) reasons.push("十號颶風信號");
      else if (/TC9|九號/.test(blob)) reasons.push("九號烈風或暴風風力增強信號");
      else if (/TC8|八號/.test(blob)) reasons.push("八號烈風或暴風信號");
    }
  }
  return [...new Set(reasons)];
}

function criticalShortLabel(reasons) {
  const t = (reasons || []).join("、");
  if (t.includes("十號")) return "十號風球";
  if (t.includes("九號")) return "九號風球";
  if (t.includes("八號")) return "八號風球";
  if (t.includes("黑色")) return "黑色暴雨";
  return "臨界警報";
}

/** 分頁標題閃爍（背景 tab 都睇到；唔靠 Chrome 系統通知） */
function startTitleFlash(a, b) {
  hkoTitleA = a;
  hkoTitleB = b;
  if (hkoTitleTimer) return;
  hkoTitleTimer = setInterval(() => {
    hkoTitleFlip = !hkoTitleFlip;
    document.title = hkoTitleFlip ? hkoTitleA : hkoTitleB;
  }, 700);
}

function stopTitleFlash() {
  if (hkoTitleTimer) {
    clearInterval(hkoTitleTimer);
    hkoTitleTimer = null;
  }
  document.title = PAGE_TITLE_BASE;
}

/**
 * 臨界時：標題閃 + 全頁邊框閃（同 hko-rain-monitor 思路）
 * 唔依賴 Notification API（Windows Chrome 分頁背景都得）
 */
function applyCriticalAlert(critical, reasons) {
  const reasonText = (reasons && reasons.length ? reasons : ["臨界天氣警報"]).join("、");
  if (critical) {
    document.body.classList.add("weather-alert-mode");
    const short = criticalShortLabel(reasons);
    startTitleFlash(`⚠️⚠️ ${short}！`, "!!!! ALERT !!!!");
    // 頂部條文字已由 setWeatherBar 處理；加 aria 提示
    const bar = document.getElementById("weather-bar");
    if (bar) {
      bar.setAttribute("data-critical", "1");
      bar.title = `臨界警報：${reasonText}（分頁標題會閃爍）`;
    }
  } else {
    document.body.classList.remove("weather-alert-mode");
    stopTitleFlash();
    const bar = document.getElementById("weather-bar");
    if (bar) {
      bar.removeAttribute("data-critical");
      bar.title = "資料來源：香港天文台 Open Data";
    }
  }
  hkoLastCritical = critical;
}

function formatHkoTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-HK", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatLocalNow() {
  return new Date().toLocaleString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function setWeatherBar({ level, text, updatedLabel }) {
  const bar = document.getElementById("weather-bar");
  const textEl = document.getElementById("weather-bar-text");
  const updatedEl = document.getElementById("weather-bar-updated");
  if (!bar || !textEl) {
    console.warn("weather-bar DOM missing");
    return;
  }

  bar.className = `weather-bar weather-bar--${level}`;
  const icons = {
    loading: "⏳",
    ok: "✅",
    yellow: "⚠️",
    red: "🚨",
    error: "📡",
    idle: "⏳",
  };
  const iconEl = bar.querySelector(".weather-bar-icon");
  if (iconEl) iconEl.textContent = icons[level] || "ℹ️";
  textEl.textContent = text;
  if (updatedEl) updatedEl.textContent = updatedLabel || "—";
}

function parseWarnsumJson(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.values(data).filter(
    (x) => x && typeof x === "object" && (x.name || x.code)
  );
}

function parseWarningInfoJson(data) {
  const details = data && Array.isArray(data.details) ? data.details : [];
  return details
    .map((d) => {
      const code = d.warningStatementCode || d.code || "";
      const name = HKO_CODE_NAME[code] || code || "天氣警告";
      return {
        code,
        name,
        type: d.subtype || d.type || "",
        updateTime: d.updateTime || "",
      };
    })
    .filter((x) => x.code || x.name);
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchHkoWarnings() {
  const errors = [];

  // 主：warnsum（一覽）
  try {
    const url = `${HKO_WARNSUM_URL}&_=${Date.now()}`;
    const res = await fetchWithTimeout(url, HKO_FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`warnsum HTTP ${res.status}`);
    const data = await res.json();
    return parseWarnsumJson(data);
  } catch (e) {
    errors.push(e);
    console.warn("HKO warnsum failed", e);
  }

  // 備：warningInfo（詳細；同樣有 CORS）
  try {
    const url = `${HKO_WARNING_INFO_URL}&_=${Date.now()}`;
    const res = await fetchWithTimeout(url, HKO_FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`warningInfo HTTP ${res.status}`);
    const data = await res.json();
    return parseWarningInfoJson(data);
  } catch (e) {
    errors.push(e);
    console.warn("HKO warningInfo failed", e);
  }

  const msg = errors.map((e) => (e && e.name === "AbortError" ? "逾時" : e?.message || String(e))).join("; ");
  throw new Error(msg || "HKO fetch failed");
}

async function refreshWeatherBar({ manual = false } = {}) {
  const btn = document.getElementById("weather-bar-refresh");
  if (btn) btn.disabled = true;

  // 手動刷新先顯示 loading；自動 refresh 唔清畫面（避免每 60 秒閃）
  if (manual || !document.getElementById("weather-bar-text")?.textContent) {
    setWeatherBar({
      level: "loading",
      text: manual ? "正在重新讀取天文台天氣警告…" : "正在讀取天文台天氣警告…",
      updatedLabel: "更新中…",
    });
  }

  try {
    const items = await fetchHkoWarnings();
    const fetchedAt = formatLocalNow();
    const critReasons = detectCriticalReasons(items);
    const critical = critReasons.length > 0;

    if (!items.length) {
      setWeatherBar({
        level: "ok",
        text: "而家冇天氣警告（香港天文台）",
        updatedLabel: `已更新 ${fetchedAt} · 每 5 分鐘自動更新`,
      });
      applyCriticalAlert(false, []);
      return;
    }

    const labels = items.map((it) => {
      const name = it.name || it.code || "警告";
      const typeLabel = hkoTypeLabel(it.type);
      if (typeLabel && !name.includes(typeLabel)) {
        return `${name}（${typeLabel}）`;
      }
      return name;
    });

    // 臨界一定用紅條；其餘跟 severity
    let level = "yellow";
    if (critical) level = "red";
    else if (items.map(hkoSeverity).includes("red")) level = "red";

    let hkoUpdated = "";
    for (const it of items) {
      if (it.updateTime) {
        hkoUpdated = formatHkoTime(it.updateTime);
        break;
      }
    }

    const prefix = critical ? "🚨 臨界警報：" : "生效警告：";
    setWeatherBar({
      level,
      text: `${prefix}${labels.join("　·　")}`,
      updatedLabel: hkoUpdated
        ? `天文台 ${hkoUpdated} · 本機 ${fetchedAt} · 每 5 分鐘`
        : `已更新 ${fetchedAt} · 每 5 分鐘自動更新`,
    });

    applyCriticalAlert(critical, critReasons);
  } catch (e) {
    console.warn("HKO weather fetch failed", e);
    // 網絡失敗：唔取消已有臨界閃爍（避免誤以為解除）
    setWeatherBar({
      level: hkoLastCritical ? "red" : "error",
      text: hkoLastCritical
        ? "未能更新天氣（仍維持臨界警示顯示；請以天文台為準）"
        : "未能讀取天文台警告（網絡／VPN 可能攔截；以天文台最新公布為準）",
      updatedLabel: `失敗 ${formatLocalNow()} · 5 分鐘後再試`,
    });
  } finally {
    if (btn) btn.disabled = false;
  }
}

function startWeatherBar() {
  if (startWeatherBar._started) {
    // 已啟動：只手動／定時更新，唔重複綁 listener
    refreshWeatherBar();
    return;
  }
  startWeatherBar._started = true;

  refreshWeatherBar();
  if (startWeatherBar._timer) clearInterval(startWeatherBar._timer);
  startWeatherBar._timer = setInterval(() => refreshWeatherBar(), HKO_REFRESH_MS);

  const btn = document.getElementById("weather-bar-refresh");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => refreshWeatherBar({ manual: true }));
  }
}

function toast(msg, isErr = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("err", isErr);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已複製文字 — 去 WhatsApp 貼上");
    return true;
  } catch (e) {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("已複製文字 — 去 WhatsApp 貼上");
      return true;
    } catch {
      toast("複製失敗，請手動選取文字", true);
      return false;
    } finally {
      ta.remove();
    }
  }
}

/**
 * Copy image to clipboard for paste into WhatsApp Desktop.
 * No download — in-memory blob only.
 */
async function copyImageFromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();

    // Clipboard prefers PNG
    let pngBlob = blob;
    if (blob.type !== "image/png") {
      pngBlob = await blobToPng(blob);
    }

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      toast("已複製圖片 — 去 WhatsApp 直接貼上 (Ctrl/Cmd+V)");
      return true;
    }
    throw new Error("ClipboardItem not supported");
  } catch (e) {
    console.error(e);
    toast("複製圖片失敗：請用 Chrome／Edge，並用 http 開本站（唔好 double-click 開檔）", true);
    return false;
  }
}

function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => {
          URL.revokeObjectURL(objUrl);
          if (b) resolve(b);
          else reject(new Error("toBlob failed"));
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("img load failed"));
    };
    img.src = objUrl;
  });
}

/**
 * Try copy PDF as file for paste/attach flows (best-effort).
 * Fallback: open in new tab so user can share from browser if needed.
 */
async function copyPdfFile(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const type = blob.type || "application/pdf";
    const file = new File([blob], filename || "document.pdf", { type });

    if (navigator.clipboard && window.ClipboardItem) {
      // Some Chromium builds accept application/pdf or files
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ [type]: blob }),
        ]);
        toast("已複製 PDF — 試下喺 WhatsApp 貼上；唔得就用「開啟」再分享");
        return true;
      } catch {
        // try generic
        await navigator.clipboard.write([
          new ClipboardItem({ "application/pdf": blob }),
        ]);
        toast("已複製 PDF — 試下喺 WhatsApp 貼上");
        return true;
      }
    }
    throw new Error("no clipboard file support");
  } catch (e) {
    console.warn(e);
    window.open(url, "_blank");
    toast("已開啟 PDF（瀏覽器未必支援直接複製 PDF 檔）", true);
    return false;
  }
}

function openLightbox(src) {
  const lb = $("#lightbox");
  $("#lightbox-img").src = src;
  lb.classList.add("open");
}

function closeLightbox() {
  $("#lightbox").classList.remove("open");
  $("#lightbox-img").src = "";
}

function setTab(tab) {
  state.tab = tab;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
  render();
}

function searchQuery() {
  return ($("#search").value || "").trim().toLowerCase();
}

function matchSearch(text, q) {
  if (!q) return true;
  return (text || "").toLowerCase().includes(q);
}

/* ---------- Local save (this browser only) ---------- */
function loadDraftsFromStorage() {
  state.drafts = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([id, body]) => {
      if (typeof body === "string") state.drafts.set(id, body);
    });
  } catch (e) {
    console.warn("load drafts failed", e);
  }
}

function persistDrafts() {
  try {
    const obj = {};
    state.drafts.forEach((body, id) => {
      const original = state.originals.get(id);
      // only store if different from original (keeps storage small)
      if (original !== undefined && body !== original) obj[id] = body;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    const n = Object.keys(obj).length;
    const el = $("#save-status");
    if (el) {
      el.textContent = n
        ? `已儲存 ${n} 條修改（本機）`
        : "未有修改 · 改字會自動儲存";
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 600);
    }
  } catch (e) {
    console.warn("persist failed", e);
    toast("儲存失敗（瀏覽器可能禁咗本機儲存）", true);
  }
}

function saveDrafts() {
  if (!state.drafts) state.drafts = new Map();
  state.templates.forEach((t) => {
    const ta = $(`#ta-${t.id}`);
    if (ta) state.drafts.set(t.id, ta.value);
  });
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persistDrafts, 250);
}

function insertEmoji(emoji) {
  let ta = state.lastFocusedTa;
  if (!ta || !document.body.contains(ta)) {
    ta = $("#panel-templates textarea");
  }
  if (!ta) {
    toast("請先撳一下要改嘅文字框", true);
    return;
  }
  ta.focus();
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  ta.value = before + emoji + after;
  const pos = start + emoji.length;
  ta.setSelectionRange(pos, pos);
  state.lastFocusedTa = ta;
  saveDrafts();
}

/* ---------- Templates ---------- */
function renderTemplates() {
  const root = $("#panel-templates");
  const q = searchQuery();
  const groups = ["全部", ...new Set(state.templates.map((t) => t.group))];
  const draftCount = [...state.drafts.entries()].filter(
    ([id, body]) => body !== state.originals.get(id)
  ).length;

  let html = `
    <div class="tpl-toolbar">
      <div class="save-row">
        <span id="save-status" class="save-status">${
          draftCount
            ? `已儲存 ${draftCount} 條修改（本機）`
            : "未有修改 · 改字會自動儲存"
        }</span>
        <span class="save-hint">只保存在呢部電腦嘅呢個瀏覽器；換電腦唔會跟住</span>
      </div>
      <div class="emoji-bar" title="撳文字框後再揀 emoji">
        <span class="emoji-label">Emoji</span>
        ${EMOJI_QUICK.map(
          (e) =>
            `<button type="button" class="emoji-btn" data-emoji="${escapeAttr(e)}">${e}</button>`
        ).join("")}
      </div>
    </div>
    <div class="group-row" id="group-chips">`;
  for (const g of groups) {
    html += `<button type="button" class="chip ${state.groupFilter === g ? "active" : ""}" data-group="${g}">${g}</button>`;
  }
  html += `</div><div class="template-list">`;

  const list = state.templates.filter((t) => {
    if (state.groupFilter !== "全部" && t.group !== state.groupFilter) return false;
    const body = state.drafts.get(t.id) ?? t.body;
    const hay = [t.title, body, t.group, ...(t.tags || [])].join(" ");
    return matchSearch(hay, q);
  });

  if (!list.length) {
    html += `<div class="empty">搵唔到模板</div>`;
  } else {
    for (const t of list) {
      if (!state.originals.has(t.id)) state.originals.set(t.id, t.body);
      const body = state.drafts.get(t.id) ?? t.body;
      const dirty = body !== state.originals.get(t.id);
      html += `
        <article class="card" data-id="${t.id}">
          <div class="card-head">
            <div>
              <div class="card-title">${escapeHtml(t.title)}${
                dirty ? ` <span class="dirty-tag">已改</span>` : ""
              }</div>
              <div class="card-meta">${escapeHtml(t.group)}</div>
            </div>
          </div>
          <textarea id="ta-${t.id}" class="emoji-text" spellcheck="false" lang="zh-HK">${escapeHtml(
            body
          )}</textarea>
          <div class="card-actions">
            <button type="button" class="btn btn-primary" data-copy-text="${t.id}">複製文字</button>
            <button type="button" class="btn btn-ghost" data-reset="${t.id}">還原原文</button>
          </div>
        </article>`;
    }
  }
  html += `</div>`;
  root.innerHTML = html;

  root.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      saveDrafts();
      persistDrafts();
      state.groupFilter = chip.dataset.group;
      renderTemplates();
    });
  });
  root.querySelectorAll("[data-copy-text]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.copyText;
      const ta = $(`#ta-${id}`);
      saveDrafts();
      persistDrafts();
      copyText(ta.value);
    });
  });
  root.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.reset;
      const ta = $(`#ta-${id}`);
      ta.value = state.originals.get(id) || "";
      state.drafts.set(id, ta.value);
      persistDrafts();
      toast("已還原原文（本機修改已清）");
      renderTemplates();
    });
  });
  root.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("focus", () => {
      state.lastFocusedTa = ta;
    });
    ta.addEventListener("input", () => {
      const id = ta.id.replace(/^ta-/, "");
      state.drafts.set(id, ta.value);
      saveDrafts();
    });
  });
  root.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep textarea focus
    btn.addEventListener("click", () => insertEmoji(btn.dataset.emoji));
  });
}

/* ---------- Promos / fee images ---------- */
function renderImageGrid(items, container, { wide = false } = {}) {
  const q = searchQuery();
  const filtered = items.filter((it) =>
    matchSearch([it.title, it.search, it.price].filter(Boolean).join(" "), q)
  );
  if (!filtered.length) {
    container.innerHTML = `<div class="empty">搵唔到</div>`;
    return;
  }
  container.innerHTML = filtered
    .map(
      (it) => `
    <article class="img-card ${wide ? "wide" : ""}">
      <div class="thumb" data-zoom="${escapeAttr(it.file)}">
        <img src="${escapeAttr(it.file)}" alt="${escapeAttr(it.title)}" loading="lazy" />
      </div>
      <div class="body">
        <div class="name">${escapeHtml(it.title)}</div>
        ${it.price ? `<div class="price">${escapeHtml(it.priceRaw ? "$" + it.priceRaw.toLocaleString() : it.price)}</div>` : ""}
        <button type="button" class="btn btn-primary" data-copy-img="${escapeAttr(it.file)}">複製圖片</button>
      </div>
    </article>`
    )
    .join("");

  container.querySelectorAll("[data-copy-img]").forEach((btn) => {
    btn.addEventListener("click", () => copyImageFromUrl(btn.dataset.copyImg));
  });
  container.querySelectorAll("[data-zoom]").forEach((el) => {
    el.addEventListener("click", () => openLightbox(el.dataset.zoom));
  });
}

function renderPromos() {
  const root = $("#panel-promos");
  root.innerHTML = `<div class="section-title">8 堂證書課程送樂器 — 撳「複製圖片」再貼去 WhatsApp</div><div class="grid" id="promo-grid"></div>`;
  renderImageGrid(state.assets.promos, $("#promo-grid"));
}

function renderFees() {
  const root = $("#panel-fees");
  const pdf = state.assets.pdfs.feeFull;
  root.innerHTML = `
    <div class="section-title">完整價目 PDF</div>
    <div class="pdf-row">
      <div class="pdf-card">
        <h3>${escapeHtml(pdf.title)}</h3>
        <p>需要成份表時用。可嘗試複製 PDF；唔得就開啟後由瀏覽器分享／另存。</p>
        <div class="card-actions">
          <button type="button" class="btn btn-primary" data-copy-pdf="${escapeAttr(pdf.file)}" data-pdf-name="課程表.pdf">複製 PDF</button>
          <button type="button" class="btn" data-open="${escapeAttr(pdf.file)}">開啟</button>
        </div>
      </div>
    </div>
    <div class="section-title">分科學費表（圖）— 複製後貼 WhatsApp</div>
    <div class="grid" id="fee-grid"></div>`;
  renderImageGrid(state.assets.feeImages, $("#fee-grid"), { wide: true });
  bindPdfButtons(root);
}

function renderRules() {
  const root = $("#panel-rules");
  const { rulesZh, rulesEn } = state.assets.pdfs;
  const weather = state.assets.weatherImage;

  root.innerHTML = `
    <div class="section-title">常用政策速查（複製短句）</div>
    <div class="snippet-grid" id="snippets"></div>

    <div class="section-title">學生守則 PDF</div>
    <div class="pdf-row">
      <div class="pdf-card">
        <h3>${escapeHtml(rulesZh.title)}</h3>
        <p>正式守則文件，傳畀家長用。</p>
        <div class="card-actions">
          <button type="button" class="btn btn-primary" data-copy-pdf="${escapeAttr(rulesZh.file)}" data-pdf-name="學生守則_中文.pdf">複製 PDF</button>
          <button type="button" class="btn" data-open="${escapeAttr(rulesZh.file)}">開啟</button>
        </div>
      </div>
      <div class="pdf-card">
        <h3>${escapeHtml(rulesEn.title)}</h3>
        <p>English rules & regulations.</p>
        <div class="card-actions">
          <button type="button" class="btn btn-primary" data-copy-pdf="${escapeAttr(rulesEn.file)}" data-pdf-name="Rules_EN.pdf">複製 PDF</button>
          <button type="button" class="btn" data-open="${escapeAttr(rulesEn.file)}">開啟</button>
        </div>
      </div>
    </div>

    <div class="section-title">颱風及暴雨警告</div>
    <div class="grid" style="max-width:420px" id="weather-grid"></div>
  `;

  const sn = $("#snippets");
  sn.innerHTML = state.policySnippets
    .filter((s) => matchSearch(s.title + " " + s.body, searchQuery()))
    .map(
      (s) => `
      <div class="snippet">
        <h4>${escapeHtml(s.title)}</h4>
        <p>${escapeHtml(s.body)}</p>
        <button type="button" class="btn btn-primary" data-copy-snippet>${escapeHtml("複製文字")}</button>
      </div>`
    )
    .join("") || `<div class="empty">搵唔到</div>`;

  sn.querySelectorAll("[data-copy-snippet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.parentElement.querySelector("p").textContent;
      copyText(p);
    });
  });

  renderImageGrid(
    [{ title: weather.title, file: weather.file, search: weather.title, price: "" }],
    $("#weather-grid")
  );
  bindPdfButtons(root);
}

/* ---------- 各分校開工收工時間 ---------- */
function branchesReady() {
  return (
    state.branches &&
    Array.isArray(state.branches.branches) &&
    state.branches.branches.length > 0
  );
}

/** 優先用內嵌 js/branches-data.js（唔使 fetch）；再 fallback 拉 JSON */
function loadBranchesData() {
  // already have
  if (branchesReady()) return Promise.resolve(state.branches);

  // embedded bundle (loaded via <script src="js/branches-data.js">)
  if (
    window.PARKLAND_BRANCHES &&
    Array.isArray(window.PARKLAND_BRANCHES.branches) &&
    window.PARKLAND_BRANCHES.branches.length
  ) {
    state.branches = window.PARKLAND_BRANCHES;
    return Promise.resolve(state.branches);
  }

  return fetch(`data/branches.json?v=1.16.1`, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`branches.json HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (!data || !Array.isArray(data.branches) || !data.branches.length) {
        throw new Error("branches.json 格式不正確或空白");
      }
      state.branches = data;
      return data;
    });
}

function paintHoursTable() {
  const root = document.getElementById("panel-hours");
  if (!root) return;

  const data = state.branches;
  if (!branchesReady()) {
    root.innerHTML = `<div class="empty">未有分校時間資料</div>`;
    return;
  }

  const q = searchQuery();
  const std = data.standard || {};
  const list = data.branches.filter((b) =>
    matchSearch(
      [b.name, b.addr, b.phone, b.region, b.mf, b.sat, b.sun, b.search]
        .filter(Boolean)
        .join(" "),
      q
    )
  );

  const regions = [];
  const byRegion = new Map();
  for (const b of list) {
    const r = b.region || "其他";
    if (!byRegion.has(r)) {
      byRegion.set(r, []);
      regions.push(r);
    }
    byRegion.get(r).push(b);
  }

  let html = `
    <div class="hours-legend">
      <span class="hours-legend-std">常見　一至五 ${escapeHtml(std.mf || "12:00–21:00")}　·　六／日 ${escapeHtml(std.sat || "09:00–18:00")}</span>
      <span class="hours-legend-hi">非常規格</span>
    </div>`;

  if (!list.length) {
    html += `<div class="empty">搵唔到分校（試下清空頂部搜尋）</div>`;
    root.innerHTML = html;
    return;
  }

  for (const region of regions) {
    const rows = byRegion.get(region);
    html += `<div class="section-title">${escapeHtml(region)}（${rows.length}）</div>`;
    html += `<div class="hours-table-wrap"><table class="hours-table">
      <thead>
        <tr>
          <th>分校</th>
          <th>地址</th>
          <th>一至五</th>
          <th>六</th>
          <th>日</th>
        </tr>
      </thead>
      <tbody>`;
    for (const b of rows) {
      const rowHi = b.mfHi || b.satHi || b.sunHi;
      const addr = b.addr || "—";
      const mapsQ = encodeURIComponent(addr);
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQ}`;
      html += `<tr class="${rowHi ? "hours-row-hi" : ""}">
        <td class="hours-name">${escapeHtml(b.name)}</td>
        <td class="hours-addr">
          <span class="hours-addr-text">${escapeHtml(addr)}</span>
          ${
            b.addr
              ? `<a class="hours-maps" href="${escapeAttr(
                  mapsUrl
                )}" target="_blank" rel="noopener noreferrer">地圖</a>`
              : ""
          }
        </td>
        <td class="${b.mfHi ? "hours-cell-hi" : ""}">${escapeHtml(b.mf)}</td>
        <td class="${b.satHi ? "hours-cell-hi" : ""}">${escapeHtml(b.sat)}</td>
        <td class="${b.sunHi ? "hours-cell-hi" : ""}">${escapeHtml(b.sun)}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  html += `<p class="hours-source">來源：parklandmusic.com.hk 聯絡我們　·　更新 ${escapeHtml(data.updated || "")}　·　24 小時制　·　共 ${data.branches.length} 間</p>`;
  root.innerHTML = html;
}

function renderHours() {
  const root = document.getElementById("panel-hours");
  if (!root) {
    console.warn("panel-hours missing");
    return;
  }

  // 同步先試內嵌資料（最快、唔受 cache/fetch 影響）
  if (
    !branchesReady() &&
    window.PARKLAND_BRANCHES &&
    Array.isArray(window.PARKLAND_BRANCHES.branches)
  ) {
    state.branches = window.PARKLAND_BRANCHES;
  }

  if (branchesReady()) {
    paintHoursTable();
    return;
  }

  root.innerHTML = `<div class="empty">載入分校開工收工時間…</div>`;
  loadBranchesData()
    .then(() => {
      if (state.tab === "hours") paintHoursTable();
    })
    .catch((e) => {
      console.warn("load branches failed", e);
      if (state.tab !== "hours") return;
      root.innerHTML = `<div class="empty">載入失敗：${escapeHtml(
        e.message || String(e)
      )}<br/><button type="button" class="btn btn-primary" id="hours-retry" style="margin-top:12px">再試</button></div>`;
      document.getElementById("hours-retry")?.addEventListener("click", () => {
        renderHours();
      });
    });
}

/* ---------- 常用連結 ---------- */
function linksReady() {
  return state.links && Array.isArray(state.links.links) && state.links.links.length > 0;
}

function ensureLinksData() {
  if (linksReady()) return;
  if (
    window.PARKLAND_LINKS &&
    Array.isArray(window.PARKLAND_LINKS.links) &&
    window.PARKLAND_LINKS.links.length
  ) {
    state.links = window.PARKLAND_LINKS;
  }
}

function renderLinks() {
  const root = document.getElementById("panel-links");
  if (!root) return;
  ensureLinksData();

  if (!linksReady()) {
    root.innerHTML = `<div class="empty">未有常用連結資料</div>`;
    return;
  }

  const q = searchQuery();
  const list = state.links.links.filter((it) =>
    matchSearch(
      [it.title, it.desc, it.url, it.group, it.search].filter(Boolean).join(" "),
      q
    )
  );

  // group
  const groups = [];
  const byG = new Map();
  for (const it of list) {
    const g = it.group || "其他";
    if (!byG.has(g)) {
      byG.set(g, []);
      groups.push(g);
    }
    byG.get(g).push(it);
  }

  let html = `<div class="section-title">常用連結（撳開啟或複製網址）</div>`;
  if (!list.length) {
    html += `<div class="empty">搵唔到連結（試下清空搜尋）</div>`;
    root.innerHTML = html;
    return;
  }

  for (const g of groups) {
    html += `<div class="section-title">${escapeHtml(g)}（${byG.get(g).length}）</div>`;
    html += `<div class="links-grid">`;
    for (const it of byG.get(g)) {
      html += `
        <article class="link-card">
          <h3 class="link-title">${escapeHtml(it.title)}</h3>
          ${it.desc ? `<p class="link-desc">${escapeHtml(it.desc)}</p>` : ""}
          <p class="link-url" title="${escapeAttr(it.url)}">${escapeHtml(it.url)}</p>
          <div class="card-actions">
            <a class="btn btn-primary" href="${escapeAttr(it.url)}" target="_blank" rel="noopener noreferrer">開啟</a>
            <button type="button" class="btn" data-copy-url="${escapeAttr(it.url)}">複製連結</button>
          </div>
        </article>`;
    }
    html += `</div>`;
  }

  html += `<p class="hours-source">來源：常用連結.rtf　·　更新 ${escapeHtml(
    state.links.updated || ""
  )}　·　共 ${state.links.links.length} 條</p>`;
  root.innerHTML = html;

  root.querySelectorAll("[data-copy-url]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.copyUrl));
  });
}

/* ---------- POS 教學（PDF + 短片預留） ---------- */
function renderPos() {
  const root = $("#panel-pos");
  const pos = state.assets.pos || { pdfs: [], videos: [] };
  const q = searchQuery();

  const pdfs = (pos.pdfs || []).filter((it) =>
    matchSearch([it.title, it.desc, it.search].filter(Boolean).join(" "), q)
  );
  const videos = (pos.videos || []).filter((it) =>
    matchSearch([it.title, it.desc, it.search].filter(Boolean).join(" "), q)
  );

  let html = `
    <div class="section-title">POS 教學 PDF</div>
    <div class="pdf-row" id="pos-pdf-row">`;

  if (!pdfs.length) {
    html += `<div class="empty">未有 PDF（將檔案放入 05-POS教學/ 後更新 assets.json）</div>`;
  } else {
    for (const p of pdfs) {
      const fname = (p.file || "").split("/").pop() || "pos.pdf";
      html += `
        <div class="pdf-card">
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.desc || "POS 操作教學")}</p>
          <div class="card-actions">
            <button type="button" class="btn btn-primary" data-copy-pdf="${escapeAttr(p.file)}" data-pdf-name="${escapeAttr(fname)}">複製 PDF</button>
            <button type="button" class="btn" data-open="${escapeAttr(p.file)}">開啟</button>
          </div>
        </div>`;
    }
  }
  html += `</div>`;

  html += `
    <div class="section-title">短片教學</div>
    <div class="video-row" id="pos-video-row">`;

  if (!videos.length) {
    html += `
      <div class="pdf-card pos-placeholder">
        <h3>稍後加入短片</h3>
        <p>將 <code>.mp4</code> / <code>.webm</code> 放入 <code>05-POS教學/</code>，喺 <code>web/data/assets.json</code> 嘅 <code>pos.videos</code> 加一筆即可。</p>
      </div>`;
  } else {
    for (const v of videos) {
      html += `
        <div class="video-card">
          <h3>${escapeHtml(v.title)}</h3>
          ${v.desc ? `<p class="video-desc">${escapeHtml(v.desc)}</p>` : ""}
          <video controls preload="metadata" playsinline src="${escapeAttr(v.file)}"></video>
          <div class="card-actions">
            <button type="button" class="btn" data-open="${escapeAttr(v.file)}">新分頁開啟</button>
          </div>
        </div>`;
    }
  }
  html += `</div>`;

  root.innerHTML = html;
  bindPdfButtons(root);
}

function bindPdfButtons(root) {
  root.querySelectorAll("[data-copy-pdf]").forEach((btn) => {
    btn.addEventListener("click", () =>
      copyPdfFile(btn.dataset.copyPdf, btn.dataset.pdfName)
    );
  });
  root.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => window.open(btn.dataset.open, "_blank"));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function render() {
  saveDrafts();
  if (state.tab === "templates") renderTemplates();
  else if (state.tab === "promos") renderPromos();
  else if (state.tab === "fees") renderFees();
  else if (state.tab === "rules") renderRules();
  else if (state.tab === "hours") renderHours();
  else if (state.tab === "links") renderLinks();
  else if (state.tab === "pos") renderPos();
}

async function loadMyIp() {
  const el = $("#my-ip");
  const btn = $("#copy-ip");
  if (!el) return;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    const ip = (data && data.ip) || "";
    if (!ip) throw new Error("empty");
    el.textContent = ip;
    el.classList.remove("err");
    if (btn) {
      btn.hidden = false;
      btn.onclick = () => copyText(ip);
    }
  } catch (e) {
    console.warn(e);
    el.textContent = "未能讀取";
    el.classList.add("err");
    if (btn) btn.hidden = true;
  }
}

/* ---------- Simple password gate (SHA-256 hash in config.js) ---------- */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authConfig() {
  return window.PARKLAND_AUTH || {};
}

function isAuthed() {
  const { SESSION_KEY, SITE_PASSWORD_SHA256 } = authConfig();
  if (!SESSION_KEY || !SITE_PASSWORD_SHA256) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === SITE_PASSWORD_SHA256;
  } catch {
    return false;
  }
}

function setAuthed(hash) {
  const { SESSION_KEY } = authConfig();
  try {
    sessionStorage.setItem(SESSION_KEY, hash);
  } catch (e) {
    console.warn(e);
  }
}

function clearAuthed() {
  const { SESSION_KEY } = authConfig();
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
    /* ignore */
  }
}

function unlockApp() {
  document.body.classList.remove("locked");
  const gate = $("#auth-gate");
  const shell = $("#app-shell");
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;
  // 唔使等 templates 載入完 — 一入站就拎天氣（避免頂部永遠「正在讀取」）
  try {
    startWeatherBar();
  } catch (e) {
    console.warn("startWeatherBar on unlock failed", e);
  }
}

function lockApp() {
  clearAuthed();
  document.body.classList.add("locked");
  const gate = $("#auth-gate");
  const shell = $("#app-shell");
  if (shell) shell.hidden = true;
  if (gate) {
    gate.hidden = false;
    const input = $("#auth-password");
    const err = $("#auth-error");
    if (err) err.classList.add("hidden");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 50);
    }
  }
}

async function initApp() {
  if (location.protocol === "file:") {
    $("#file-warning")?.classList.remove("hidden");
  }

  const [tplRes, assetRes] = await Promise.all([
    fetch("data/templates.json"),
    fetch("data/assets.json"),
  ]);
  if (!tplRes.ok) throw new Error(`templates.json HTTP ${tplRes.status}`);
  if (!assetRes.ok) throw new Error(`assets.json HTTP ${assetRes.status}`);
  const tplData = await tplRes.json();
  state.templates = tplData.templates;
  state.policySnippets = tplData.policySnippets;
  state.assets = await assetRes.json();
  // 分校時間：背景預載，失敗唔阻其他 tab；開 hours tab 會再試
  loadBranchesData().catch((e) => console.warn("preload branches failed", e));
  ensureLinksData();
  state.templates.forEach((t) => state.originals.set(t.id, t.body));
  loadDraftsFromStorage();

  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  $("#search").addEventListener("input", () => render());
  $("#lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox" || e.target.id === "lightbox-close") closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
  $("#logout-btn")?.addEventListener("click", () => {
    lockApp();
  });

  setTab("templates");
  loadMyIp();
  // 天氣條已喺 unlockApp 啟動；再確保一次（session 已登入直入）
  startWeatherBar();
}

(async function main() {
  try {
    const expected = (authConfig().SITE_PASSWORD_SHA256 || "").toLowerCase();
    if (!expected) {
      console.error("Missing password hash in config.js");
    }

    if (isAuthed()) {
      unlockApp();
      await initApp();
      return;
    }

    const form = $("#auth-form");
    const input = $("#auth-password");
    const err = $("#auth-error");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = (input.value || "").trim();
      if (!pw) return;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const hash = await sha256Hex(pw);
        if (hash === expected) {
          setAuthed(hash);
          err?.classList.add("hidden");
          unlockApp();
          await initApp();
        } else {
          err.textContent = "密碼不正確，請再試";
          err.classList.remove("hidden");
          input.select();
        }
      } catch (ex) {
        console.error(ex);
        err.textContent = "無法驗證（請用 Chrome 開 https 網址）";
        err.classList.remove("hidden");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    setTimeout(() => input?.focus(), 100);
  } catch (e) {
    console.error(e);
    alert("載入失敗：" + e.message);
  }
})();
