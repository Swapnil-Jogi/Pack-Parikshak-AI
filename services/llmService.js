const axios = require("axios");
const fs = require("fs");
const path = require("path");
const RuleEngine = require("./ruleEngine");

class LlmService {
  constructor() {
    // Active Gemini models on Google AI Studio
    this.models = [
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
      "gemini-3.8-flash"
    ];
  }

  getApiKey() {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  }

  getPreferredModel() {
    let m = (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite").trim();
    // Guard against retired 1.5, 2.0, or 8b models that return 404
    if (m.includes("1.5") || m.includes("2.0") || m.includes("8b") || !m) {
      m = "gemini-3.1-flash-lite";
    }
    return m;
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
   * Ensures structured fields conform to expected Pack-Parikshak schema with intelligent cross-field normalization.
   */
  _sanitizeStructuredData(obj = {}) {
    const safeStr = (v) => (v !== undefined && v !== null ? String(v).trim() : "");
    const safeBool = (v) => Boolean(v === true || v === "true" || v === 1);

    let mrpNum = null;
    let mrpStr = safeStr(obj.mrp);
    if (obj.mrpNumeric !== undefined && obj.mrpNumeric !== null && !isNaN(Number(obj.mrpNumeric)) && Number(obj.mrpNumeric) > 0) {
      mrpNum = Number(obj.mrpNumeric);
    } else if (mrpStr) {
      const match = mrpStr.match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
      if (match) mrpNum = parseFloat(match[1].replace(",", "."));
    }
    if (mrpNum && (!mrpStr || !mrpStr.includes(String(mrpNum)))) {
      mrpStr = `₹ ${mrpNum}`;
    }

    let hasTaxes = safeBool(obj.hasInclusiveOfTaxes);
    if (!hasTaxes && /(?:incl|inclusive|tax|taxes)/i.test(mrpStr)) {
      hasTaxes = true;
    }

    let netQty = safeStr(obj.netQuantity);
    let unit = safeStr(obj.unit).toLowerCase();
    if (netQty && !unit) {
      const uMatch = netQty.match(/(?:^|\s|\d)([a-zA-Z]+)$/);
      if (uMatch) unit = uMatch[1].toLowerCase();
    }
    if (netQty && unit && !netQty.toLowerCase().includes(unit)) {
      netQty = `${netQty} ${unit}`;
    }

    let mfgName = safeStr(obj.manufacturer);
    let prodAddr = safeStr(obj.productAddress);
    // If productAddress is missing but manufacturer string contains full address/pincode, share it
    if (!prodAddr && mfgName && (/\b\d{6}\b/.test(mfgName) || mfgName.length > 25)) {
      prodAddr = mfgName;
    }

    let origin = safeStr(obj.countryOfOrigin);
    if (!origin && /(?:india|bharat|made in india)/i.test(mfgName + " " + prodAddr)) {
      origin = "India";
    }

    return {
      commodityName: safeStr(obj.commodityName),
      netQuantity: netQty,
      unit: unit,
      mrp: mrpStr,
      mrpNumeric: mrpNum,
      hasInclusiveOfTaxes: hasTaxes,
      mfgDate: safeStr(obj.mfgDate),
      expDate: safeStr(obj.expDate || obj.useByDate),
      manufacturer: mfgName,
      productAddress: prodAddr,
      countryOfOrigin: origin,
      customerCarePhone: safeStr(obj.customerCarePhone),
      customerCareEmail: safeStr(obj.customerCareEmail),
      customerCareAddress: safeStr(obj.customerCareAddress),
      batchNo: safeStr(obj.batchNo),
      unitSalePrice: safeStr(obj.unitSalePrice)
    };
  }

  /**
   * Calls Google Gemini REST API with model fallback and automatic retry on temporary throttles.
   */
  async _callGeminiApi(payload, preferredModel = null) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("NO_API_KEY");
    }

    // Filter out any deprecated models (1.5, 2.0, 8b)
    const validModels = this.models.filter((m) => !m.includes("1.5") && !m.includes("2.0") && !m.includes("8b"));
    const pref = preferredModel && validModels.includes(preferredModel)
      ? preferredModel
      : this.getPreferredModel();

    const candidateModels = [pref, ...validModels.filter((m) => m !== pref)];
    let lastError = null;

    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await axios.post(url, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 16000
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

          // If momentary 503 high demand spike, wait 1.5s and retry once
          if (status === 503 && attempt === 0) {
            console.log(`[LLM-Service] Temporary 503 on ${model}, retrying in 1.5s...`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          console.warn(`[LLM-Service] Gemini call failed for ${model} (${errMsg}). Trying next model...`);
          break; // Move to next model candidate
        }
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

    // Format tokens with their spatial (x, y, w, h) coordinates
    const formattedTokens = tokens.slice(0, 160).map((t, idx) => {
      let x = t.x ?? 0;
      let y = t.y ?? 0;
      let w = t.w ?? 0;
      let h = t.h ?? 0;
      if (t.box && Array.isArray(t.box)) {
        if (t.box.length === 4 && typeof t.box[0] === "number") {
          [x, y, w, h] = t.box;
        } else if (t.box.length >= 4 && Array.isArray(t.box[0])) {
          const xs = t.box.map((p) => p[0]);
          const ys = t.box.map((p) => p[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          x = minX;
          y = minY;
          w = Math.max(...xs) - minX;
          h = Math.max(...ys) - minY;
        }
      }
      return {
        i: idx + 1,
        text: t.text || "",
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        conf: Math.round((t.confidence || 0.8) * 100) / 100
      };
    });

    const systemInstruction = `You are a Senior Legal Metrology Enforcement Officer in India verifying pre-packaged commodities under the Legal Metrology (Packaged Commodities) Rules, 2011.
You are given OCR tokens extracted by PaddleOCR with canvas spatial coordinates (x, y, w, h) from an image of size ${imageDims.width}x${imageDims.height}.

SPATIAL LAYOUT RULES FOR RECONSTRUCTING SCRAMBLED TEXT:
1. Horizontal Row Alignment: Tokens with similar 'y' coordinates (+/- 15px) are on the SAME horizontal line.
2. Key-Value Association: On packaging labels, keys are on the left and values are on the right (e.g. "Net Quantity:" on left, "500 g" on right).
3. Column Association: Stacked tokens with similar 'x' coordinates form vertical columns.
4. Clean Statutory Parsing: Reconstruct broken numbers, dates, prices, and addresses.

REQUIRED OUTPUT JSON FORMAT:
{
  "commodityName": "Common or generic name of commodity (e.g. Atta, Potato Chips, Talcum Powder, Soap)",
  "netQuantity": "Standard net quantity declaration (e.g. 500 g, 1 kg, 100 ml, 10 N)",
  "unit": "Measurement unit (g, kg, ml, l, n)",
  "mrp": "Full MRP string as declared (e.g. ₹ 99.00 (incl. of all taxes) or Rs. 61/-)",
  "mrpNumeric": 99.00,
  "hasInclusiveOfTaxes": true,
  "mfgDate": "Month and year of manufacture/packing (e.g. 08/2026 or JAN.2025)",
  "expDate": "Expiry or Best Before date (e.g. 08/2028 or 24 months from mfg)",
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
      `Raw Full Text:\n${rawText || tokens.map((t) => t.text).join(" ")}\n\n` +
      `PaddleOCR Spatial Tokens [x, y, w, h]:\n${JSON.stringify(formattedTokens, null, 2)}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: systemInstruction + "\n\n" + prompt }]
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
   * STEP 2: Process product image directly through Vision-LLM (Cloudinary URL or local file buffer).
   */
  async processStep2VisionLlm(imageTarget, mimeType = "image/jpeg") {
    let base64Data = "";

    // 1. If remote Cloudinary / HTTP / HTTPS URL
    if (typeof imageTarget === "string" && (imageTarget.startsWith("http://") || imageTarget.startsWith("https://"))) {
      try {
        console.log(`[LLM-Service] Fetching remote image for Vision LLM: ${imageTarget}`);
        const resp = await axios.get(imageTarget, { responseType: "arraybuffer", timeout: 15000 });
        base64Data = Buffer.from(resp.data).toString("base64");
        const ct = resp.headers["content-type"];
        if (ct && ct.includes("png")) mimeType = "image/png";
        else if (ct && ct.includes("webp")) mimeType = "image/webp";
        else mimeType = "image/jpeg";
      } catch (dlErr) {
        console.warn("[LLM-Service] Could not fetch remote Cloudinary image URL:", dlErr.message);
      }
    }

    // 2. If path on disk or relative URL (check all candidate locations)
    if (!base64Data && typeof imageTarget === "string") {
      const candidates = [
        imageTarget,
        path.resolve(process.cwd(), imageTarget),
        path.join(process.cwd(), "public", imageTarget),
        path.join(process.cwd(), "public", imageTarget.replace(/^\/+/, "")),
        path.join(process.cwd(), "public", "uploads", path.basename(imageTarget))
      ];

      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const stats = fs.statSync(p);
            if (stats.isFile() && stats.size > 0) {
              const buf = fs.readFileSync(p);
              base64Data = buf.toString("base64");
              const ext = path.extname(p).toLowerCase();
              if (ext === ".png") mimeType = "image/png";
              else if (ext === ".webp") mimeType = "image/webp";
              else mimeType = "image/jpeg";
              console.log(`[LLM-Service] Resolved local image path for Vision LLM: ${p} (${stats.size} bytes)`);
              break;
            }
          }
        } catch (e) {}
      }
    }

    // 3. If raw Buffer
    if (!base64Data && Buffer.isBuffer(imageTarget)) {
      base64Data = imageTarget.toString("base64");
    }

    if (!base64Data) {
      throw new Error(`Vision LLM could not locate image buffer or path: ${imageTarget}`);
    }

    const visionPrompt = `You are a Senior Legal Metrology Enforcement Officer in India inspecting this product packaging label image with maximum optical accuracy.
Read every panel, line, and text on this package. Look closely at small print, rotated text, curved labels, and margins.
Extract all statutory declarations under the Legal Metrology (Packaged Commodities) Rules, 2011:
1. Common/Generic Name of Commodity (Rule 6(1)(b)) - e.g. Talcum Powder, Atta, Biscuit, Soap, Shampoo, Oil
2. Net Quantity and Standard Unit (Rule 6(1)(c), Rule 11-13) - e.g. 100 g, 500 g, 1 kg, 100 ml, 1 L, 10 N
3. Maximum Retail Price (MRP) (Rule 6(1)(da)) - Exact price number, currency, and whether 'inclusive of all taxes' or 'incl. of all taxes' is declared
4. Month & Year of Manufacture/Packing/Import (Rule 6(1)(d)) - Look for Mfd, Packed on, Date
5. Name and complete postal address of Manufacturer / Packer / Importer (Rule 6(1)(a))
6. Complete address of product/facility/premises (Rule 6(1)(aa))
7. Country of Origin (Rule 6(1)(aa)) - e.g. 'India', 'Made in India'
8. Consumer Care Details (Rule 6(1)(e)) - Phone/Helpline, Email, Postal Address
9. Lot / Batch / Code Number (Rule 6(1)(f)) - Look for Batch No., B.No., Lot
10. Unit Sale Price (USP) (Rule 6(1)(m)) - If declared (e.g. ₹ X per g/ml)

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
    const h = (heuristicResult && heuristicResult.structured) || (heuristicResult && typeof heuristicResult === "object" ? heuristicResult : {});

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
        confidenceScore: 95,
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
            // Mismatch: pick Vision model for optical price verification on packaging
            discrepancies.push({
              field: "mrpNumeric",
              textLlmValue: String(num1),
              visionLlmValue: String(num2),
              resolvedValue: String(num2),
              resolutionReason: "Vision-LLM prioritized for optical price confirmation"
            });
            consensus[field] = num2;
            consensus.mrp = s2.mrp || `₹ ${num2}`;
          }
        } else {
          consensus[field] = num2 !== null ? num2 : num1;
          consensus.mrp = s2.mrp || s1.mrp || (consensus[field] ? `₹ ${consensus[field]}` : "");
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
          // Discrepancy: prioritize Vision-LLM for full physical context
          discrepancies.push({
            field,
            textLlmValue: String(s1[field]),
            visionLlmValue: String(s2[field]),
            resolvedValue: String(s2[field] || s1[field]),
            resolutionReason: "Vision-LLM prioritized for packaging label geometry"
          });
          consensus[field] = s2[field] || s1[field];
        }
      } else if (str2 && !str1) {
        // Vision-LLM detected declaration that Text-LLM missed
        consensus[field] = s2[field];
        agreementsCount += 0.75;
      } else if (str1 && !str2) {
        consensus[field] = s1[field];
        agreementsCount += 0.5;
      } else {
        consensus[field] = h[field] || "";
      }
    });

    // Populate remaining fields
    consensus.unitSalePrice = s2.unitSalePrice || s1.unitSalePrice || h.unitSalePrice || "";
    consensus.customerCareAddress = s2.customerCareAddress || s1.customerCareAddress || h.customerCareAddress || "";
    consensus.expDate = s2.expDate || s1.expDate || h.expDate || "";

    // Agreement Level calculation
    const agreementRatio = agreementsCount / criticalFieldsChecked;
    let agreementLevel = "MEDIUM";
    let confidenceScore = Math.min(99, Math.round(80 + agreementRatio * 20));

    if (discrepancies.length === 0 && agreementRatio >= 0.7) {
      agreementLevel = "HIGH";
      confidenceScore = 98;
    } else if (discrepancies.some((d) => d.field === "mrpNumeric" || d.field === "netQuantity")) {
      agreementLevel = "WARNING_DISCREPANCY";
      confidenceScore = Math.max(75, confidenceScore - 10);
    }

    const combinedRaw = [step1Result?.rawText, heuristicResult?.raw_text].filter(Boolean).join("\n");
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
   * Master pipeline orchestrator: Executes Step 1 (Text-LLM) and Step 2 (Vision-LLM) concurrently and compares in Step 3.
   */
  async verifyPackaging(arg1, arg2 = null) {
    let localPath, imageUrl, ocrResult, sampleType;
    if (arg1 && typeof arg1 === "object" && (arg1.ocrResult !== undefined || arg1.localPath !== undefined || arg1.imageUrl !== undefined)) {
      ({ localPath, imageUrl, ocrResult, sampleType = null } = arg1);
    } else {
      localPath = typeof arg1 === "string" ? arg1 : null;
      imageUrl = typeof arg1 === "string" ? arg1 : null;
      ocrResult = arg2 || {};
      sampleType = null;
    }

    ocrResult = ocrResult || {};
    const boxes = ocrResult.boxes || ocrResult.tokens || [];
    const imageDims = ocrResult.image_dims || { width: 800, height: 600 };
    const rawText = ocrResult.raw_text || "";
    const structuredFallback = ocrResult.structured || {};

    const apiKey = this.getApiKey();

    if (!apiKey) {
      console.log("[LLM-Service] No GEMINI_API_KEY configured. Running built-in PaddleOCR layout parser.");
      const oldEvaluation = RuleEngine.evaluate(structuredFallback, rawText);
      return {
        finalData: structuredFallback,
        evaluation: oldEvaluation,
        multiModalAnalysis: {
          engineUsed: "HEURISTIC_OLD_METHOD",
          agreementLevel: "NOT_APPLICABLE",
          confidenceScore: 78,
          step1TextLlm: null,
          step2VisionLlm: null,
          discrepancies: []
        }
      };
    }

    console.log("[LLM-Service] Executing Multi-Modal Pipeline: Step 1 (Text-LLM) and Step 2 (Vision-LLM) concurrently...");

    // Determine target image location
    const targetImage = (imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")))
      ? imageUrl
      : (localPath || imageUrl);

    // Run Step 1 (Text-LLM on PaddleOCR tokens) and Step 2 (Vision-LLM on packaging image) in parallel
    const [step1Settled, step2Settled] = await Promise.allSettled([
      this.processStep1TextLlm(
        boxes,
        imageDims,
        rawText
      ),
      this.processStep2VisionLlm(targetImage)
    ]);

    const step1Result = step1Settled.status === "fulfilled" ? step1Settled.value : null;
    const step2Result = step2Settled.status === "fulfilled" ? step2Settled.value : null;

    if (step1Settled.status === "rejected") {
      console.warn(`[LLM-Service] Step 1 (Text-LLM) failed: ${step1Settled.reason?.message}`);
    }
    if (step2Settled.status === "rejected") {
      console.warn(`[LLM-Service] Step 2 (Vision-LLM) failed: ${step2Settled.reason?.message}`);
    }

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
        discrepancies: consensusResult.discrepancies || []
      }
    };
  }
}

module.exports = new LlmService();
