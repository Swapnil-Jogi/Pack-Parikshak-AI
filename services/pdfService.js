const PDFDocument = require("pdfkit");

class PdfService {
  /**
   * Generates a styled Legal Metrology Inspection Audit Report PDF.
   * @param {Object} inspection - Inspection document
   * @param {Object} officer - Officer or User object
   * @returns {Promise<Buffer>} PDF Buffer
   */
  static generateReportBuffer(inspection, officer = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: "A4",
          info: {
            Title: `Legal Metrology Audit Report - ${inspection.inspectionNumber}`,
            Author: "Pack-Parikshak AI - Directorate of Legal Metrology",
            Subject: "Statutory Packaged Commodities Compliance Audit"
          }
        });

        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", (err) => reject(err));

        const pageWidth = doc.page.width - 80;

        // Top Tricolor Accent Bar
        doc.rect(40, 20, pageWidth / 3, 5).fill("#f97316"); // Saffron
        doc.rect(40 + pageWidth / 3, 20, pageWidth / 3, 5).fill("#cbd5e1"); // White/Slate
        doc.rect(40 + (pageWidth * 2) / 3, 20, pageWidth / 3, 5).fill("#15803d"); // Green

        // Header Title
        doc.moveDown(1.2);
        doc.fillColor("#0f2e5a").fontSize(15).font("Helvetica-Bold").text("GOVERNMENT OF INDIA", { align: "center" });
        doc.fillColor("#1e3a8a").fontSize(13).text("DIRECTORATE OF LEGAL METROLOGY", { align: "center" });
        doc.fillColor("#475569").fontSize(9).font("Helvetica").text("Department of Consumer Affairs | Packaged Commodities Inspection Wing", { align: "center" });
        doc.fillColor("#dc2626").fontSize(11).font("Helvetica-Bold").text("STATUTORY COMPLIANCE AUDIT REPORT", { align: "center" });

        doc.moveDown(0.5);
        doc.strokeColor("#0f2e5a").lineWidth(1.5).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
        doc.moveDown(0.6);

        // Metadata Grid (Inspection ID, Date, Status, Score)
        const metaY = doc.y;
        doc.rect(40, metaY, pageWidth, 55).fillAndStroke("#f8fafc", "#cbd5e1");

        doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold");
        doc.text("Inspection ID:", 50, metaY + 8);
        doc.font("Helvetica").text(inspection.inspectionNumber, 125, metaY + 8);

        doc.font("Helvetica-Bold").text("Date & Time:", 50, metaY + 22);
        doc.font("Helvetica").text(new Date(inspection.createdAt).toLocaleString("en-IN"), 125, metaY + 22);

        doc.font("Helvetica-Bold").text("Location:", 50, metaY + 36);
        doc.font("Helvetica").text(`${inspection.location.district || "Central"}, ${inspection.location.state || "Delhi"}`, 125, metaY + 36);

        // Right side of metadata box
        const rightCol = 320;
        doc.font("Helvetica-Bold").text("Overall Status:", rightCol, metaY + 8);
        const statusColor = inspection.complianceStatus === "COMPLIANT" ? "#16a34a" : inspection.complianceStatus === "WARNING" ? "#d97706" : "#dc2626";
        doc.fillColor(statusColor).font("Helvetica-Bold").text(inspection.complianceStatus, rightCol + 85, metaY + 8);

        doc.fillColor("#0f172a").font("Helvetica-Bold").text("Compliance Score:", rightCol, metaY + 22);
        doc.fillColor(statusColor).font("Helvetica-Bold").text(`${inspection.complianceScore}% / 100%`, rightCol + 85, metaY + 22);

        doc.fillColor("#0f172a").font("Helvetica-Bold").text("Audited By:", rightCol, metaY + 36);
        doc.font("Helvetica").text(officer ? `${officer.name} (${officer.badgeId || "Officer"})` : "Pack-Parikshak AI Automated Inspection", rightCol + 85, metaY + 36);

        doc.y = metaY + 65;

        // Commodity Details Section
        doc.fillColor("#0f2e5a").fontSize(11).font("Helvetica-Bold").text("1. Commodity & Label Declarations", 40, doc.y);
        doc.moveDown(0.3);

        const data = inspection.extractedData || {};
        const items = [
          ["Commodity Generic Name:", data.commodityName || "Not Declared"],
          ["Declared Net Quantity:", data.netQuantity || "Not Declared"],
          ["Maximum Retail Price (MRP):", data.mrp || "Not Declared"],
          ["Unit Sale Price (USP):", data.unitSalePrice || "Not Declared"],
          ["Date of Mfg / Packing:", data.mfgDate || "Not Declared"],
          ["Country of Origin:", data.countryOfOrigin || "Not Declared"],
          ["Product / Factory Address:", data.productAddress || "Not Declared"],
          ["Manufacturer / Packer:", data.manufacturer || "Not Declared"],
          ["Customer Care Details:", `${data.customerCarePhone || ""} ${data.customerCareEmail || ""}`.trim() || "Not Declared"],
          ["Batch / Lot Number:", data.batchNo || "Not Declared"]
        ];

        let currY = doc.y;
        items.forEach(([label, val]) => {
          doc.fillColor("#334155").fontSize(8.5).font("Helvetica-Bold").text(label, 45, currY, { width: 145 });
          doc.fillColor("#0f172a").font("Helvetica").text(val, 195, currY, { width: pageWidth - 160 });
          currY = doc.y + 3;
        });

        doc.y = currY + 6;

        // Statutory Verification Checklist Table (All 8 Rules)
        doc.fillColor("#0f2e5a").fontSize(11).font("Helvetica-Bold").text("2. Statutory Rule Checklist (Legal Metrology Rules, 2011)", 40, doc.y);
        doc.moveDown(0.4);

        // Table Header
        const tableY = doc.y;
        doc.rect(40, tableY, pageWidth, 18).fill("#0f2e5a");
        doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
        doc.text("Rule / Mandate", 45, tableY + 5, { width: 140 });
        doc.text("Detected Value", 190, tableY + 5, { width: 130 });
        doc.text("Evaluation Remark", 325, tableY + 5, { width: 130 });
        doc.text("Status", 465, tableY + 5, { width: 50, align: "center" });

        let rowY = tableY + 18;
        const rules = inspection.rulesEvaluation || [];

        rules.forEach((r, idx) => {
          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          doc.rect(40, rowY, pageWidth, 24).fill(bg);

          doc.fillColor("#1e293b").fontSize(7.5).font("Helvetica-Bold");
          doc.text(r.ruleName, 45, rowY + 3, { width: 140 });
          doc.fillColor("#64748b").fontSize(6.5).font("Helvetica").text(r.statutoryReference, 45, rowY + 12, { width: 140 });

          doc.fillColor("#1e293b").fontSize(7.5).font("Helvetica");
          const detVal = r.detectedValue ? r.detectedValue.substring(0, 35) : "-";
          doc.text(detVal, 190, rowY + 6, { width: 130 });

          const msg = r.message ? r.message.substring(0, 45) : "-";
          doc.text(msg, 325, rowY + 6, { width: 130 });

          const statusBadgeColor = r.status === "PASS" ? "#16a34a" : r.status === "WARNING" ? "#d97706" : "#dc2626";
          doc.fillColor(statusBadgeColor).font("Helvetica-Bold").text(r.status, 465, rowY + 6, { width: 50, align: "center" });

          rowY += 24;
        });

        doc.y = rowY + 8;

        // Section 36 Penalty Provision Box
        if (inspection.complianceStatus !== "COMPLIANT") {
          const penaltyY = doc.y;
          doc.rect(40, penaltyY, pageWidth, 42).fillAndStroke("#fef2f2", "#f87171");
          doc.fillColor("#991b1b").fontSize(8.5).font("Helvetica-Bold").text("STATUTORY PENALTY CLAUSE (SECTION 36)", 48, penaltyY + 6);
          doc.fillColor("#7f1d1d").fontSize(7.5).font("Helvetica").text(
            "Under Section 36(1) of the Legal Metrology Act, 2009, whoever manufactures, packs, imports, sells, distributes, or delivers any packaged commodity not conforming to the declarations shall be punished with a fine up to Rs. 25,000 for the first offence, Rs. 50,000 for the second offence, and up to Rs. 1,00,000 or imprisonment for subsequent offences.",
            48,
            penaltyY + 18,
            { width: pageWidth - 16 }
          );
          doc.y = penaltyY + 48;
        }

        // Footer / Stamp
        doc.moveDown(0.8);
        const footerY = doc.y;
        doc.rect(40, footerY, 150, 40).stroke("#cbd5e1");
        doc.fillColor("#475569").fontSize(7).font("Helvetica").text("OFFICIAL VERIFICATION SEAL", 45, footerY + 5);
        doc.fillColor("#0f2e5a").fontSize(6.5).font("Helvetica-Bold").text("PACK-PARIKSHAK AI", 45, footerY + 16);
        doc.text("DIRECTORATE OF LEGAL METROLOGY", 45, footerY + 25);

        doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Digitally authenticated report generated under Rule 6 of Legal Metrology (Packaged Commodities) Rules, 2011.", 210, footerY + 8, { width: 290 });
        doc.text(`Report Verification Hash: ${Buffer.from(inspection.inspectionNumber).toString("base64")}`, 210, footerY + 24);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = PdfService;

