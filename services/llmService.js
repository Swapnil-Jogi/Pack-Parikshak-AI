const axios = require("axios");
const fs = require("fs");
const path = require("path");
const RuleEngine = require("./ruleEngine");

class LlmService {
  constructor() {
    this.models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-8b"];
    this.quotaExhaustedDate = null;
  }

  getApiKey() {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  }

  getPreferredModel() {
    return (process.env.GEMINI_MODEL || "gemini-1.5-flash").trim();
  }

  getOptimizationMode() {
    // 'full' (Step 1 + Step 2 + Step 3 always) or 'smart' (Step 1 first, skips Step 2 if Step 1 is high confidence)
    return (process.env.LLM_OPTIMIZATION_MODE || "full").toLowerCase().trim();
  }

  /**
   * Checks if daily quota was exhausted today.
   */
  isQuotaExhausted() {
    if (!this.quotaExhaustedDate) return false;
    const today = new Date().toDateString();
    if (this.quotaExhaustedDate === today) {
      return true;
    }
    // New day has started, reset exhaustion flag
    this.quotaExhaustedDate = null;
    return false;
  }

  /**
   * Marks daily quota as exhausted for today.
   */
  markQuotaExhausted(reason = "429 Resource Exhausted") {
    this.quotaExhaustedDate = new Date().toDateString();
    console.warn(`[LLM-Service] Daily Gemini API Quota limit reached (${reason}). Falling back to built-in heuristic rule engine for the rest of today.`);
  }

  /**
   * Normalizes and cleans raw JSON text returned by LLM.
   */
  _cleanAndParseJson(rawText) {
    if (!rawText) return null;
    let str = rawText.trim();
    // Strip markdown code fence if present
    if (str.startsWith("```json")) {
      str = str.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    } else if (str.startsWith("```")) {
      str = str.replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    }
    // Find outermost JSON object
    const match = str.match(/\{[\s\S]*\}/);
    if (match) {
      str = match[0];
    }
    try {
      const parsed = JSON.parse(str);
      return this._sanitizeStructuredData(parsed);
    } catch (err) {
      console.warn("[LLM-Service] Failed to parse JSON from LLM response:", err.message);
      return null;
    }
  }

  /**
   * Ensures structured fields conform to expected Pack-Parikshak schema.
   */
  _sanitizeStructuredData(obj = {}) {
    const safeStr = (v) => (v !== undefined && v !== null ? String(v).trim() : "");
    const safeBool = (v) => Boolean(v === true || v === "true" || v === 1);

    let mrpNum = null;
    if (obj.mrpNumeric !== undefined && obj.mrpNumeric !== null && !isNaN(Number(obj.mrpNumeric))) {
      mrpNum = Number(obj.mrpNumeric);
    } else if (obj.mrp) {
      const match = String(obj.mrp).match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
      if (match) mrpNum = parseFloat(match[1].replace(",", "."));
    }

    return {
      commodityName: safeStr(obj.commodityName),
      netQuantity: safeStr(obj.netQuantity),
      unit: safeStr(obj.unit),
      mrp: safeStr(obj.mrp),
      mrpNumeric: mrpNum,
      hasInclusiveOfTaxes: safeBool(obj.hasInclusiveOfTaxes),
      mfgDate: safeStr(obj.mfgDate),
      expDate: safeStr(obj.expDate || obj.useByDate),
      manufacturer: safeStr(obj.manufacturer),
      productAddress: safeStr(obj.productAddress),
      countryOfOrigin: safeStr(obj.countryOfOrigin),
      customerCarePhone: safeStr(obj.customerCarePhone),
      customerCareEmail: safeStr(obj.customerCareEmail),
      customerCareAddress: safeStr(obj.customerCareAddress),
      batchNo: safeStr(obj.batchNo),
      unitSalePrice: safeStr(obj.unitSalePrice)
    };
  }

