/* Parkland front desk toolkit — desktop only */

const STORAGE_KEY = "parkland-front-desk-drafts-v2";

/** 香港天文台 Open Data — 天氣警告一覽（每 5 分鐘 refresh） */
const HKO_WARNSUM_URL =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc";
const HKO_REFRESH_MS = 5 * 60 * 1000;

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
  // 已是中文或 Amber/Red/Black
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

  // 熱帶氣旋
  if (code === "WTCSGNL" || /TC\d/.test(type) || name.includes("熱帶氣旋")) {
    if (/TC8|TC9|TC10|八號|九號|十號/.test(blob)) return "red";
    return "yellow"; // TC1 / TC3
  }
  // 暴雨
  if (code === "WRAIN" || name.includes("暴雨")) {
    if (/WRAINB|BLACK|黑色/.test(blob)) return "red";
    if (/WRAINR|RED|紅色/.test(blob) && !/WRAINA/.test(type)) return "red";
    return "yellow"; // 黃色 WRAINA
  }
  // 其他偏嚴重
  if (code === "WL" || name.includes("山泥傾瀉")) return "red";
  if (code === "WTMW" || name.includes("海嘯")) return "red";
  if (code === "WFNTSA" || name.includes("水浸")) return "yellow";
  // 雷暴、酷熱、寒冷、季候風、火災、霜凍
  return "yellow";
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
  const bar = $("#weather-bar");
  const textEl = $("#weather-bar-text");
  const updatedEl = $("#weather-bar-updated");
  if (!bar || !textEl) return;

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

async function fetchHkoWarnings() {
  const res = await fetch(HKO_WARNSUM_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HKO HTTP ${res.status}`);
  const data = await res.json();
  // warnsum: object keyed by code, or empty {}
  const items = Object.values(data || {}).filter(
    (x) => x && typeof x === "object" && (x.name || x.code)
  );
  return items;
}

async function refreshWeatherBar({ manual = false } = {}) {
  const btn = $("#weather-bar-refresh");
  if (btn) btn.disabled = true;
  if (manual) {
    setWeatherBar({
      level: "loading",
      text: "正在重新讀取天文台天氣警告…",
      updatedLabel: "更新中…",
    });
  }

  try {
    const items = await fetchHkoWarnings();
    const fetchedAt = formatLocalNow();

    if (!items.length) {
      setWeatherBar({
        level: "ok",
        text: "而家冇天氣警告（香港天文台）",
        updatedLabel: `已更新 ${fetchedAt} · 每 5 分鐘自動更新`,
      });
      return;
    }

    // 顯示名稱；若有 type（例如黃色／紅色暴雨、幾號風球）一併顯示
    const labels = items.map((it) => {
      const name = it.name || it.code || "警告";
      const typeLabel = hkoTypeLabel(it.type);
      if (typeLabel && !name.includes(typeLabel)) {
        return `${name}（${typeLabel}）`;
      }
      return name;
    });

    const severities = items.map(hkoSeverity);
    const level = severities.includes("red") ? "red" : "yellow";

    // 用天文台 updateTime 做「資料時間」
    let hkoUpdated = "";
    for (const it of items) {
      if (it.updateTime) {
        hkoUpdated = formatHkoTime(it.updateTime);
        break;
      }
    }

    setWeatherBar({
      level,
      text: `生效警告：${labels.join("　·　")}`,
      updatedLabel: hkoUpdated
        ? `天文台 ${hkoUpdated} · 本機 ${fetchedAt} · 每 5 分鐘`
        : `已更新 ${fetchedAt} · 每 5 分鐘自動更新`,
    });
  } catch (e) {
    console.warn("HKO weather fetch failed", e);
    setWeatherBar({
      level: "error",
      text: "未能讀取天文台警告（請檢查網絡；以天文台最新公布為準）",
      updatedLabel: `失敗 ${formatLocalNow()} · 將自動再試`,
    });
  } finally {
    if (btn) btn.disabled = false;
  }
}

function startWeatherBar() {
  refreshWeatherBar();
  // clear old timer if re-init
  if (startWeatherBar._timer) clearInterval(startWeatherBar._timer);
  startWeatherBar._timer = setInterval(() => refreshWeatherBar(), HKO_REFRESH_MS);

  const btn = $("#weather-bar-refresh");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => refreshWeatherBar({ manual: true }));
  }
}

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
  groupFilter: "全部",
  originals: new Map(), // id -> original body
  drafts: new Map(),
  lastFocusedTa: null,
  saveTimer: null,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

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
  const tplData = await tplRes.json();
  state.templates = tplData.templates;
  state.policySnippets = tplData.policySnippets;
  state.assets = await assetRes.json();
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
