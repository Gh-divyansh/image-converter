const STORAGE_KEY = "imgcrush-defaults-v2";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DEFAULT_SETTINGS = {
  format: "webp",
  quality: 80,
  width: 3500,
  height: "",
  fit: "inside",
  watermarkKind: "text",
  watermarkText: "",
  watermarkPosition: "southeast",
  watermarkScale: 24,
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
const globalWatermarkKind = document.getElementById("globalWatermarkKind");
const globalWatermark = document.getElementById("globalWatermark");
const globalWatermarkImageInput = document.getElementById("globalWatermarkImageInput");
const globalWatermarkImageBtn = document.getElementById("globalWatermarkImageBtn");
const clearGlobalWatermarkImageBtn = document.getElementById("clearGlobalWatermarkImageBtn");
const globalWatermarkImageName = document.getElementById("globalWatermarkImageName");
const globalWatermarkPosition = document.getElementById("globalWatermarkPosition");
const globalWatermarkOpacity = document.getElementById("globalWatermarkOpacity");
const globalWatermarkOpacityVal = document.getElementById("globalWatermarkOpacityVal");
const globalWatermarkScale = document.getElementById("globalWatermarkScale");
const globalWatermarkScaleVal = document.getElementById("globalWatermarkScaleVal");
const convertAllBtn = document.getElementById("convertAllBtn");
const batchProgress = document.getElementById("batchProgress");
const batchProgressFill = document.getElementById("batchProgressFill");
const batchStatus = document.getElementById("batchStatus");
const emptyState = document.getElementById("emptyState");

const cards = new Map();
const dragState = {
  activeId: null,
  armedId: null
};
let globalWatermarkImage = null;
let globalWatermarkImageCount = 0;
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

  globalWatermarkImageBtn.addEventListener("click", () => {
    globalWatermarkImageInput.click();
  });

  globalWatermarkImageInput.addEventListener("change", event => {
    const file = event.target.files?.[0] || null;
    applyGlobalWatermarkImage(file);
    globalWatermarkImageInput.value = "";
  });

  clearGlobalWatermarkImageBtn.addEventListener("click", () => {
    applyGlobalWatermarkImage(null);
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

  globalWatermarkScale.addEventListener("input", () => {
    globalWatermarkScaleVal.textContent = `${globalWatermarkScale.value}%`;
    applyGlobalSettings();
  });

  [
    globalFormat,
    globalWidth,
    globalHeight,
    globalFit,
    globalWatermarkKind,
    globalWatermark,
    globalWatermarkPosition
  ].filter(Boolean).forEach(element => {
    element.addEventListener("input", applyGlobalSettings);
    element.addEventListener("change", applyGlobalSettings);
  });

  convertAllBtn.addEventListener("click", convertAllCardsToZip);
  imagesContainer.addEventListener("dragover", handleCardDragOver);
  imagesContainer.addEventListener("drop", event => event.preventDefault());
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
  card.draggable = true;

  card.innerHTML = `
    <button class="drag-handle" type="button" title="Drag to reorder">Drag</button>
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
          <span>Watermark type</span>
          <select class="card-watermark-kind">
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>Watermark text</span>
          <input type="text" class="card-watermark" maxlength="120" placeholder="Optional text watermark" />
        </label>
        <div class="field field-wide">
          <span>Watermark image</span>
          <div class="watermark-file-row watermark-file-row-card">
            <input type="file" class="card-watermark-image-input" accept="image/*" hidden />
            <button class="card-watermark-image-btn secondary-btn" type="button">Choose Image</button>
            <button class="card-watermark-image-clear ghost-btn" type="button">Clear</button>
            <div class="watermark-file-meta watermark-image-status">
              <strong class="card-watermark-image-label">No image selected</strong>
              <span>Specific to this card only.</span>
            </div>
          </div>
        </div>
        <label class="field">
          <span>Watermark position</span>
          <select class="card-watermark-position">
            <option value="southeast">Bottom right</option>
            <option value="southwest">Bottom left</option>
            <option value="northeast">Top right</option>
            <option value="northwest">Top left</option>
            <option value="south">Bottom center</option>
            <option value="north">Top center</option>
            <option value="center">Center</option>
          </select>
        </label>
        <label class="field">
          <span>Watermark opacity</span>
          <div class="range-field">
            <input type="range" class="card-watermark-opacity" min="0" max="100" />
            <strong class="watermark-value"></strong>
          </div>
        </label>
        <label class="field">
          <span>Watermark size</span>
          <div class="range-field">
            <input type="range" class="card-watermark-scale" min="5" max="60" />
            <strong class="watermark-scale-value"></strong>
          </div>
        </label>
      </div>
      <div class="button-row">
        <button class="convert-btn" type="button">Convert</button>
        <button class="copy-btn" type="button">Copy Image</button>
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
    watermarkImageFile: globalWatermarkImage?.file || null,
    watermarkImageKey: globalWatermarkImage?.key || null,
    watermarkImageName: globalWatermarkImage?.file?.name || "",
    downloadUrl: null,
    lastConvertedBlob: null,
    lastConvertedSettings: null,
    lastConvertedWatermarkImageFile: null
  });

  populateCardSettings(card, settings);
  syncCardWatermarkImage(card, globalWatermarkImage);
  updateCardWatermarkMode(card);
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
  const scaleInput = card.querySelector(".card-watermark-scale");
  const scaleValue = card.querySelector(".watermark-scale-value");
  const watermarkKindSelect = card.querySelector(".card-watermark-kind");
  const watermarkImageInput = card.querySelector(".card-watermark-image-input");
  const watermarkImageBtn = card.querySelector(".card-watermark-image-btn");
  const watermarkImageClearBtn = card.querySelector(".card-watermark-image-clear");
  const dragHandle = card.querySelector(".drag-handle");

  qualityInput.addEventListener("input", () => {
    qualityValue.textContent = qualityInput.value;
  });

  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = `${opacityInput.value}%`;
  });

  scaleInput.addEventListener("input", () => {
    scaleValue.textContent = `${scaleInput.value}%`;
  });

  watermarkKindSelect.addEventListener("change", () => {
    updateCardWatermarkMode(card);
  });

  watermarkImageBtn.addEventListener("click", () => {
    watermarkImageInput.click();
  });

  watermarkImageInput.addEventListener("change", event => {
    const file = event.target.files?.[0] || null;
    setCardWatermarkImage(card, file);
    watermarkImageInput.value = "";
  });

  watermarkImageClearBtn.addEventListener("click", () => {
    setCardWatermarkImage(card, null);
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

  card.querySelector(".copy-btn").addEventListener("click", () => {
    copyConvertedImage(card);
  });

  dragHandle.addEventListener("pointerdown", () => {
    dragState.armedId = id;
  });

  dragHandle.addEventListener("pointerup", () => {
    if (dragState.activeId !== id) {
      dragState.armedId = null;
    }
  });

  card.addEventListener("dragstart", event => {
    if (dragState.armedId !== id) {
      event.preventDefault();
      return;
    }

    dragState.activeId = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    card.classList.add("dragging");
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    dragState.activeId = null;
    dragState.armedId = null;
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

  const formData = buildConversionFormData(state, settings);

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
    state.lastConvertedBlob = blob;
    state.lastConvertedSettings = settings;
    state.lastConvertedWatermarkImageFile = state.watermarkImageFile;
    downloadBtn.href = blobUrl;
    downloadBtn.download = `${originalBaseName}_converted.${extension}`;
    downloadBtn.style.display = "inline-flex";
    toggleCopyButton(card, true);

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
  setBatchProgress({
    percent: 4,
    message: "Preparing batch conversion..."
  });

  const formData = new FormData();
  const metadata = [];
  let fileIndex = 0;
  const watermarkFieldByKey = new Map();

  for (const [index, card] of cardElements.entries()) {
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

    if (state.watermarkImageFile && state.watermarkImageKey) {
      if (!watermarkFieldByKey.has(state.watermarkImageKey)) {
        const watermarkField = `watermark_${watermarkFieldByKey.size}`;
        watermarkFieldByKey.set(state.watermarkImageKey, watermarkField);
        formData.append(watermarkField, state.watermarkImageFile);
      }

      item.watermarkField = watermarkFieldByKey.get(state.watermarkImageKey);
    }

    metadata.push(item);
    setBatchProgress({
      percent: 8 + Math.round(((index + 1) / cardElements.length) * 16),
      message: `Prepared ${index + 1} of ${cardElements.length} images...`
    });
  }

  formData.append("metadata", JSON.stringify(metadata));

  try {
    const blob = await sendBatchRequest(formData, {
      onUploadProgress(progress) {
        setBatchProgress({
          percent: 24 + Math.round(progress * 38),
          message: `Uploading ${metadata.length} image${metadata.length > 1 ? "s" : ""}...`
        });
      },
      onServerWork() {
        setBatchProgress({
          percent: 74,
          message: "Converting images and building ZIP...",
          indeterminate: true
        });
      },
      onDownloadProgress(progress) {
        setBatchProgress({
          percent: 82 + Math.round(progress * 16),
          message: "Downloading ZIP...",
          indeterminate: false
        });
      }
    });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = blobUrl;
    link.download = "imgcrush-converted.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    setBatchProgress({
      percent: 100,
      message: `ZIP downloaded for ${metadata.length} image${metadata.length > 1 ? "s" : ""}.`
    });
  } catch (error) {
    setBatchProgress({
      percent: 0,
      message: error.message || "Batch conversion failed.",
      isError: true
    });
  } finally {
    convertAllBtn.disabled = false;
    convertAllBtn.textContent = "Convert All to ZIP";
  }
}

function applyGlobalSettings() {
  const settings = readGlobalSettings();
  updateGlobalWatermarkMode();
  saveDefaults(settings);

  imagesContainer.querySelectorAll(".image-card").forEach(card => {
    populateCardSettings(card, settings);
    updateCardWatermarkMode(card);
  });
}

function applyGlobalWatermarkImage(file) {
  if (file && !file.type.startsWith("image/")) {
    window.alert("Watermark image must be an image file.");
    return;
  }

  if (file && file.size > MAX_FILE_SIZE) {
    window.alert("Watermark image exceeds the 20MB upload limit.");
    return;
  }

  globalWatermarkImage = file
    ? {
        file,
        key: `wm_${++globalWatermarkImageCount}`
      }
    : null;

  updateGlobalWatermarkImageUI();
}

function populateCardSettings(card, settings) {
  card.querySelector(".card-format").value = settings.format;
  card.querySelector(".card-quality").value = settings.quality;
  card.querySelector(".range-value").textContent = settings.quality;
  card.querySelector(".card-width").value = settings.width;
  card.querySelector(".card-height").value = settings.height;
  card.querySelector(".card-fit").value = settings.fit;
  card.querySelector(".card-watermark-kind").value = settings.watermarkKind;
  card.querySelector(".card-watermark").value = settings.watermarkText;
  card.querySelector(".card-watermark-position").value = settings.watermarkPosition;
  card.querySelector(".card-watermark-opacity").value = settings.watermarkOpacity;
  card.querySelector(".watermark-value").textContent = `${settings.watermarkOpacity}%`;
  card.querySelector(".card-watermark-scale").value = settings.watermarkScale;
  card.querySelector(".watermark-scale-value").textContent = `${settings.watermarkScale}%`;
}

function readGlobalSettings() {
  return normalizeSettings({
    format: globalFormat.value,
    quality: globalQuality.value,
    width: globalWidth.value,
    height: globalHeight.value,
    fit: globalFit.value,
    watermarkKind: globalWatermarkKind?.value || DEFAULT_SETTINGS.watermarkKind,
    watermarkText: globalWatermark.value,
    watermarkPosition: globalWatermarkPosition.value,
    watermarkScale: globalWatermarkScale.value,
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
    watermarkKind: card.querySelector(".card-watermark-kind").value,
    watermarkText: card.querySelector(".card-watermark").value,
    watermarkPosition: card.querySelector(".card-watermark-position").value,
    watermarkScale: card.querySelector(".card-watermark-scale").value,
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
    watermarkKind: normalizeWatermarkKind(settings.watermarkKind),
    watermarkText: String(settings.watermarkText || "").trim().slice(0, 120),
    watermarkPosition: settings.watermarkPosition || DEFAULT_SETTINGS.watermarkPosition,
    watermarkScale: clampNumber(
      settings.watermarkScale,
      DEFAULT_SETTINGS.watermarkScale,
      5,
      60
    ),
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
  const copyBtn = card.querySelector(".copy-btn");

  if (isLoading) {
    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";
    downloadBtn.style.display = "none";
    copyBtn.style.display = "none";
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

function setBatchProgress({
  percent,
  message,
  isError = false,
  indeterminate = false
}) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent || 0)));

  batchProgress.classList.toggle("is-error", isError);
  batchProgress.classList.toggle("is-indeterminate", indeterminate);
  batchProgressFill.style.width = `${safePercent}%`;
  showBatchStatus(message, isError);
}

function updateUI() {
  const hasCards = imagesContainer.children.length > 0;
  emptyState.style.display = hasCards ? "none" : "block";
  globalBar.style.display = hasCards ? "grid" : "none";
  convertAllBtn.disabled = !hasCards;

  if (!hasCards) {
    setBatchProgress({
      percent: 0,
      message: "Drop files, paste screenshots, or add image links to begin."
    });
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
  if (globalWatermarkKind) {
    globalWatermarkKind.value = settings.watermarkKind;
  }
  globalWatermark.value = settings.watermarkText;
  globalWatermarkPosition.value = settings.watermarkPosition;
  globalWatermarkOpacity.value = settings.watermarkOpacity;
  globalWatermarkOpacityVal.textContent = `${settings.watermarkOpacity}%`;
  globalWatermarkScale.value = settings.watermarkScale;
  globalWatermarkScaleVal.textContent = `${settings.watermarkScale}%`;
  updateGlobalWatermarkImageUI();
  updateGlobalWatermarkMode();
}

function releaseCardResources(state) {
  if (state.previewUrl && state.sourceType === "file") {
    URL.revokeObjectURL(state.previewUrl);
  }

  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
}

function syncCardWatermarkImage(card, watermarkImageState) {
  const state = cards.get(card.dataset.id);

  if (!state) {
    return;
  }

  state.watermarkImageFile = watermarkImageState?.file || null;
  state.watermarkImageKey = watermarkImageState?.key || null;
  state.watermarkImageName = watermarkImageState?.file?.name || "";

  const label = card.querySelector(".card-watermark-image-label");
  const clearButton = card.querySelector(".card-watermark-image-clear");

  if (label) {
    label.textContent = state.watermarkImageName || "No image selected";
  }

  if (clearButton) {
    clearButton.disabled = !state.watermarkImageFile;
  }
}

function updateGlobalWatermarkImageUI() {
  globalWatermarkImageName.textContent = globalWatermarkImage?.file?.name || "No image selected";
  clearGlobalWatermarkImageBtn.disabled = !globalWatermarkImage;
  updateGlobalWatermarkMode();
}

function setCardWatermarkImage(card, file) {
  if (file && !file.type.startsWith("image/")) {
    window.alert("Watermark image must be an image file.");
    return;
  }

  if (file && file.size > MAX_FILE_SIZE) {
    window.alert("Watermark image exceeds the 20MB upload limit.");
    return;
  }

  syncCardWatermarkImage(
    card,
    file
      ? {
          file,
          key: `wm_${++globalWatermarkImageCount}`
        }
      : null
  );

  updateCardWatermarkMode(card);
}

function updateCardWatermarkMode(card) {
  const kind = normalizeWatermarkKind(
    card.querySelector(".card-watermark-kind").value
  );
  const textInput = card.querySelector(".card-watermark");
  const imageStatus = card.querySelector(".watermark-image-status");
  const imageButton = card.querySelector(".card-watermark-image-btn");
  const imageClearButton = card.querySelector(".card-watermark-image-clear");
  const positionSelect = card.querySelector(".card-watermark-position");
  const opacityInput = card.querySelector(".card-watermark-opacity");
  const scaleInput = card.querySelector(".card-watermark-scale");

  textInput.disabled = kind !== "text";
  textInput.classList.toggle("is-disabled", kind !== "text");
  imageStatus.classList.toggle("is-disabled", kind !== "image");
  imageButton.disabled = kind !== "image";
  imageClearButton.disabled = kind !== "image" || !cards.get(card.dataset.id)?.watermarkImageFile;
  positionSelect.disabled = kind === "none";
  opacityInput.disabled = kind === "none";
  scaleInput.disabled = kind === "none";
}

function updateGlobalWatermarkMode() {
  const kind = normalizeWatermarkKind(
    globalWatermarkKind?.value || DEFAULT_SETTINGS.watermarkKind
  );

  globalWatermark.disabled = kind !== "text";
  globalWatermark.classList.toggle("is-disabled", kind !== "text");
  globalWatermarkImageBtn.disabled = kind !== "image";
  clearGlobalWatermarkImageBtn.disabled = kind !== "image" || !globalWatermarkImage;
  globalWatermarkPosition.disabled = kind === "none";
  globalWatermarkOpacity.disabled = kind === "none";
  globalWatermarkScale.disabled = kind === "none";
}

function buildConversionFormData(state, settings, assets = {}) {
  const formData = new FormData();

  if (state.sourceType === "file") {
    formData.append("image", state.file);
  } else {
    formData.append("imageUrl", state.imageUrl);
  }

  const watermarkImageFile = assets.watermarkImageFile ?? state.watermarkImageFile;

  if (watermarkImageFile) {
    formData.append("watermarkImage", watermarkImageFile);
  }

  appendSettings(formData, settings);
  return formData;
}

async function copyConvertedImage(card) {
  const state = cards.get(card.dataset.id);
  const copyBtn = card.querySelector(".copy-btn");

  if (!state?.lastConvertedSettings) {
    showBatchStatus("Convert the image first, then copy it.", true);
    return;
  }

  if (!canCopyImages()) {
    showBatchStatus("This browser does not support copying images to the clipboard.", true);
    return;
  }

  copyBtn.disabled = true;
  copyBtn.textContent = "Copying...";

  try {
    let clipboardBlob = state.lastConvertedBlob;

    if (clipboardBlob?.type !== "image/png") {
      const pngSettings = {
        ...state.lastConvertedSettings,
        format: "png"
      };
      const response = await fetch("/convert", {
        method: "POST",
        body: buildConversionFormData(state, pngSettings, {
          watermarkImageFile: state.lastConvertedWatermarkImageFile
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: "Could not prepare image for clipboard"
        }));
        throw new Error(error.message);
      }

      clipboardBlob = await response.blob();
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": clipboardBlob
      })
    ]);

    showBatchStatus(`Copied ${state.displayName} to the clipboard.`, false);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy Image";
    }, 1400);
  } catch (error) {
    showBatchStatus(error.message || "Could not copy the converted image.", true);
    copyBtn.textContent = "Copy Image";
  } finally {
    copyBtn.disabled = false;
  }
}

function toggleCopyButton(card, isVisible) {
  const copyBtn = card.querySelector(".copy-btn");
  copyBtn.style.display = isVisible && canCopyImages() ? "inline-flex" : "none";
  copyBtn.textContent = "Copy Image";
}

function canCopyImages() {
  return Boolean(window.ClipboardItem && navigator.clipboard?.write);
}

function handleCardDragOver(event) {
  if (!dragState.activeId) {
    return;
  }

  event.preventDefault();

  const draggedCard = imagesContainer.querySelector(`[data-id="${dragState.activeId}"]`);

  if (!draggedCard) {
    return;
  }

  const insertBeforeNode = getDragInsertBeforeNode(
    imagesContainer,
    event.clientX,
    event.clientY
  );

  if (insertBeforeNode) {
    imagesContainer.insertBefore(draggedCard, insertBeforeNode);
  } else {
    imagesContainer.appendChild(draggedCard);
  }
}

function getDragInsertBeforeNode(container, clientX, clientY) {
  const otherCards = [
    ...container.querySelectorAll(".image-card:not(.dragging)")
  ];

  if (!otherCards.length) {
    return null;
  }

  let closestCard = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  otherCards.forEach(card => {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(clientX - centerX, clientY - centerY);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestCard = card;
    }
  });

  if (!closestCard) {
    return null;
  }

  const rect = closestCard.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const shouldInsertBefore =
    clientY < centerY ||
    (Math.abs(clientY - centerY) < rect.height / 4 && clientX < centerX);

  return shouldInsertBefore ? closestCard : closestCard.nextElementSibling;
}

function sendBatchRequest(formData, handlers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", "/convert-all");
    xhr.responseType = "blob";

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        handlers.onUploadProgress?.(event.loaded / event.total);
      } else {
        handlers.onServerWork?.();
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        handlers.onServerWork?.();
      }
    };

    xhr.onprogress = event => {
      if (event.lengthComputable) {
        handlers.onDownloadProgress?.(event.loaded / event.total);
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during batch conversion."));
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }

      try {
        const message = JSON.parse(await xhr.response.text()).message;
        reject(new Error(message || "Batch conversion failed."));
      } catch (error) {
        reject(new Error("Batch conversion failed."));
      }
    };

    xhr.send(formData);
  });
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

function normalizeWatermarkKind(value) {
  return ["none", "text", "image"].includes(value)
    ? value
    : DEFAULT_SETTINGS.watermarkKind;
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