  /**
   * Calls Google Gemini REST API with model fallback and error handling.
   */
  async _callGeminiApi(payload, preferredModel = null) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("NO_API_KEY");
    }

    if (this.isQuotaExhausted()) {
      throw new Error("QUOTA_EXHAUSTED_TODAY");
    }

    const candidateModels = preferredModel
      ? [preferredModel, ...this.models.filter((m) => m !== preferredModel)]
      : this.models;

    let lastError = null;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 25000
        });

        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
          const candidate = response.data.candidates[0];
          const textPart = candidate.content?.parts?.[0]?.text;
          if (textPart) {
            return { text: textPart, modelUsed: model };
          }
        }
      } catch (err) {
        lastError = err;
        const status = err.response ? err.response.status : null;
        const errMsg = err.response?.data?.error?.message || err.message;

        if (status === 429 || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
          this.markQuotaExhausted(errMsg);
          throw new Error("QUOTA_EXHAUSTED_TODAY");
        }

        console.warn(`[LLM-Service] Gemini call failed for ${model} (${errMsg}). Trying next model...`);
      }
    }

    throw lastError || new Error("All Gemini models failed");
  }

  /**
   * STEP 1: Process raw PaddleOCR tokens with spatial bounding box coordinates (x, y, w, h) through Text-LLM.
   */
  async processStep1TextLlm(tokens = [], imageDims = { width: 800, height: 600 }, rawText = "") {
    if (!tokens || tokens.length === 0) {
      return null;
    }

    // Prepare token array with coordinates for LLM context
    const formattedTokens = tokens.slice(0, 160).map((t, idx) => ({
      i: idx + 1,
      text: t.text,
      x: Math.round(t.x || 0),
      y: Math.round(t.y || 0),
      w: Math.round(t.w || 0),
      h: Math.round(t.h || 0),
      conf: Math.round((t.confidence || 0.8) * 100) / 100
    }));

    const systemInstruction = `You are a Legal Metrology Compliance Expert in India verifying packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011.
You are given OCR tokens extracted by PaddleOCR with canvas spatial coordinates (x, y, w, h) from an image of size ${imageDims.width}x${imageDims.height}.

SPATIAL LAYOUT RULES:
1. Tokens sharing approximately the same 'y' coordinate (+/- 15px) are on the SAME horizontal row.
2. In typical packaging tables, keys are on the left and values are on the right (same row).
3. If keys and values are stacked vertically, the value appears immediately below the key (similar 'x' coordinate, slightly larger 'y').
4. Reconstruct fragmented or broken tokens into cohesive statutory declarations.

REQUIRED OUTPUT JSON FORMAT:
{
  "commodityName": "Common or generic name of commodity (e.g. Atta, Potato Chips, Body Lotion)",
  "netQuantity": "Standard net quantity declaration (e.g. 500 g, 1 kg, 100 ml, 10 N)",
  "unit": "Measurement unit (g, kg, ml, l, n)",
  "mrp": "Full MRP string as declared (e.g. ₹ 99.00 (incl. of all taxes))",
  "mrpNumeric": 99.00,
  "hasInclusiveOfTaxes": true,
  "mfgDate": "Month and year of manufacture/packing (e.g. 08/2026 or AUG 2026)",
  "expDate": "Expiry or Best Before date (e.g. 08/2028)",
  "manufacturer": "Full legal name of manufacturer, packer, or importer",
  "productAddress": "Factory, premises, or manufacturing unit address",
  "countryOfOrigin": "Country where made/packed (e.g. India)",
  "customerCarePhone": "Consumer helpline phone number",
  "customerCareEmail": "Consumer care email address",
  "customerCareAddress": "Consumer care postal address",
  "batchNo": "Batch / Lot / Code number",
  "unitSalePrice": "Unit Sale Price if declared (e.g. ₹ 0.20 / g)"
}
Return PURE JSON only. Do not include markdown or explanations.`;

    const prompt = `Image dimensions: ${imageDims.width} x ${imageDims.height}\n\n` +
      `Raw Full Text:\n${rawText || tokens.map(t => t.text).join(" ")}\n\n` +
      `PaddleOCR Spatial Tokens [x, y, w, h]:\n${JSON.stringify(formattedTokens, null, 2)}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemInstruction + "\n\n" + prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const apiResult = await this._callGeminiApi(payload, this.getPreferredModel());
    const structured = this._cleanAndParseJson(apiResult.text);
    if (!structured) {
      throw new Error("Failed to parse structured JSON from Text-LLM response");
    }

    const evaluation = RuleEngine.evaluate(structured, rawText);

    return {
      structured,
      evaluation,
      rawText,
      modelUsed: apiResult.modelUsed
    };
  }

  /**
   * STEP 2: Process product image directly through Vision-LLM (Gemini Flash Vision).
   */
  async processStep2VisionLlm(imagePathOrBuffer, mimeType = "image/jpeg") {
    let base64Data = "";
    if (Buffer.isBuffer(imagePathOrBuffer)) {
      base64Data = imagePathOrBuffer.toString("base64");
    } else if (typeof imagePathOrBuffer === "string" && fs.existsSync(imagePathOrBuffer)) {
      const buf = fs.readFileSync(imagePathOrBuffer);
      base64Data = buf.toString("base64");
      const ext = path.extname(imagePathOrBuffer).toLowerCase();
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else mimeType = "image/jpeg";
    } else {
      throw new Error(`Vision LLM could not locate image buffer or path: ${imagePathOrBuffer}`);
    }

    const visionPrompt = `You are an Official Legal Metrology Enforcement Officer in India inspecting this product packaging label.
Examine this packaging label with high optical precision to find all mandatory statutory declarations under the Legal Metrology (Packaged Commodities) Rules, 2011 (Rule 6).

STATUTORY REQUIREMENTS TO EXTRACT:
1. Generic/Common Name of Commodity (Rule 6(1)(b))
2. Net Quantity and Unit (Rule 6(1)(c), Rule 11-13) - Look for g, kg, ml, l, or counts (N)
3. Maximum Retail Price (MRP) (Rule 6(1)(da)) - Must look for 'MRP' / '₹' / 'Rs.' and whether 'Inclusive of all taxes' is declared
4. Month & Year of Manufacture/Packing/Import (Rule 6(1)(d))
5. Name and complete postal address of Manufacturer / Packer (Rule 6(1)(a))
6. Specific factory/premises/manufacturing address of product (Rule 6(1)(aa))
7. Country of Origin (Rule 6(1)(aa)) (e.g. 'Made in India', 'Country of Origin: India')
8. Consumer Care contact: Phone, Email, Address (Rule 6(1)(e))
9. Lot / Batch / Code number (Rule 6(1)(f))
10. Unit Sale Price (USP) if declared (e.g. ₹ X per g/ml)

OUTPUT STRICT JSON SCHEMA ONLY:
{
  "commodityName": "",
  "netQuantity": "",
  "unit": "",
  "mrp": "",
  "mrpNumeric": 0,
  "hasInclusiveOfTaxes": false,
  "mfgDate": "",
  "expDate": "",
  "manufacturer": "",
  "productAddress": "",
  "countryOfOrigin": "",
  "customerCarePhone": "",
  "customerCareEmail": "",
  "customerCareAddress": "",
  "batchNo": "",
  "unitSalePrice": ""
}
Return pure JSON with no markdown wrapping.`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: visionPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const apiResult = await this._callGeminiApi(payload, this.getPreferredModel());
    const structured = this._cleanAndParseJson(apiResult.text);
    if (!structured) {
      throw new Error("Failed to parse structured JSON from Vision-LLM response");
    }

    const evaluation = RuleEngine.evaluate(structured, "");

    return {
      structured,
      evaluation,
      modelUsed: apiResult.modelUsed
    };
  }

  /**
   * STEP 3: Compare Text-LLM and Vision-LLM outputs, perform cross-verification consensus, and detect discrepancies.
   */
  computeConsensus(step1Result, step2Result, heuristicResult = null) {
    const s1 = step1Result ? step1Result.structured : null;
    const s2 = step2Result ? step2Result.structured : null;
    const h = heuristicResult ? heuristicResult.structured : {};

    // If only one LLM result succeeded
    if (s1 && !s2) {
      return {
        consensusData: s1,
        evaluation: step1Result.evaluation,
        agreementLevel: "HIGH",
        confidenceScore: 92,
        consensusMethod: "TEXT_LLM_STANDALONE",
        discrepancies: []
      };
    }
    if (!s1 && s2) {
      return {
        consensusData: s2,
        evaluation: step2Result.evaluation,
        agreementLevel: "HIGH",
        confidenceScore: 92,
        consensusMethod: "VISION_LLM_STANDALONE",
        discrepancies: []
      };
    }
    if (!s1 && !s2) {
      const evaluation = RuleEngine.evaluate(h, heuristicResult ? heuristicResult.raw_text : "");
      return {
        consensusData: h,
        evaluation: evaluation,
        agreementLevel: "NOT_APPLICABLE",
        confidenceScore: 70,
        consensusMethod: "HEURISTIC_RULE_FALLBACK",
        discrepancies: []
      };
    }

    // Both Step 1 (Text-LLM) and Step 2 (Vision-LLM) are available. Compare critical declarations:
    const discrepancies = [];
    const consensus = {};
    let agreementsCount = 0;
    let criticalFieldsChecked = 0;

    const criticalFields = [
      "mrpNumeric",
      "hasInclusiveOfTaxes",
      "netQuantity",
      "unit",
      "commodityName",
      "mfgDate",
      "countryOfOrigin",
      "manufacturer",
      "productAddress",
      "batchNo",
      "customerCarePhone",
      "customerCareEmail"
    ];

    criticalFields.forEach((field) => {
      criticalFieldsChecked++;
      const val1 = s1[field];
      const val2 = s2[field];

      if (field === "mrpNumeric") {
        const num1 = typeof val1 === "number" && !isNaN(val1) ? val1 : null;
        const num2 = typeof val2 === "number" && !isNaN(val2) ? val2 : null;

        if (num1 !== null && num2 !== null) {
          if (Math.abs(num1 - num2) < 0.05) {
            consensus[field] = num1;
            consensus.mrp = s1.mrp || s2.mrp || `₹ ${num1}`;
            agreementsCount++;
          } else {
            // Mismatch: cross-check with heuristic or pick non-zero
            discrepancies.push({
              field: "mrpNumeric",
              textLlmValue: String(num1),
              visionLlmValue: String(num2),
              resolvedValue: String(num2), // Vision model has higher accuracy for prices with currency symbols
              resolutionReason: "Vision-LLM prioritized for optical price confirmation"
            });
            consensus[field] = num2;
            consensus.mrp = s2.mrp || `₹ ${num2}`;
          }
        } else {
          consensus[field] = num1 !== null ? num1 : num2;
          consensus.mrp = s1.mrp || s2.mrp || (consensus[field] ? `₹ ${consensus[field]}` : "");
          if (consensus[field] !== null) agreementsCount += 0.5;
        }
        return;
      }

      if (field === "hasInclusiveOfTaxes") {
        const bool1 = Boolean(val1);
        const bool2 = Boolean(val2);
        if (bool1 === bool2) {
          consensus[field] = bool1;
          agreementsCount++;
        } else {
          // If either model confirms tax inclusive declaration on packaging, adopt true
          consensus[field] = bool1 || bool2;
          discrepancies.push({
            field: "hasInclusiveOfTaxes",
            textLlmValue: String(bool1),
            visionLlmValue: String(bool2),
            resolvedValue: "true",
            resolutionReason: "Statutory benefit of doubt: tax inclusive phrase detected on package"
          });
        }
        return;
      }

      // String fields comparison
      const str1 = (val1 || "").toString().trim().toLowerCase();
      const str2 = (val2 || "").toString().trim().toLowerCase();

      if (str1 && str2) {
        if (str1 === str2 || str1.includes(str2) || str2.includes(str1)) {
          // Agreement: choose the more comprehensive string
          consensus[field] = str1.length >= str2.length ? s1[field] : s2[field];
          agreementsCount++;
        } else {
          // Discrepancy
          discrepancies.push({
            field,
            textLlmValue: String(s1[field]),
            visionLlmValue: String(s2[field]),
            resolvedValue: String(s2[field] || s1[field]),
            resolutionReason: "Vision-LLM prioritized for packaging label geometry"
          });
          consensus[field] = s2[field] || s1[field];
        }
      } else if (str1 && !str2) {
        consensus[field] = s1[field];
        agreementsCount += 0.5;
      } else if (!str1 && str2) {
        consensus[field] = s2[field];
        agreementsCount += 0.5;
      } else {
        consensus[field] = h[field] || "";
      }
    });

    // Populate remaining fields
    consensus.unitSalePrice = s1.unitSalePrice || s2.unitSalePrice || h.unitSalePrice || "";
    consensus.customerCareAddress = s1.customerCareAddress || s2.customerCareAddress || h.customerCareAddress || "";
    consensus.expDate = s1.expDate || s2.expDate || h.expDate || "";

    // Agreement Level calculation
    const agreementRatio = agreementsCount / criticalFieldsChecked;
    let agreementLevel = "MEDIUM";
    let confidenceScore = Math.min(99, Math.round(75 + agreementRatio * 25));

    if (discrepancies.length === 0 && agreementRatio >= 0.75) {
      agreementLevel = "HIGH";
      confidenceScore = 98;
    } else if (discrepancies.some((d) => d.field === "mrpNumeric" || d.field === "netQuantity")) {
      agreementLevel = "WARNING_DISCREPANCY";
      confidenceScore = Math.max(70, confidenceScore - 15);
    }

    const combinedRaw = [step1Result.rawText, heuristicResult?.raw_text].filter(Boolean).join("\n");
    const evaluation = RuleEngine.evaluate(consensus, combinedRaw);

    return {
      consensusData: consensus,
      evaluation,
      agreementLevel,
      confidenceScore,
      consensusMethod: "MULTI_MODAL_CONSENSUS",
      discrepancies
    };
  }

  /**
   * Master pipeline orchestrator: Executes Step 1, Step 2, Step 3, with token conservation and old-method fallback.
   */
  async verifyPackaging({ localPath, imageUrl, ocrResult, sampleType = null }) {
    const apiKey = this.getApiKey();
    const quotaExhausted = this.isQuotaExhausted();
    const optimizationMode = this.getOptimizationMode();

    console.log(`[LLM-Service] Starting verification. API Key configured: ${Boolean(apiKey)}, Quota Exhausted: ${quotaExhausted}, Optimization Mode: ${optimizationMode}`);

    // If no API key or daily quota reached -> seamlessly fall back to old method
    if (!apiKey || quotaExhausted) {
      const reason = !apiKey
        ? "No GEMINI_API_KEY configured (Operating on built-in PaddleOCR layout parser)"
        : "Daily free Gemini quota limit reached (Automatically restores tomorrow)";
      console.log(`[LLM-Service] Bypassing LLM. Reason: ${reason}`);

      const oldEvaluation = RuleEngine.evaluate(ocrResult.structured, ocrResult.raw_text);
      return {
        finalData: ocrResult.structured,
        evaluation: oldEvaluation,
        multiModalAnalysis: {
          engineUsed: "HEURISTIC_OLD_METHOD",
          agreementLevel: "NOT_APPLICABLE",
          confidenceScore: 78,
          step1TextLlm: null,
          step2VisionLlm: null,
          discrepancies: [],
          quotaStatus: quotaExhausted ? "EXHAUSTED_DAILY_FALLBACK" : "NO_KEY_FALLBACK",
          tokensSaved: false,
          fallbackReason: reason
        }
      };
    }

    let step1Result = null;
    let step2Result = null;
    let tokensSaved = false;

    // STEP 1: Text-LLM on PaddleOCR Tokens + [x, y, w, h]
    try {
      console.log("[LLM-Service] Executing Step 1: Text-LLM on PaddleOCR tokens and spatial coordinates...");
      step1Result = await this.processStep1TextLlm(
        ocrResult.boxes || [],
        ocrResult.image_dims || { width: 800, height: 600 },
        ocrResult.raw_text || ""
      );
      console.log(`[LLM-Service] Step 1 complete. Compliance Status: ${step1Result?.evaluation?.complianceStatus}, Score: ${step1Result?.evaluation?.score}%`);
    } catch (step1Err) {
      console.warn(`[LLM-Service] Step 1 (Text-LLM) encountered error: ${step1Err.message}`);
      if (step1Err.message === "QUOTA_EXHAUSTED_TODAY") {
        const oldEvaluation = RuleEngine.evaluate(ocrResult.structured, ocrResult.raw_text);
        return {
          finalData: ocrResult.structured,
          evaluation: oldEvaluation,
          multiModalAnalysis: {
            engineUsed: "HEURISTIC_OLD_METHOD",
            agreementLevel: "NOT_APPLICABLE",
            confidenceScore: 75,
            step1TextLlm: null,
            step2VisionLlm: null,
            discrepancies: [],
            quotaStatus: "EXHAUSTED_DAILY_FALLBACK",
            tokensSaved: false,
            fallbackReason: "Daily free Gemini quota limit reached during Step 1 (Restores tomorrow)"
          }
        };
      }
    }

    // CHECK FOR STEP 1 SHORT-CIRCUIT (Token-Saving Mode)
    // If optimizationMode === 'smart', check if Step 1 produced high-confidence, violation-free result
    if (optimizationMode === "smart" && step1Result && step1Result.evaluation) {
      const s = step1Result.structured;
      const evalScore = step1Result.evaluation.score;
      const isHighQuality = (
        s.commodityName &&
        s.netQuantity &&
        s.mrpNumeric &&
        s.countryOfOrigin &&
        s.manufacturer &&
        evalScore >= 88
      );

      if (isHighQuality) {
        console.log(`[LLM-Service] Token Optimization: Step 1 achieved high confidence (Score: ${evalScore}%). Skipping Step 2 Vision LLM to conserve daily tokens!`);
        tokensSaved = true;
        return {
          finalData: step1Result.structured,
          evaluation: step1Result.evaluation,
          multiModalAnalysis: {
            engineUsed: "TEXT_LLM_OPTIMIZED",
            agreementLevel: "HIGH",
            confidenceScore: 95,
            step1TextLlm: {
              data: step1Result.structured,
              score: step1Result.evaluation.score,
              model: step1Result.modelUsed
            },
            step2VisionLlm: null,
            discrepancies: [],
            quotaStatus: "AVAILABLE",
            tokensSaved: true,
            optimizationNote: "Vision-LLM skipped because Step 1 achieved >88% confidence with full statutory declarations."
          }
        };
      }
    }

    // STEP 2: Vision-LLM directly on packaging image
    try {
      console.log("[LLM-Service] Executing Step 2: Vision-LLM directly on packaging image...");
      if (localPath && fs.existsSync(localPath)) {
        step2Result = await this.processStep2VisionLlm(localPath);
        console.log(`[LLM-Service] Step 2 complete. Compliance Status: ${step2Result?.evaluation?.complianceStatus}, Score: ${step2Result?.evaluation?.score}%`);
      }
    } catch (step2Err) {
      console.warn(`[LLM-Service] Step 2 (Vision-LLM) encountered error: ${step2Err.message}`);
      if (step2Err.message === "QUOTA_EXHAUSTED_TODAY") {
        this.markQuotaExhausted("During Step 2");
      }
    }

    // STEP 3: Consensus and Comparison
    console.log("[LLM-Service] Executing Step 3: Multi-Modal Consensus comparison...");
    const consensusResult = this.computeConsensus(step1Result, step2Result, ocrResult);

    return {
      finalData: consensusResult.consensusData,
      evaluation: consensusResult.evaluation,
      multiModalAnalysis: {
        engineUsed: consensusResult.consensusMethod,
        agreementLevel: consensusResult.agreementLevel,
        confidenceScore: consensusResult.confidenceScore,
        step1TextLlm: step1Result
          ? { data: step1Result.structured, score: step1Result.evaluation.score, model: step1Result.modelUsed }
          : null,
        step2VisionLlm: step2Result
          ? { data: step2Result.structured, score: step2Result.evaluation.score, model: step2Result.modelUsed }
          : null,
        discrepancies: consensusResult.discrepancies || [],
        quotaStatus: this.isQuotaExhausted() ? "EXHAUSTED_DAILY_FALLBACK" : "AVAILABLE",
        tokensSaved: tokensSaved
      }
    };
  }
}

module.exports = new LlmService();
