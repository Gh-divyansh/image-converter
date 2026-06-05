const multer = require("multer");
const sharp = require("sharp");

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_FITS = new Set([
  "contain",
  "cover",
  "fill",
  "inside",
  "outside"
]);
const SUPPORTED_POSITIONS = new Set([
  "center",
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
]);

const MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff"
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  }
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, result => {
      if (result instanceof Error) {
        return reject(result);
      }

      resolve(result);
    });
  });
}

function parseOptions(payload = {}) {
  const format = String(payload.format || "").toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(MIME, format)) {
    throw new Error("Unsupported format");
  }

  const quality = clampInt(payload.quality, 80, 1, 100);
  const width = parseDimension(payload.width);
  const height = parseDimension(payload.height);
  const fit = SUPPORTED_FITS.has(payload.fit) ? payload.fit : "inside";
  const watermarkText = String(payload.watermarkText || "").trim().slice(0, 120);
  const watermarkOpacity = clampInt(payload.watermarkOpacity, 18, 0, 100) / 100;
  const watermarkPosition = SUPPORTED_POSITIONS.has(payload.watermarkPosition)
    ? payload.watermarkPosition
    : "southeast";

  return {
    format,
    quality,
    width,
    height,
    fit,
    watermarkText,
    watermarkOpacity,
    watermarkPosition
  };
}

async function getSourceBuffer({ file, imageUrl }) {
  if (file && file.buffer) {
    return {
      buffer: file.buffer,
      sourceName: file.originalname || "image"
    };
  }

  if (imageUrl) {
    return fetchRemoteImage(imageUrl);
  }

  throw new Error("No image uploaded");
}

async function fetchRemoteImage(imageUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(String(imageUrl || "").trim());
  } catch (error) {
    throw new Error("Invalid image URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS image URLs are supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(parsedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ImgCrush/1.0"
      }
    });

    if (!response.ok) {
      throw new Error("Could not fetch the image URL");
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      throw new Error("The provided link does not point to an image");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);

    if (contentLength && contentLength > MAX_FILE_SIZE) {
      throw new Error("Remote image exceeds 20MB limit");
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error("Remote image exceeds 20MB limit");
    }

    return {
      buffer,
      sourceName: inferNameFromUrl(parsedUrl)
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Timed out while fetching image URL");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function convertImageBuffer(inputBuffer, options) {
  let image = sharp(inputBuffer, { failOn: "none" }).rotate();

  if (options.width || options.height) {
    image = image.resize({
      width: options.width || null,
      height: options.height || null,
      fit: options.fit,
      withoutEnlargement: true
    });
  }

  const normalized = await image.toBuffer({ resolveWithObject: true });
  let output = sharp(normalized.data, { failOn: "none" });

  if (
    options.watermarkText &&
    options.watermarkOpacity > 0 &&
    normalized.info.width >= 48 &&
    normalized.info.height >= 48
  ) {
    output = output.composite([
      {
        input: buildWatermarkSvg(
          normalized.info.width,
          normalized.info.height,
          options.watermarkText,
          options.watermarkOpacity
        ),
        gravity: options.watermarkPosition
      }
    ]);
  }

  output = applyFormat(output, options.format, options.quality);

  const buffer = await output.toBuffer();

  return {
    buffer,
    originalSize: inputBuffer.length,
    convertedSize: buffer.length
  };
}

function applyFormat(image, format, quality) {
  switch (format) {
    case "webp":
      return image.webp({
        quality,
        effort: 6
      });

    case "avif":
      return image.avif({
        quality,
        effort: 5
      });

    case "jpeg":
      return image.jpeg({
        quality,
        mozjpeg: true
      });

    case "png":
      return image.png({
        compressionLevel: 9,
        quality
      });

    case "tiff":
      return image.tiff({
        quality,
        compression: "lzw"
      });

    default:
      throw new Error("Unsupported format");
  }
}

function buildWatermarkSvg(width, height, text, opacity) {
  const safeText = escapeXml(text);
  const fontSize = Math.max(16, Math.min(64, Math.round(Math.min(width, height) / 14)));
  const paddingX = Math.round(fontSize * 0.75);
  const paddingY = Math.round(fontSize * 0.55);
  const textWidth = Math.max(
    fontSize * 4,
    Math.round((safeText.length + 1) * fontSize * 0.6)
  );
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const radius = Math.round(fontSize * 0.45);
  const textOpacity = Math.max(0, Math.min(1, opacity));
  const backgroundOpacity = Math.min(0.42, textOpacity * 0.75);
  const margin = Math.max(12, Math.round(fontSize * 0.6));

  return Buffer.from(
    `
      <svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth + margin * 2}" height="${boxHeight + margin * 2}">
        <g transform="translate(${margin}, ${margin})">
          <rect
            width="${boxWidth}"
            height="${boxHeight}"
            rx="${radius}"
            ry="${radius}"
            fill="rgba(0, 0, 0, ${backgroundOpacity})"
          />
          <text
            x="${boxWidth / 2}"
            y="${boxHeight / 2}"
            text-anchor="middle"
            dominant-baseline="middle"
            font-family="Arial, sans-serif"
            font-size="${fontSize}"
            font-weight="700"
            fill="rgba(255, 255, 255, ${textOpacity})"
          >${safeText}</text>
        </g>
      </svg>
    `
  );
}

function inferNameFromUrl(parsedUrl) {
  const pathname = parsedUrl.pathname || "";
  const filename = pathname.split("/").filter(Boolean).pop();

  if (filename) {
    return filename;
  }

  return "linked-image";
}

function getOutputExtension(format) {
  return format === "jpeg" ? "jpg" : format;
}

function buildOutputName(baseName, format) {
  const safeBaseName = sanitizeBaseName(baseName || "image");
  return `${safeBaseName}_converted.${getOutputExtension(format)}`;
}

function sanitizeBaseName(name) {
  const cleaned = String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "image";
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseDimension(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 8000);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  MIME,
  MAX_FILE_SIZE,
  buildOutputName,
  convertImageBuffer,
  formatBytes,
  getOutputExtension,
  getSourceBuffer,
  parseOptions,
  runMiddleware,
  sanitizeBaseName,
  uploadSingle: upload.single("image"),
  uploadAny: upload.any()
};
