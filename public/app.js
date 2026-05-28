// ── DOM refs ──────────────────────────────────────────────────────────────────
const uploadBox       = document.getElementById("uploadBox");
const imageInput      = document.getElementById("imageInput");
const imagesContainer = document.getElementById("imagesContainer");
const globalBar       = document.getElementById("globalBar");
const globalFormat    = document.getElementById("globalFormat");
const globalQuality   = document.getElementById("globalQuality");
const globalQualityVal= document.getElementById("globalQualityVal");
const convertAllBtn   = document.getElementById("convertAllBtn");
const emptyState      = document.getElementById("emptyState");

let cardCount = 0;

// ── Upload triggers ───────────────────────────────────────────────────────────
uploadBox.addEventListener("click", () => imageInput.click());

uploadBox.addEventListener("dragover", e => {
  e.preventDefault();
  uploadBox.classList.add("drag-over");
});

uploadBox.addEventListener("dragleave", () => uploadBox.classList.remove("drag-over"));

uploadBox.addEventListener("drop", e => {
  e.preventDefault();
  uploadBox.classList.remove("drag-over");
  handleFiles([...e.dataTransfer.files]);
});

imageInput.addEventListener("change", e => handleFiles([...e.target.files]));

// ── Global controls ───────────────────────────────────────────────────────────
globalQuality.addEventListener("input", () => {
  globalQualityVal.textContent = globalQuality.value;
});

globalFormat.addEventListener("change", () => {
  if (!globalFormat.value) return;
  document.querySelectorAll(".card-format").forEach(sel => {
    sel.value = globalFormat.value;
  });
});

globalQuality.addEventListener("change", () => {
  const q = globalQuality.value;
  document.querySelectorAll(".card-quality").forEach(inp => {
    inp.value = q;
    inp.nextElementSibling.textContent = q;
  });
});

convertAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".convert-btn:not([disabled])").forEach(btn => btn.click());
});

// ── File handling ─────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function handleFiles(files) {

  const images = files.filter(file => {

    if (!file.type.startsWith("image/")) {
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {

      alert(
        `${file.name} exceeds 20MB upload limit`
      );

      return false;
    }

    return true;
  });

  if (!images.length) {
    return;
  }

  images.forEach(createImageCard);

  updateUI();
}

function updateUI() {
  const hasCards = imagesContainer.children.length > 0;
  emptyState.style.display  = hasCards ? "none"  : "block";
  globalBar.style.display   = hasCards ? "flex"  : "none";
}

// ── Card creation ─────────────────────────────────────────────────────────────
function createImageCard(file) {
  const id = ++cardCount;
  const card = document.createElement("div");
  card.className = "image-card";
  card.dataset.id = id;

  const reader = new FileReader();
  reader.onload = () => {
    card.innerHTML = `
      <button class="remove-btn" title="Remove">✕</button>

      <div class="preview-wrap">
        <img src="${reader.result}" class="preview" />
        <span class="orig-badge">${formatBytes(file.size)}</span>
      </div>

      <div class="file-name" title="${file.name}">${truncate(file.name, 34)}</div>

      <div class="controls">
        <div class="row-two">
          <select class="card-format">
            <option value="webp">WEBP</option>
            <option value="avif">AVIF</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="tiff">TIFF</option>
            <option value="gif">GIF</option>
          </select>
          <div class="quality-wrap">
            <label class="quality-label">Quality</label>
            <input type="range" class="card-quality" min="1" max="100" value="80" />
            <span class="quality-num">80</span>
          </div>
        </div>

        <button class="convert-btn">⚡ Convert</button>

        <a class="download-btn" download>⬇ Download</a>

        <div class="stats"></div>
        <div class="loader"><div class="spinner"></div><span>Converting…</span></div>
      </div>
    `;

    // Wire quality label
    const qualityInput = card.querySelector(".card-quality");
    const qualityNum   = card.querySelector(".quality-num");
    qualityInput.addEventListener("input", () => {
      qualityNum.textContent = qualityInput.value;
    });

    // Wire remove
    card.querySelector(".remove-btn").addEventListener("click", () => {
      card.classList.add("removing");
      card.addEventListener("animationend", () => {
        card.remove();
        updateUI();
      }, { once: true });
    });

    // Wire convert
    card.querySelector(".convert-btn").addEventListener("click", () => convertCard(card, file));

    imagesContainer.appendChild(card);
  };

  reader.readAsDataURL(file);
}

