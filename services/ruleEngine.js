/**
 * Legal Metrology (Packaged Commodities) Rules, 2011 - Statutory Rule Verification Engine
 * Implements strict verification of the 8 mandatory declarations under Rule 6 and Rule 7.
 */

// Standard SI units permitted under Rule 11 & Rule 12
const PERMITTED_SI_UNITS = [
  "g", "kg", "mg",
  "ml", "l", "cl",
  "m", "cm", "mm",
  "n", "u", "number", "units"
];

// Illegal non-standard abbreviations strictly prohibited under Rule 13
const ILLEGAL_UNIT_ABBREVIATIONS = [
  "gm", "gms", "grm", "gram", "grams",
  "kilo", "kilos", "kgs",
  "ltr", "ltrs", "liter", "liters", "litre", "litres",
  "mlt", "m.l.", "k.g.", "nos", "no."
];

class RuleEngine {
  /**
   * Evaluates extracted or manually corrected packaging data.
   * @param {Object} data - Extracted or corrected label fields
   * @param {String} rawText - Full raw OCR text
   * @returns {Object} Evaluation summary with score, rule statuses, and Section 36 penalty
   */
  static evaluate(data = {}, rawText = "") {
    const rules = [];
    const violations = [];
    let passedCount = 0;
    let warningCount = 0;

    // Normalize text
    const textBlob = (rawText || "").toLowerCase();

    // -------------------------------------------------------------
    // RULE 1: Rule 6(1)(a) - Name & Address of Manufacturer / Packer / Importer
    // -------------------------------------------------------------
    const mfg = (data.manufacturer || "").trim();
    if (!mfg) {
      rules.push({
        ruleId: "RULE_6_1_A",
        ruleName: "Manufacturer / Packer Details",
        statutoryReference: "Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Complete name and postal address of manufacturer, packer or importer",
        message: "Mandatory declaration missing: Name and address of manufacturer or packer was not detected on the label."
      });
      violations.push("Rule 6(1)(a): Missing manufacturer/packer name and address.");
    } else if (mfg.length < 10) {
      rules.push({
        ruleId: "RULE_6_1_A",
        ruleName: "Manufacturer / Packer Details",
        statutoryReference: "Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "WARNING",
        detectedValue: mfg,
        requirement: "Full postal address including city and state",
        message: "Partial declaration: Manufacturer name or address appears truncated or incomplete."
      });
      warningCount++;
    } else {
      rules.push({
        ruleId: "RULE_6_1_A",
        ruleName: "Manufacturer / Packer Details",
        statutoryReference: "Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: mfg,
        requirement: "Complete name and postal address",
        message: "Compliant: Manufacturer/packer name and address clearly declared."
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 2: Rule 6(1)(aa) & (a) - Country of Origin & Address of Product
    // -------------------------------------------------------------
    let origin = (data.countryOfOrigin || "").trim();
    if (!origin && (/\b(india|bharat|made in india)\b/i.test(textBlob) || /\b(india|bharat)\b/i.test(data.manufacturer || ""))) {
      origin = "India";
    }
    const productAddr = (data.productAddress || "").trim();
    const mfgFull = (data.manufacturer || "").trim();

    // Check if manufacturing/product address is provided either in productAddress, inside manufacturer string, or in raw text
    const hasSpecificProductAddr = Boolean(
      (productAddr && productAddr.length >= 6) ||
      (mfgFull && (/\b[1-9][0-9]{2}\s?[0-9]{3}\b/.test(mfgFull) || /(?:plot|sector|road|street|nagar|ward|phase|industrial|village|dist|state|city|factory|premises|unit|shop|gat|maharashtra|haryana|gujarat|karnataka|delhi|punjab|rajasthan|tamil\s*nadu|kerala|uttar\s*pradesh)/i.test(mfgFull) || mfgFull.length > 25)) ||
      /(?:mfd\.?\s*at|packed\s*at|factory\s*(?:address|at)|premises\s*at|unit\s*(?:address|at))\s*[:=-]?\s*([a-zA-Z0-9,\s\-]{6,})/i.test(textBlob)
    );

    let detectedAddrStr = productAddr || "";
    if (!detectedAddrStr && mfgFull && (/\b[1-9][0-9]{2}\s?[0-9]{3}\b/.test(mfgFull) || mfgFull.length > 20)) {
      detectedAddrStr = mfgFull;
    }

    if (!origin && !hasSpecificProductAddr) {
      rules.push({
        ruleId: "RULE_6_1_AA",
        ruleName: "Country of Origin & Product Address",
        statutoryReference: "Rule 6(1)(aa) & Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Mandatory Country of Origin and complete product manufacturing/packing address",
        message: "Mandatory declarations missing: Neither Country of Origin nor complete Address of Product were detected."
      });
      violations.push("Rule 6(1)(aa): Missing mandatory Country of Origin and Product Address.");
    } else if (!origin) {
      rules.push({
        ruleId: "RULE_6_1_AA",
        ruleName: "Country of Origin & Product Address",
        statutoryReference: "Rule 6(1)(aa) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: `Address: ${detectedAddrStr.substring(0, 30)}... | Origin: Missing`,
        requirement: "Country of Origin must be explicitly declared (e.g. 'Made in India' / 'Country of Origin: India')",
        message: "Mandatory declaration missing: Country of Origin is missing on package label."
      });
      violations.push("Rule 6(1)(aa): Missing mandatory Country of Origin declaration.");
    } else if (!hasSpecificProductAddr) {
      rules.push({
        ruleId: "RULE_6_1_AA",
        ruleName: "Country of Origin & Product Address",
        statutoryReference: "Rule 6(1)(aa) & Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "WARNING",
        detectedValue: `Origin: ${origin} | Address: Incomplete/Missing`,
        requirement: "Both Country of Origin and complete factory/premises address of the product",
        message: `Partial declaration: Country of Origin ('${origin}') is declared, but specific address of product / manufacturing unit was not clearly detected.`
      });
      warningCount++;
    } else {
      rules.push({
        ruleId: "RULE_6_1_AA",
        ruleName: "Country of Origin & Product Address",
        statutoryReference: "Rule 6(1)(aa) & Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: `Origin: ${origin} | Addr: ${detectedAddrStr.substring(0, 35)}`,
        requirement: "Explicit Country of Origin and complete address of product",
        message: `Compliant: Country of Origin ('${origin}') and complete address of product/facility are properly declared.`
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 3: Rule 6(1)(b) - Common or Generic Commodity Name
    // -------------------------------------------------------------
    const commodity = (data.commodityName || "").trim();
    if (!commodity) {
      rules.push({
        ruleId: "RULE_6_1_B",
        ruleName: "Generic Name of Commodity",
        statutoryReference: "Rule 6(1)(b) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Common or generic name of commodity contained in the package",
        message: "Mandatory declaration missing: The generic identity of the commodity must be prominently stated."
      });
      violations.push("Rule 6(1)(b): Missing common or generic name of commodity.");
    } else {
      rules.push({
        ruleId: "RULE_6_1_B",
        ruleName: "Generic Name of Commodity",
        statutoryReference: "Rule 6(1)(b) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: commodity,
        requirement: "Common or generic name",
        message: `Compliant: Commodity declared as '${commodity}'.`
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 4: Rule 6(1)(c) & Rule 11, 13 - Net Quantity & Standard SI Units
    // -------------------------------------------------------------
    const rawUnit = (data.unit || "").trim().toLowerCase();
    const qtyVal = parseFloat(data.declaredQuantity || (data.netQuantity ? data.netQuantity.replace(/[^0-9.]/g, "") : "0"));
    const netQtyStr = (data.netQuantity || "").trim();

    if (!netQtyStr || isNaN(qtyVal) || qtyVal <= 0) {
      rules.push({
        ruleId: "RULE_6_1_C",
        ruleName: "Net Quantity & Standard SI Units",
        statutoryReference: "Rule 6(1)(c) & Rule 11 of Legal Metrology Rules, 2011",
        status: "FAIL",
        detectedValue: netQtyStr || "Not Found",
        requirement: "Valid net quantity in standard SI unit (e.g. g, kg, ml, L)",
        message: "Mandatory declaration missing or invalid: Net quantity value is missing or non-positive."
      });
      violations.push("Rule 6(1)(c): Missing or invalid net quantity.");
    } else if (ILLEGAL_UNIT_ABBREVIATIONS.includes(rawUnit)) {
      rules.push({
        ruleId: "RULE_6_1_C",
        ruleName: "Net Quantity & Standard SI Units",
        statutoryReference: "Rule 13 of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: netQtyStr,
        requirement: `Use standard SI unit symbols ('g' for gram, 'kg' for kilogram, 'l' or 'L' for litre). Illegal non-standard abbreviation: '${rawUnit}'`,
        message: `Illegal abbreviation: Rule 13 strictly prohibits abbreviations like '${rawUnit}'. Must use '${rawUnit.startsWith("g") ? "g" : rawUnit.startsWith("k") ? "kg" : "l"}' instead.`
      });
      violations.push(`Rule 13: Illegal non-standard unit abbreviation '${rawUnit}' used in net quantity.`);
    } else if (PERMITTED_SI_UNITS.includes(rawUnit) || rawUnit === "") {
      rules.push({
        ruleId: "RULE_6_1_C",
        ruleName: "Net Quantity & Standard SI Units",
        statutoryReference: "Rule 6(1)(c) & Rule 11 of Legal Metrology Rules, 2011",
        status: "PASS",
        detectedValue: netQtyStr,
        requirement: "Standard SI unit symbol",
        message: `Compliant: Net quantity declared as '${netQtyStr}' using permissible standard unit.`
      });
      passedCount++;
    } else {
      rules.push({
        ruleId: "RULE_6_1_C",
        ruleName: "Net Quantity & Standard SI Units",
        statutoryReference: "Rule 11 & Rule 13 of Legal Metrology Rules, 2011",
        status: "WARNING",
        detectedValue: netQtyStr,
        requirement: "Standard SI units (kg, g, l, ml, m, cm, N)",
        message: `Unrecognized unit symbol '${rawUnit}'. Verify compliance under Schedule I.`
      });
      warningCount++;
    }

    // -------------------------------------------------------------
    // RULE 5: Rule 6(1)(d) - Month & Year of Mfg / Packing / Import
    // -------------------------------------------------------------
    const mfgDate = (data.mfgDate || "").trim();
    if (!mfgDate) {
      rules.push({
        ruleId: "RULE_6_1_D",
        ruleName: "Month & Year of Manufacture / Packing",
        statutoryReference: "Rule 6(1)(d) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Month and year of manufacture, packing or import (MM/YYYY or Month YYYY)",
        message: "Mandatory declaration missing: Date of manufacture or packing was not found."
      });
      violations.push("Rule 6(1)(d): Missing Month & Year of manufacture or packing.");
    } else {
      rules.push({
        ruleId: "RULE_6_1_D",
        ruleName: "Month & Year of Manufacture / Packing",
        statutoryReference: "Rule 6(1)(d) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: mfgDate,
        requirement: "Month and year format",
        message: `Compliant: Date of packing/mfg declared as '${mfgDate}'.`
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 6: Rule 6(1)(e) - Maximum Retail Price (MRP inclusive of all taxes)
    // -------------------------------------------------------------
    const mrp = (data.mrp || "").trim();
    const hasTaxClause = data.hasInclusiveOfTaxes || /incl(?:usive)?\s*(?:of)?\s*all\s*tax(?:es)?/i.test(mrp + " " + textBlob);

    if (!mrp) {
      rules.push({
        ruleId: "RULE_6_1_E",
        ruleName: "Maximum Retail Price (MRP)",
        statutoryReference: "Rule 6(1)(e) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "MRP in Indian Currency ('Rs.' or '₹') with 'inclusive of all taxes'",
        message: "Mandatory declaration missing: Maximum Retail Price (MRP) not detected."
      });
      violations.push("Rule 6(1)(e): Missing Maximum Retail Price (MRP).");
    } else if (!hasTaxClause) {
      rules.push({
        ruleId: "RULE_6_1_E",
        ruleName: "Maximum Retail Price (MRP)",
        statutoryReference: "Rule 6(1)(e) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: mrp,
        requirement: "MRP must explicitly state 'inclusive of all taxes' or 'incl. of all taxes'",
        message: "Statutory Violation: MRP declared without the mandatory phrase 'inclusive of all taxes'."
      });
      violations.push("Rule 6(1)(e): MRP missing mandatory 'inclusive of all taxes' declaration.");
    } else {
      rules.push({
        ruleId: "RULE_6_1_E",
        ruleName: "Maximum Retail Price (MRP)",
        statutoryReference: "Rule 6(1)(e) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: mrp,
        requirement: "MRP with 'inclusive of all taxes'",
        message: "Compliant: MRP declared with statutory 'inclusive of all taxes' clause."
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 7: Rule 6(1)(n) - Consumer Care Telephone, Email & Address
    // -------------------------------------------------------------
    const carePhone = (data.customerCarePhone || "").trim();
    const careEmail = (data.customerCareEmail || "").trim();
    const careAddr = (data.customerCareAddress || "").trim();

    if (!carePhone && !careEmail && !careAddr) {
      rules.push({
        ruleId: "RULE_6_1_N",
        ruleName: "Consumer Care Redressal Details",
        statutoryReference: "Rule 6(1)(n) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Name, address, telephone number, and email ID of customer care",
        message: "Mandatory declaration missing: No customer care contact details detected."
      });
      violations.push("Rule 6(1)(n): Missing consumer care contact details.");
    } else if (!carePhone || !careEmail) {
      rules.push({
        ruleId: "RULE_6_1_N",
        ruleName: "Consumer Care Redressal Details",
        statutoryReference: "Rule 6(1)(n) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "WARNING",
        detectedValue: `Phone: ${carePhone || "Missing"} | Email: ${careEmail || "Missing"}`,
        requirement: "Both telephone number AND email address required under amended Rule 6(1)(n)",
        message: "Partial declaration: Customer care must provide both telephone number and email address."
      });
      warningCount++;
    } else {
      rules.push({
        ruleId: "RULE_6_1_N",
        ruleName: "Consumer Care Redressal Details",
        statutoryReference: "Rule 6(1)(n) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: `Tel: ${carePhone} | Email: ${careEmail}`,
        requirement: "Consumer telephone and email address",
        message: "Compliant: Both consumer helpline and official email address are provided."
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // RULE 8: Rule 6(1)(m) - Unit Sale Price (USP / Unique Sell Price)
    // -------------------------------------------------------------
    let usp = (data.unitSalePrice || data.usp || "").trim();

    // If not provided in fields, check rawText or textBlob
    if (!usp) {
      const uspMatch = textBlob.match(/(?:u\.?\s*s\.?\s*p\.?|unit\s*sal?e?\s*price|unique\s*sell(?:ing)?\s*price|unit\s*price)\s*[:=-]?\s*(?:₹|rs\.?|inr)?\s*([0-9]+(?:[\.,][0-9]{1,3})?\s*(?:\/|\s*per\s*)\s*[a-zA-Z0-9]+)/i);
      if (uspMatch) {
        usp = uspMatch[0];
      } else {
        const standaloneUsp = textBlob.match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:[\.,][0-9]{1,3})?\s*(?:\/|\s*per\s*)\s*(?:100\s*g|100\s*ml|kg|g|gm|ml|l|ltr|unit|piece|u|n))\b/i);
        if (standaloneUsp) {
          usp = standaloneUsp[0];
        }
      }
    }

    if (!usp) {
      rules.push({
        ruleId: "RULE_6_1_M",
        ruleName: "Unit Sale Price (USP / Unique Sell Price)",
        statutoryReference: "Rule 6(1)(m) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "FAIL",
        detectedValue: "Not Found",
        requirement: "Declaration of Unit Sale Price (USP) in ₹ per standard unit (e.g. ₹/g, ₹/kg, ₹/ml, ₹/unit)",
        message: "Mandatory declaration missing: Unit Sale Price (USP / Unique Sell Price) must be declared on every pre-packaged commodity under Rule 6(1)(m)."
      });
      violations.push("Rule 6(1)(m): Missing mandatory Unit Sale Price (USP / Unique Sell Price) declaration.");
    } else {
      rules.push({
        ruleId: "RULE_6_1_M",
        ruleName: "Unit Sale Price (USP / Unique Sell Price)",
        statutoryReference: "Rule 6(1)(m) of Legal Metrology (Packaged Commodities) Rules, 2011",
        status: "PASS",
        detectedValue: usp,
        requirement: "Unit Sale Price (USP) declared in ₹ per standard unit",
        message: `Compliant: Unit Sale Price (USP) declared as '${usp}'.`
      });
      passedCount++;
    }

    // -------------------------------------------------------------
    // Calculate Overall Compliance Score & Status
    // -------------------------------------------------------------
    const totalRules = 8;
    const score = Math.round((passedCount * 12.5) + (warningCount * 6.25));

    let complianceStatus = "NON_COMPLIANT";
    if (violations.length === 0 && warningCount === 0) {
      complianceStatus = "COMPLIANT";
    } else if (violations.length === 0 && warningCount > 0) {
      complianceStatus = "WARNING";
    } else {
      complianceStatus = "NON_COMPLIANT";
    }

    // -------------------------------------------------------------
    // Section 36 Penalty Assessment
    // -------------------------------------------------------------
    const penalty = {
      applicableClause: "Section 36(1) of the Legal Metrology Act, 2009",
      firstOffenceMax: 25000,
      secondOffenceMax: 50000,
      subsequentOffenceMax: 100000,
      estimatedAmount: violations.length > 0 ? 25000 : 0
    };

    return {
      score,
      complianceStatus,
      violationsCount: violations.length,
      violationsList: violations,
      rules,
      section36Penalty: penalty
    };
  }
}

module.exports = RuleEngine;

