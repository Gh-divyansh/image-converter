const {
  buildOutputName,
  convertImageBuffer,
  getSourceBuffer,
  parseOptions,
  runMiddleware,
  sanitizeBaseName,
  uploadAny
} = require("./convert-core");
const { buildZip } = require("./zip");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    await runMiddleware(req, res, uploadAny);

    const metadata = JSON.parse(req.body.metadata || "[]");

    if (!Array.isArray(metadata) || !metadata.length) {
      return res.status(400).json({
        success: false,
        message: "No images were provided for batch conversion"
      });
    }

    const fileMap = new Map((req.files || []).map(file => [file.fieldname, file]));
    const usedNames = new Set();
    const zipEntries = [];

    for (const item of metadata) {
      const options = parseOptions(item);
      const source = await getSourceBuffer({
        file: item.fileField ? fileMap.get(item.fileField) : null,
        imageUrl: item.imageUrl
      });

      const result = await convertImageBuffer(source.buffer, options);
      const baseName = sanitizeBaseName(item.outputBaseName || source.sourceName);
      const entryName = ensureUniqueName(
        buildOutputName(baseName, options.format),
        usedNames
      );

      zipEntries.push({
        name: entryName,
        buffer: result.buffer
      });
    }

    const zipBuffer = buildZip(zipEntries);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="imgcrush-converted.zip"'
    );
    res.setHeader("Content-Length", zipBuffer.length);

    return res.send(zipBuffer);
  } catch (error) {
    console.error(error);

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "One of the images exceeds the 20MB limit"
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Batch conversion failed"
    });
  }
};

function ensureUniqueName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const dotIndex = name.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex >= 0 ? name.slice(dotIndex) : "";
  let counter = 2;

  while (usedNames.has(`${baseName}-${counter}${extension}`)) {
    counter += 1;
  }

  const uniqueName = `${baseName}-${counter}${extension}`;
  usedNames.add(uniqueName);
  return uniqueName;
}
