const STORAGE_KEY = "imgcrush-defaults-v2";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DEFAULT_SETTINGS = {
  format: "webp",
  quality: 80,
  width: 3500,
  height: "",
  fit: "inside",
  watermarkText: "",
  watermarkOpacity: 18
};

const uploadBox = document.getElementById("uploadBox");
const imageInput = document.getElementById("imageInput");
const imageUrlInput = document.getElementById("imageUrlInput");
const addUrlBtn = document.getElementById("addUrlBtn");
const imagesContainer = document.getElementById("imagesContainer");
const globalBar = document.getElementById("globalBar");
const globalFormat = document.getElementById("globalFormat");
const globalQuality = document.getElementById("globalQuality");
const globalQualityVal = document.getElementById("globalQualityVal");
const globalWidth = document.getElementById("globalWidth");
const globalHeight = document.getElementById("globalHeight");
const globalFit = document.getElementById("globalFit");
const globalWatermark = document.getElementById("globalWatermark");
const globalWatermarkOpacity = document.getElementById("globalWatermarkOpacity");
const globalWatermarkOpacityVal = document.getElementById("globalWatermarkOpacityVal");
const convertAllBtn = document.getElementById("convertAllBtn");
const batchStatus = document.getElementById("batchStatus");
const emptyState = document.getElementById("emptyState");

const cards = new Map();
let cardCount = 0;
let pastedImageCount = 0;

initialize();

function initialize() {
  syncGlobalControls(loadDefaults());
  updateUI();
  wireEvents();
}

function wireEvents() {
  uploadBox.addEventListener("click", () => imageInput.click());

  uploadBox.addEventListener("dragover", event => {
    event.preventDefault();
    uploadBox.classList.add("drag-over");
  });

  uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("drag-over");
  });

  uploadBox.addEventListener("drop", event => {
    event.preventDefault();
    uploadBox.classList.remove("drag-over");
    handleFiles([...event.dataTransfer.files]);
  });

  imageInput.addEventListener("change", event => {
    handleFiles([...event.target.files]);
    imageInput.value = "";
  });

  addUrlBtn.addEventListener("click", () => {
    addImageUrl(imageUrlInput.value);
  });

  imageUrlInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addImageUrl(imageUrlInput.value);
    }
  });

  document.addEventListener("paste", event => {
    const files = [...event.clipboardData.files].filter(file =>
      file.type.startsWith("image/")
    );

    if (files.length) {
      event.preventDefault();
      handleFiles(files.map(preparePastedFile));
      showBatchStatus(`Added ${files.length} pasted image${files.length > 1 ? "s" : ""}.`);
      return;
    }

    const text = (event.clipboardData.getData("text/plain") || "").trim();

    if (looksLikeImageUrl(text)) {
      event.preventDefault();
      addImageUrl(text);
    }
  });

  globalQuality.addEventListener("input", () => {
    globalQualityVal.textContent = globalQuality.value;
    applyGlobalSettings();
  });

  globalWatermarkOpacity.addEventListener("input", () => {
    globalWatermarkOpacityVal.textContent = `${globalWatermarkOpacity.value}%`;
    applyGlobalSettings();
  });

  [
    globalFormat,
    globalWidth,
    globalHeight,
    globalFit,
    globalWatermark
  ].forEach(element => {
    element.addEventListener("input", applyGlobalSettings);
    element.addEventListener("change", applyGlobalSettings);
  });

  convertAllBtn.addEventListener("click", convertAllCardsToZip);
}

function handleFiles(files) {
  const images = files.filter(file => {
    if (!file.type.startsWith("image/")) {
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      window.alert(`${file.name} exceeds the 20MB upload limit.`);
      return false;
    }

    return true;
  });

  if (!images.length) {
    return;
  }

  images.forEach(file => createImageCard({
    sourceType: "file",
    file,
    previewUrl: URL.createObjectURL(file),
    displayName: file.name,
    sizeLabel: formatBytes(file.size)
  }));

  updateUI();
}

