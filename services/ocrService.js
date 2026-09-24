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
   * Processes packaging image using PaddleOCR microservice with automatic child-process and sample-cache fallbacks.
   * @param {String} imagePath - Absolute path to local image
   * @param {String} [sampleType] - Optional identifier for 1-click sample demonstrations ('wheat_flour' or 'snack_pack')
   * @returns {Promise<Object>} OCR result with bounding boxes and structured key-value pairs
   */
  async processImage(imagePath, sampleType = null) {
    // 1. Instant 1-Click Sample Pre-computed Result Cache
    // Guarantees zero latency and 100% resilience against cloud container RAM constraints
    const normPath = (imagePath || "").toLowerCase();
    if (sampleType === "wheat_flour" || normPath.includes("compliant_wheat_flour")) {
      console.log("[OCR-Service] Serving instant high-accuracy result for compliant wheat flour sample.");
      return JSON.parse(JSON.stringify(sampleOcrData.sampleWheatFlour));
    }
    if (sampleType === "snack_pack" || normPath.includes("violating_snack_pack")) {
      console.log("[OCR-Service] Serving instant high-accuracy result for violating snack pack sample.");
      return JSON.parse(JSON.stringify(sampleOcrData.sampleSnackPack));
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // 2. Try HTTP microservice first (with 60-second cloud timeout)
    try {
      const response = await axios.post(
        this.microserviceUrl,
        { image_path: imagePath },
        { timeout: 60000, headers: { "Content-Type": "application/json" } }
      );

      if (response.data && response.data.success) {
        return response.data;
      }
    } catch (httpErr) {
      console.warn(`[OCR-Service] Microservice HTTP call failed (${httpErr.message}). Falling back to standalone Python execution...`);
    }

    // 3. Fallback: Execute Python standalone script directly with single-thread memory limits
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
              ...process.env,
              OMP_NUM_THREADS: "1",
              OPENBLAS_NUM_THREADS: "1",
              MKL_NUM_THREADS: "1",
              VECLIB_MAXIMUM_THREADS: "1",
              NUMEXPR_NUM_THREADS: "1",
              ONNXRUNTIME_INTR_OP_NUM_THREADS: "1"
            }
          },
          (error, stdout, stderr) => {
            if (error) {
              console.error("[OCR-Service] Standalone execution error:", stderr || error.message);
              return reject(new Error(`OCR processing failed: ${stderr || error.message}`));
            }

            try {
              const parsed = JSON.parse(stdout.trim());
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

      return standaloneResult;
    } catch (fallbackErr) {
      console.warn(`[OCR-Service] Both microservice and standalone execution encountered errors: ${fallbackErr.message}. Generating resilient fallback sandbox record.`);
      // 4. Resilient Fallback: Never crash the user request or 502 Render container
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
}

module.exports = new OcrService();
