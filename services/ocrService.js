const axios = require("axios");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const sampleOcrData = require("./sampleOcrData");

class OcrService {
  constructor() {
    this.microserviceUrl = process.env.PYTHON_OCR_URL || "http://127.0.0.1:5000/api/ocr";
    this.standaloneScriptPath = path.join(__dirname, "..", "python_ocr", "standalone_ocr.py");
  }

  /**
   * Normalizes bounding boxes to ensure every detection contains (x, y, w, h) coordinates.
   */
  _normalizeBoxes(result) {
    if (!result || !Array.isArray(result.boxes)) return result;
    result.boxes = result.boxes.map((b) => {
      if (b.x !== undefined && b.y !== undefined && b.w !== undefined && b.h !== undefined) {
        return b;
      }
      const xs = (b.box || []).map((p) => p[0]);
      const ys = (b.box || []).map((p) => p[1]);
      const minX = xs.length ? Math.min(...xs) : 0;
      const minY = ys.length ? Math.min(...ys) : 0;
      const boxW = xs.length ? Math.max(...xs) - minX : 0;
      const boxH = ys.length ? Math.max(...ys) - minY : 0;
      return {
        ...b,
        x: Math.round(minX * 10) / 10,
        y: Math.round(minY * 10) / 10,
        w: Math.round(boxW * 10) / 10,
        h: Math.round(boxH * 10) / 10
      };
    });
    return result;
  }

  /**
   * Processes packaging image using PaddleOCR microservice with automatic child-process and sample-cache fallbacks.
   * @param {String} imagePath - Absolute path to local image
   * @param {String} [sampleType] - Optional identifier for 1-click sample demonstrations ('wheat_flour' or 'snack_pack')
   * @returns {Promise<Object>} OCR result with bounding boxes and structured key-value pairs
   */
  async processImage(imagePath, sampleType = null) {
    // 1. Instant 1-Click Sample Pre-computed Result Cache
    // Guarantees zero latency and 100% resilience against cloud container RAM constraints
    const normPath = (imagePath || "").toLowerCase();
    if (sampleType !== "diagnostics_force_python") {
      if (sampleType === "wheat_flour" || normPath.includes("compliant_wheat_flour")) {
        console.log("[OCR-Service] Serving instant high-accuracy result for compliant wheat flour sample.");
        return this._normalizeBoxes(JSON.parse(JSON.stringify(sampleOcrData.sampleWheatFlour)));
      }
      if (sampleType === "snack_pack" || normPath.includes("violating_snack_pack")) {
        console.log("[OCR-Service] Serving instant high-accuracy result for violating snack pack sample.");
        return this._normalizeBoxes(JSON.parse(JSON.stringify(sampleOcrData.sampleSnackPack)));
      }
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // 2. Try HTTP microservice first (with generous 120-second cloud container timeout)
    try {
      const response = await axios.post(
        this.microserviceUrl,
        { image_path: imagePath },
        { timeout: 120000, headers: { "Content-Type": "application/json" } }
      );

      if (response.data && response.data.success) {
        return this._normalizeBoxes(response.data);
      }
    } catch (httpErr) {
      console.warn(`[OCR-Service] Microservice HTTP call failed (${httpErr.message}).`);
    }

    // 3. Fallback: On local development, attempt standalone execution;
    // In production, avoid spawning duplicate Python processes to prevent memory ceiling violations
    if (process.env.NODE_ENV !== "production") {
      try {
        const standaloneResult = await new Promise((resolve, reject) => {
          const pythonCmd = process.platform === "win32" ? "python" : "python3";
          execFile(
            pythonCmd,
            [this.standaloneScriptPath, imagePath],
            {
              maxBuffer: 10 * 1024 * 1024,
              timeout: 60000,
              env: {
                ...process.env
              }
            },
            (error, stdout, stderr) => {
              if (error) {
                console.error("[OCR-Service] Standalone execution error:", stderr || error.message);
                return reject(new Error(`OCR processing failed: ${stderr || error.message}`));
              }

              try {
                let jsonStr = stdout.trim();
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  jsonStr = jsonMatch[0];
                }
                const parsed = JSON.parse(jsonStr);
                if (!parsed.success) {
                  return reject(new Error(parsed.error || "OCR failed to parse image"));
                }
                resolve(parsed);
              } catch (jsonErr) {
                console.error("[OCR-Service] JSON parse error of Python stdout:", stdout);
                reject(new Error("Invalid response format from OCR engine"));
              }
            }
          );
        });

        return this._normalizeBoxes(standaloneResult);
      } catch (fallbackErr) {
        console.warn(`[OCR-Service] Standalone execution encountered error: ${fallbackErr.message}`);
      }
    }

    // 4. Resilient Fallback: Never crash the user request or 502 Render container
    console.warn("[OCR-Service] Generating resilient fallback sandbox record for inspection.");
    return {
      success: true,
      fallback: true,
      image_dims: { width: 800, height: 600 },
      raw_text: "Packaging image uploaded. OCR text extraction could not complete automatically due to resource limits. Please verify statutory declarations using the fields on the right.",
      boxes: [],
      structured: {
        commodityName: "Packaged Commodity",
        netQuantity: "",
        mrp: "",
        mrpNumeric: 0,
        hasInclusiveOfTaxes: false,
        mfgDate: "",
        expDate: "",
        manufacturer: "",
        productAddress: "",
        customerCarePhone: "",
        customerCareEmail: "",
        customerCareAddress: "",
        countryOfOrigin: "",
        batchNo: "",
        unitSalePrice: "",
        unit: ""
      },
      total_detections: 0
    };
  }
}

module.exports = new OcrService();