function addImageUrl(rawUrl) {
  const imageUrl = String(rawUrl || "").trim();

  if (!imageUrl) {
    return;
  }

  if (!looksLikeImageUrl(imageUrl)) {
    window.alert("Enter a valid HTTP or HTTPS image URL.");
    return;
  }

  const parsedUrl = new URL(imageUrl);
  createImageCard({
    sourceType: "url",
    imageUrl,
    previewUrl: imageUrl,
    displayName: inferNameFromUrl(parsedUrl),
    sizeLabel: "Remote source"
  });

  imageUrlInput.value = "";
  updateUI();
  showBatchStatus("Linked image added.");
}

function createImageCard(source) {
  const settings = loadDefaults();
  const id = String(++cardCount);
  const card = document.createElement("article");

  card.className = "image-card";
  card.dataset.id = id;

  card.innerHTML = `
    <button class="remove-btn" type="button" title="Remove image">x</button>
    <div class="preview-wrap">
      <img class="preview" alt="${escapeHtml(source.displayName)} preview" />
      <div class="preview-fallback" hidden>Preview unavailable</div>
      <span class="source-badge">${source.sourceType === "url" ? "LINK" : "FILE"}</span>
      <span class="orig-badge">${escapeHtml(source.sizeLabel)}</span>
    </div>
    <div class="file-name" title="${escapeHtml(source.displayName)}">${escapeHtml(source.displayName)}</div>
    <div class="controls">
      <div class="control-grid">
        <label class="field">
          <span>Format</span>
          <select class="card-format">
            <option value="webp">WEBP</option>
            <option value="avif">AVIF</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="tiff">TIFF</option>
          </select>
        </label>
        <label class="field">
          <span>Quality</span>
          <div class="range-field">
            <input type="range" class="card-quality" min="1" max="100" />
            <strong class="range-value"></strong>
          </div>
        </label>
        <label class="field">
          <span>Width</span>
          <input type="number" class="card-width" min="1" max="8000" placeholder="Auto" />
        </label>
        <label class="field">
          <span>Height</span>
          <input type="number" class="card-height" min="1" max="8000" placeholder="Auto" />
        </label>
        <label class="field">
          <span>Fit</span>
          <select class="card-fit">
            <option value="inside">Inside</option>
            <option value="contain">Contain</option>
            <option value="cover">Cover / Crop</option>
            <option value="fill">Fill</option>
            <option value="outside">Outside</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>Watermark text</span>
          <input type="text" class="card-watermark" maxlength="120" placeholder="Optional text watermark" />
        </label>
        <label class="field">
          <span>Watermark opacity</span>
          <div class="range-field">
            <input type="range" class="card-watermark-opacity" min="0" max="100" />
            <strong class="watermark-value"></strong>
          </div>
        </label>
      </div>
      <div class="button-row">
        <button class="convert-btn" type="button">Convert</button>
        <a class="download-btn" download>Download</a>
      </div>
      <div class="stats"></div>
      <div class="loader">
        <div class="spinner"></div>
        <span>Converting...</span>
      </div>
    </div>
  `;

  cards.set(id, {
    id,
    ...source,
    downloadUrl: null
  });

  populateCardSettings(card, settings);
  wireCard(card);
  hydratePreview(card, source.previewUrl);
  imagesContainer.appendChild(card);
}

function wireCard(card) {
  const id = card.dataset.id;
  const state = cards.get(id);
  const qualityInput = card.querySelector(".card-quality");
  const qualityValue = card.querySelector(".range-value");
  const opacityInput = card.querySelector(".card-watermark-opacity");
  const opacityValue = card.querySelector(".watermark-value");

  qualityInput.addEventListener("input", () => {
    qualityValue.textContent = qualityInput.value;
  });

  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = `${opacityInput.value}%`;
  });

  card.querySelector(".remove-btn").addEventListener("click", () => {
    releaseCardResources(state);
    cards.delete(id);
    card.classList.add("removing");
    card.addEventListener("animationend", () => {
      card.remove();
      updateUI();
    }, { once: true });
  });

  card.querySelector(".convert-btn").addEventListener("click", () => {
    convertCard(card);
  });
}

function hydratePreview(card, previewUrl) {
  const preview = card.querySelector(".preview");
  const fallback = card.querySelector(".preview-fallback");

  preview.addEventListener("load", () => {
    preview.hidden = false;
    fallback.hidden = true;
  });
  preview.addEventListener("error", () => {
    preview.hidden = true;
    fallback.hidden = false;
  });
  preview.src = previewUrl;
}

