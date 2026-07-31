/* Parkland front desk toolkit — desktop only */

const state = {
  tab: "templates",
  templates: [],
  policySnippets: [],
  assets: null,
  groupFilter: "全部",
  originals: new Map(), // id -> original body
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

/* ---------- Templates ---------- */
function renderTemplates() {
  const root = $("#panel-templates");
  const q = searchQuery();
  const groups = ["全部", ...new Set(state.templates.map((t) => t.group))];

  let html = `<div class="group-row" id="group-chips">`;
  for (const g of groups) {
    html += `<button type="button" class="chip ${state.groupFilter === g ? "active" : ""}" data-group="${g}">${g}</button>`;
  }
  html += `</div><div class="template-list">`;

  const list = state.templates.filter((t) => {
    if (state.groupFilter !== "全部" && t.group !== state.groupFilter) return false;
    const hay = [t.title, t.body, t.group, ...(t.tags || [])].join(" ");
    return matchSearch(hay, q);
  });

  if (!list.length) {
    html += `<div class="empty">搵唔到模板</div>`;
  } else {
    for (const t of list) {
      const current = state.originals.has(t.id)
        ? ($(`#ta-${t.id}`)?.value ?? t.body)
        : t.body;
      if (!state.originals.has(t.id)) state.originals.set(t.id, t.body);
      html += `
        <article class="card" data-id="${t.id}">
          <div class="card-head">
            <div>
              <div class="card-title">${escapeHtml(t.title)}</div>
              <div class="card-meta">${escapeHtml(t.group)}</div>
            </div>
          </div>
          <textarea id="ta-${t.id}" spellcheck="false">${escapeHtml(t.body)}</textarea>
          <div class="card-actions">
            <button type="button" class="btn btn-primary" data-copy-text="${t.id}">複製文字</button>
            <button type="button" class="btn btn-ghost" data-reset="${t.id}">還原原文</button>
          </div>
        </article>`;
    }
  }
  html += `</div>`;
  root.innerHTML = html;

  // restore edits if re-render wiped — store live values before re-render is hard;
  // on first paint bodies are originals. For filter re-render we lose edits — keep simple:
  // re-apply from originals map only on reset; for filter we re-set from template body.
  // Better: keep draft map
  for (const t of list) {
    const ta = $(`#ta-${t.id}`);
    if (ta && state.drafts?.has(t.id)) ta.value = state.drafts.get(t.id);
  }

  root.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      saveDrafts();
      state.groupFilter = chip.dataset.group;
      renderTemplates();
    });
  });
  root.querySelectorAll("[data-copy-text]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.copyText;
      const ta = $(`#ta-${id}`);
      saveDrafts();
      copyText(ta.value);
    });
  });
  root.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.reset;
      const ta = $(`#ta-${id}`);
      ta.value = state.originals.get(id) || "";
      if (state.drafts) state.drafts.delete(id);
      toast("已還原");
    });
  });
  root.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("input", () => saveDrafts());
  });
}

function saveDrafts() {
  if (!state.drafts) state.drafts = new Map();
  state.templates.forEach((t) => {
    const ta = $(`#ta-${t.id}`);
    if (ta) state.drafts.set(t.id, ta.value);
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
}

async function init() {
  // Secure context check for clipboard
  if (location.protocol === "file:") {
    $("#file-warning").classList.remove("hidden");
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
  state.drafts = new Map();

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

  setTab("templates");
}

init().catch((e) => {
  console.error(e);
  toast("載入失敗：" + e.message, true);
});
