const multer = require("multer");
const sharp = require("sharp");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed"));
    }
    cb(null, true);
  }
});

const MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif"
};

const supportedFormats = Object.keys(MIME);

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, result => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    await runMiddleware(req, res, upload.single("image"));

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    const targetFormat = req.body.format;
    const quality = Math.min(
      100,
      Math.max(1, parseInt(req.body.quality) || 80)
    );

    if (!supportedFormats.includes(targetFormat)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported format"
      });
    }

    const originalSize = req.file.size;
    const ext = targetFormat === "jpeg"
      ? "jpg"
      : targetFormat;

    let image = sharp(req.file.buffer);

    image = image.rotate();

    image = image.resize({
      width: 2500,
      withoutEnlargement: true
    });

    switch (targetFormat) {
      case "webp":
        image = image.webp({ quality, effort: 6 });
        break;

      case "avif":
        image = image.avif({ quality, effort: 5 });
        break;

      case "jpeg":
        image = image.jpeg({
          quality,
          mozjpeg: true
        });
        break;

      case "png":
        image = image.png({
          compressionLevel: 9,
          quality
        });
        break;

      case "tiff":
        image = image.tiff({
          quality,
          compression: "lzw"
        });
        break;

      case "gif":
        image = image.gif();
        break;
    }

    const buffer = await image.toBuffer();

    const convertedSize = buffer.length;
    const savedBytes = originalSize - convertedSize;
    const savedPercent = (
      (savedBytes / originalSize) * 100
    ).toFixed(1);

    res.setHeader(
      "Content-Type",
      MIME[targetFormat]
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="converted.${ext}"`
    );

    res.setHeader(
      "X-Original-Size",
      formatBytes(originalSize)
    );

    res.setHeader(
      "X-Converted-Size",
      formatBytes(convertedSize)
    );

    res.setHeader(
      "X-Saved-Bytes",
      formatBytes(Math.abs(savedBytes))
    );

    res.setHeader(
      "X-Saved-Percent",
      savedPercent
    );

    res.setHeader(
      "X-Grew",
      savedBytes < 0 ? "true" : "false"
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Original-Size,X-Converted-Size,X-Saved-Bytes,X-Saved-Percent,X-Grew"
    );

    return res.send(buffer);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];

  const i = Math.floor(
    Math.log(bytes) / Math.log(k)
  );

  return (
    parseFloat(
      (bytes / Math.pow(k, i)).toFixed(1)
    ) +
    " " +
    sizes[i]
  );
}