async function convertCard(card) {
  const state = cards.get(card.dataset.id);
  const settings = readCardSettings(card);
  const convertBtn = card.querySelector(".convert-btn");
  const downloadBtn = card.querySelector(".download-btn");
  const loader = card.querySelector(".loader");
  const stats = card.querySelector(".stats");

  setCardLoadingState({
    card,
    convertBtn,
    downloadBtn,
    loader,
    stats,
    isLoading: true
  });

  const formData = new FormData();

  if (state.sourceType === "file") {
    formData.append("image", state.file);
  } else {
    formData.append("imageUrl", state.imageUrl);
  }

  appendSettings(formData, settings);

  try {
    const response = await fetch("/convert", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "Conversion failed"
      }));
      throw new Error(error.message);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const originalBaseName = stripExtension(state.displayName);
    const extension = settings.format === "jpeg" ? "jpg" : settings.format;

    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl);
    }

    state.downloadUrl = blobUrl;
    downloadBtn.href = blobUrl;
    downloadBtn.download = `${originalBaseName}_converted.${extension}`;
    downloadBtn.style.display = "inline-flex";

    renderCardStats(card, response.headers);
    card.classList.add("card-success");
  } catch (error) {
    showError(card, stats, convertBtn, error.message);
  } finally {
    setCardLoadingState({
      card,
      convertBtn,
      downloadBtn,
      loader,
      stats,
      isLoading: false
    });
  }
}

async function convertAllCardsToZip() {
  const cardElements = [...imagesContainer.querySelectorAll(".image-card")];

  if (!cardElements.length) {
    return;
  }

  convertAllBtn.disabled = true;
  convertAllBtn.textContent = "Building ZIP...";
  showBatchStatus("Preparing batch conversion...");

  const formData = new FormData();
  const metadata = [];
  let fileIndex = 0;

  for (const card of cardElements) {
    const state = cards.get(card.dataset.id);
    const settings = readCardSettings(card);
    const item = {
      sourceType: state.sourceType,
      outputBaseName: stripExtension(state.displayName),
      originalName: state.displayName,
      ...settings
    };

    if (state.sourceType === "file") {
      item.fileField = `image_${fileIndex}`;
      formData.append(item.fileField, state.file);
      fileIndex += 1;
    } else {
      item.imageUrl = state.imageUrl;
    }

    metadata.push(item);
  }

  formData.append("metadata", JSON.stringify(metadata));

  try {
    const response = await fetch("/convert-all", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "Batch conversion failed"
      }));
      throw new Error(error.message);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = blobUrl;
    link.download = "imgcrush-converted.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    showBatchStatus(`ZIP downloaded for ${metadata.length} image${metadata.length > 1 ? "s" : ""}.`, false);
  } catch (error) {
    showBatchStatus(error.message || "Batch conversion failed.", true);
  } finally {
    convertAllBtn.disabled = false;
    convertAllBtn.textContent = "Convert All to ZIP";
  }
}

function applyGlobalSettings() {
  const settings = readGlobalSettings();
  saveDefaults(settings);

  imagesContainer.querySelectorAll(".image-card").forEach(card => {
    populateCardSettings(card, settings);
  });
}

function populateCardSettings(card, settings) {
  card.querySelector(".card-format").value = settings.format;
  card.querySelector(".card-quality").value = settings.quality;
  card.querySelector(".range-value").textContent = settings.quality;
  card.querySelector(".card-width").value = settings.width;
  card.querySelector(".card-height").value = settings.height;
  card.querySelector(".card-fit").value = settings.fit;
  card.querySelector(".card-watermark").value = settings.watermarkText;
  card.querySelector(".card-watermark-opacity").value = settings.watermarkOpacity;
  card.querySelector(".watermark-value").textContent = `${settings.watermarkOpacity}%`;
}

function readGlobalSettings() {
  return normalizeSettings({
    format: globalFormat.value,
    quality: globalQuality.value,
    width: globalWidth.value,
    height: globalHeight.value,
    fit: globalFit.value,
    watermarkText: globalWatermark.value,
    watermarkOpacity: globalWatermarkOpacity.value
  });
}

