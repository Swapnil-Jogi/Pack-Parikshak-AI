const axios = require("axios");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

class OcrService {
  constructor() {
    this.microserviceUrl = process.env.PYTHON_OCR_URL || "http://127.0.0.1:5000/api/ocr";
    this.standaloneScriptPath = path.join(__dirname, "..", "python_ocr", "standalone_ocr.py");
  }

  /**
   * Processes packaging image using PaddleOCR microservice with automatic child-process fallback.
   * @param {String} imagePath - Absolute path to local image
   * @returns {Promise<Object>} OCR result with bounding boxes and structured key-value pairs
   */
  async processImage(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // Try HTTP microservice first
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

    // Fallback: Execute Python standalone script directly
    return new Promise((resolve, reject) => {
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      execFile(
        pythonCmd,
        [this.standaloneScriptPath, imagePath],
        { maxBuffer: 10 * 1024 * 1024, timeout: 60000 },
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
  }
}

module.exports = new OcrService();

