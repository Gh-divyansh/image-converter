const {
  MIME,
  buildOutputName,
  convertImageBufferWithAssets,
  formatBytes,
  getFieldFile,
  getSourceBuffer,
  parseOptions,
  runMiddleware,
  uploadSingle
} = require("./convert-core");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    await runMiddleware(req, res, uploadSingle);

    const options = parseOptions(req.body);
    const source = await getSourceBuffer({
      file: getFieldFile(req.files, "image"),
      imageUrl: req.body.imageUrl
    });
    const result = await convertImageBufferWithAssets(source.buffer, options, {
      watermarkImageBuffer: getFieldFile(req.files, "watermarkImage")?.buffer || null
    });
    const savedBytes = result.originalSize - result.convertedSize;

    const savedPercent = (
      (savedBytes / result.originalSize) * 100
    ).toFixed(1);

    res.setHeader(
      "Content-Type",
      MIME[options.format]
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${buildOutputName(source.sourceName, options.format)}"`
    );

    res.setHeader(
      "X-Original-Size",
      formatBytes(result.originalSize)
    );

    res.setHeader(
      "X-Converted-Size",
      formatBytes(result.convertedSize)
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

    return res.send(result.buffer);
  } catch (error) {
    console.error(error);

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Image exceeds 20MB limit"
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