// ── Conversion ────────────────────────────────────────────────────────────────
async function convertCard(card, file) {
  const convertBtn  = card.querySelector(".convert-btn");
  const downloadBtn = card.querySelector(".download-btn");
  const loader      = card.querySelector(".loader");
  const stats       = card.querySelector(".stats");
  const format      = card.querySelector(".card-format").value;
  const quality     = card.querySelector(".card-quality").value;

  // Show loading state
  convertBtn.disabled = true;
  convertBtn.textContent = "Converting…";
  downloadBtn.style.display = "none";
  stats.innerHTML = "";
  loader.style.display = "flex";
  card.classList.remove("card-success", "card-error");

  const formData = new FormData();
  formData.append("image",   file);
  formData.append("format",  format);
  formData.append("quality", quality);

  try {
    const response = await fetch("/convert", { method: "POST", body: formData });

    loader.style.display   = "none";
    convertBtn.disabled    = false;
    convertBtn.textContent = "⚡ Convert";

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: "Conversion failed" }));
      showError(card, stats, convertBtn, err.message);
      return;
    }

    // Response body IS the converted image — server stores nothing to disk
    const blob     = await response.blob();
    const ext      = format === "jpeg" ? "jpg" : format;
    const origName = file.name.replace(/\.[^.]+$/, "");

    // Revoke previous blob URL on this card to free memory
    if (downloadBtn._blobUrl) URL.revokeObjectURL(downloadBtn._blobUrl);
    const blobUrl = URL.createObjectURL(blob);
    downloadBtn._blobUrl = blobUrl;
    downloadBtn.href     = blobUrl;
    downloadBtn.download = `${origName}_converted.${ext}`;
    downloadBtn.style.display = "block";

    card.classList.add("card-success");

    // Stats arrive as custom response headers
    const pct      = parseFloat(response.headers.get("X-Saved-Percent") || "0");
    const grew     = response.headers.get("X-Grew") === "true";
    const origSize = response.headers.get("X-Original-Size")  || "—";
    const convSize = response.headers.get("X-Converted-Size") || "—";
    const savedB   = response.headers.get("X-Saved-Bytes")    || "—";

    const barFill  = grew ? 0 : Math.min(100, Math.abs(pct));
    const barColor = grew ? "#f87171" : pct > 50 ? "#4ade80" : "#38bdf8";

    stats.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Before</span>
        <span class="stat-val">${origSize}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">After</span>
        <span class="stat-val">${convSize}</span>
      </div>
      <div class="savings-bar-wrap">
        <div class="savings-bar" style="width:${barFill}%;background:${barColor}"></div>
      </div>
      <div class="savings-label" style="color:${barColor}">
        ${grew
          ? `▲ +${Math.abs(pct)}% larger`
          : `▼ ${pct}% smaller — saved ${savedB}`}
      </div>
    `;

  } catch (err) {
    loader.style.display   = "none";
    convertBtn.disabled    = false;
    convertBtn.textContent = "⚡ Convert";
    showError(card, stats, convertBtn, "Network error — is the server running?");
    console.error(err);
  }
}

function showError(card, stats, btn, msg) {
  card.classList.add("card-error");
  btn.textContent = "⚡ Retry";
  stats.innerHTML = `<div class="error-msg">⚠ ${msg}</div>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function truncate(str, n) {
  if (str.length <= n) return str;
  const ext  = str.lastIndexOf(".");
  const name = ext > 0 ? str.slice(0, ext) : str;
  const sfx  = ext > 0 ? str.slice(ext)    : "";
  return name.slice(0, n - sfx.length - 1) + "…" + sfx;
}

// Init
updateUI();