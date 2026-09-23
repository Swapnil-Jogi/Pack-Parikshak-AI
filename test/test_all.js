const assert = require("assert");
const RuleEngine = require("../services/ruleEngine");
const PdfService = require("../services/pdfService");
const ocrService = require("../services/ocrService");
const path = require("path");

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING PACK-PARIKSHAK AI AUTOMATED TEST SUITE");
  console.log("==================================================");

  // Test 1: Rule Engine - Compliant Case
  console.log("\n[Test 1] Testing Rule Engine on Fully Compliant Data...");
  const compliantData = {
    commodityName: "Whole Wheat Flour",
    netQuantity: "5 kg",
    declaredQuantity: "5",
    unit: "kg",
    mrp: "Rs. 285.00 (Inclusive of all taxes)",
    hasInclusiveOfTaxes: true,
    unitSalePrice: "Rs. 57.00 / kg",
    mfgDate: "04/2026",
    productAddress: "Plot No. 45, Sector 18, Industrial Area, Karnal, Haryana - 132001",
    manufacturer: "Kisan Agro Industries Pvt Ltd, Sector 18, Karnal, Haryana",
    countryOfOrigin: "India",
    customerCarePhone: "1800-200-8899",
    customerCareEmail: "care@kisanagro.in",
    estimatedFontHeightMm: 6.2
  };
  const eval1 = RuleEngine.evaluate(compliantData, "");
  assert.strictEqual(eval1.complianceStatus, "COMPLIANT", "Expected COMPLIANT status");
  assert.strictEqual(eval1.violationsCount, 0, "Expected 0 violations");
  assert.strictEqual(eval1.score, 100, "Expected 100 score");
  console.log("✓ PASS: Compliant package scored 100% with 0 violations.");

  // Test 2: Rule Engine - Violating Case (Illegal unit 'gms', missing taxes, missing origin, missing USP)
  console.log("\n[Test 2] Testing Rule Engine on Violating Data...");
  const violatingData = {
    commodityName: "Potato Chips",
    netQuantity: "400 gms", // Non-standard unit under Rule 13!
    declaredQuantity: "400",
    unit: "gms",
    mrp: "Rs. 60.00 Only", // Missing 'inclusive of all taxes'
    hasInclusiveOfTaxes: false,
    mfgDate: "01/2026",
    manufacturer: "Desi Snackers, Delhi",
    countryOfOrigin: "", // Missing origin!
    customerCarePhone: "9876543210",
    customerCareEmail: "", // Incomplete care details!
    estimatedFontHeightMm: 3.5
  };
  const eval2 = RuleEngine.evaluate(violatingData, "");
  assert.strictEqual(eval2.complianceStatus, "NON_COMPLIANT", "Expected NON_COMPLIANT status");
  assert.ok(eval2.violationsCount >= 3, `Expected at least 3 violations, got ${eval2.violationsCount}`);
  assert.ok(eval2.violationsList.some(v => /rule 13/i.test(v)), "Expected Rule 13 unit violation");
  assert.ok(eval2.violationsList.some(v => /tax/i.test(v)), "Expected Rule 6(1)(e) tax violation");
  assert.ok(eval2.violationsList.some(v => /origin/i.test(v)), "Expected Rule 6(1)(aa) origin violation");
  assert.ok(eval2.violationsList.some(v => /rule 6\(1\)\(m\)/i.test(v) || /usp/i.test(v)), "Expected Rule 6(1)(m) USP violation");
  console.log(`✓ PASS: Violating package detected ${eval2.violationsCount} violations including Rule 13 ('gms'), Rule 6(1)(e) (taxes), and Rule 6(1)(m) (USP).`);

  // Test 3: Standalone OCR Execution Test on Sample Label Image
  console.log("\n[Test 3] Testing PaddleOCR Service on Sample Image...");
  const sampleImgPath = path.join(__dirname, "..", "public", "samples", "compliant_wheat_flour.png");
  const ocrRes = await ocrService.processImage(sampleImgPath);
  assert.strictEqual(ocrRes.success, true, "OCR should return success");
  assert.ok(ocrRes.boxes.length > 0, "OCR should detect boxes");
  assert.ok(ocrRes.structured.netQuantity.includes("5 kg"), `Expected netQuantity '5 kg', got '${ocrRes.structured.netQuantity}'`);
  console.log(`✓ PASS: OCR successfully extracted ${ocrRes.boxes.length} bounding boxes and identified '5 kg' net quantity.`);

  // Test 4: PDF Generation
  console.log("\n[Test 4] Testing PDFKit Legal Audit Report Generation...");
  const mockInspection = {
    inspectionNumber: "LM-TEST-2026-9999",
    createdAt: new Date(),
    productName: "Supreme Sharbati Wheat Flour",
    brand: "Kisan Agro",
    category: "Food & Groceries",
    complianceStatus: "COMPLIANT",
    complianceScore: 100,
    extractedData: compliantData,
    rulesEvaluation: eval1.rules,
    location: { state: "Delhi", district: "Central" },
    section36Penalty: { estimatedAmount: 0 }
  };
  const pdfBuffer = await PdfService.generateReportBuffer(mockInspection, { name: "Test Officer", badgeId: "DL-01" });
  assert.ok(Buffer.isBuffer(pdfBuffer), "PDF should return Buffer");
  assert.ok(pdfBuffer.length > 1000, `PDF buffer length should be substantial, got ${pdfBuffer.length} bytes`);
  assert.strictEqual(pdfBuffer.slice(0, 4).toString(), "%PDF", "PDF buffer should begin with %PDF header");
  console.log(`✓ PASS: Generated official legal audit PDF (${pdfBuffer.length} bytes).`);

  console.log("\n==================================================");
  console.log("ALL 4 CRITICAL AUTOMATED TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
  process.exit(0);
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