function readCardSettings(card) {
  return normalizeSettings({
    format: card.querySelector(".card-format").value,
    quality: card.querySelector(".card-quality").value,
    width: card.querySelector(".card-width").value,
    height: card.querySelector(".card-height").value,
    fit: card.querySelector(".card-fit").value,
    watermarkText: card.querySelector(".card-watermark").value,
    watermarkOpacity: card.querySelector(".card-watermark-opacity").value
  });
}

function normalizeSettings(settings) {
  return {
    format: settings.format || DEFAULT_SETTINGS.format,
    quality: clampNumber(settings.quality, DEFAULT_SETTINGS.quality, 1, 100),
    width: normalizeDimension(settings.width),
    height: normalizeDimension(settings.height),
    fit: settings.fit || DEFAULT_SETTINGS.fit,
    watermarkText: String(settings.watermarkText || "").trim().slice(0, 120),
    watermarkOpacity: clampNumber(
      settings.watermarkOpacity,
      DEFAULT_SETTINGS.watermarkOpacity,
      0,
      100
    )
  };
}

function appendSettings(formData, settings) {
  Object.entries(settings).forEach(([key, value]) => {
    formData.append(key, value);
  });
}

function renderCardStats(card, headers) {
  const stats = card.querySelector(".stats");
  const pct = parseFloat(headers.get("X-Saved-Percent") || "0");
  const grew = headers.get("X-Grew") === "true";
  const origSize = headers.get("X-Original-Size") || "-";
  const convSize = headers.get("X-Converted-Size") || "-";
  const savedBytes = headers.get("X-Saved-Bytes") || "-";
  const barFill = grew ? 0 : Math.min(100, Math.abs(pct));
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
      ${grew ? `+${Math.abs(pct)}% larger` : `${pct}% smaller - saved ${savedBytes}`}
    </div>
  `;
}

function setCardLoadingState({ card, convertBtn, downloadBtn, loader, stats, isLoading }) {
  if (isLoading) {
    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";
    downloadBtn.style.display = "none";
    loader.style.display = "flex";
    stats.innerHTML = "";
    card.classList.remove("card-success", "card-error");
    return;
  }

  convertBtn.disabled = false;
  convertBtn.textContent = card.classList.contains("card-error") ? "Retry" : "Convert";
  loader.style.display = "none";
}

function showError(card, stats, button, message) {
  card.classList.add("card-error");
  button.textContent = "Retry";
  stats.innerHTML = `<div class="error-msg">${escapeHtml(message)}</div>`;
}

function showBatchStatus(message, isError = false) {
  batchStatus.textContent = message;
  batchStatus.classList.toggle("is-error", isError);
}

function updateUI() {
  const hasCards = imagesContainer.children.length > 0;
  emptyState.style.display = hasCards ? "none" : "block";
  globalBar.style.display = hasCards ? "grid" : "none";
  convertAllBtn.disabled = !hasCards;

  if (!hasCards) {
    showBatchStatus("Drop files, paste screenshots, or add image links to begin.");
  }
}

function loadDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveDefaults(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function syncGlobalControls(settings) {
  globalFormat.value = settings.format;
  globalQuality.value = settings.quality;
  globalQualityVal.textContent = settings.quality;
  globalWidth.value = settings.width;
  globalHeight.value = settings.height;
  globalFit.value = settings.fit;
  globalWatermark.value = settings.watermarkText;
  globalWatermarkOpacity.value = settings.watermarkOpacity;
  globalWatermarkOpacityVal.textContent = `${settings.watermarkOpacity}%`;
}

function releaseCardResources(state) {
  if (state.previewUrl && state.sourceType === "file") {
    URL.revokeObjectURL(state.previewUrl);
  }

  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
}

function preparePastedFile(file) {
  pastedImageCount += 1;
  const extension = file.type.split("/")[1] || "png";
  const name = `pasted-image-${pastedImageCount}.${extension}`;

  return new File([file], name, {
    type: file.type,
    lastModified: Date.now()
  });
}

function inferNameFromUrl(parsedUrl) {
  const filename = parsedUrl.pathname.split("/").filter(Boolean).pop();
  return filename || "linked-image";
}

function looksLikeImageUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

function normalizeDimension(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return "";
  }

  return Math.min(parsed, 8000);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );

  return `${parseFloat((bytes / 1024 ** power).toFixed(1))} ${units[power]}`;
}

function stripExtension(filename) {
  return String(filename || "image").replace(/\.[^.]+$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
