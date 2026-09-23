const Inspection = require("../models/Inspection");
const PdfService = require("../services/pdfService");

// Download Styled PDF Audit Report
exports.downloadPdf = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) {
      return res.status(404).send("Inspection not found");
    }

    const pdfBuffer = await PdfService.generateReportBuffer(inspection, req.user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Legal_Metrology_Audit_${inspection.inspectionNumber}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[Report] Error generating PDF:", err);
    res.status(500).send("Failed to generate PDF report");
  }
};

// Export CSV of Inspections
exports.exportCsv = async (req, res) => {
  try {
    const inspections = await Inspection.find().sort({ createdAt: -1 });

    const headers = [
      "Inspection ID",
      "Date",
      "Product Name",
      "Brand",
      "Category",
      "Net Quantity",
      "MRP",
      "Taxes Clause",
      "Mfg Date",
      "Manufacturer",
      "Country of Origin",
      "Consumer Care",
      "Compliance Status",
      "Score",
      "Violations Count",
      "Violations Summary",
      "State",
      "Review Status"
    ];

    const rows = inspections.map((i) => {
      const d = i.extractedData || {};
      return [
        `"${i.inspectionNumber}"`,
        `"${new Date(i.createdAt).toISOString()}"`,
        `"${(i.productName || "").replace(/"/g, '""')}"`,
        `"${(i.brand || "").replace(/"/g, '""')}"`,
        `"${i.category}"`,
        `"${(d.netQuantity || "").replace(/"/g, '""')}"`,
        `"${(d.mrp || "").replace(/"/g, '""')}"`,
        `"${d.hasInclusiveOfTaxes ? "YES" : "NO"}"`,
        `"${(d.mfgDate || "").replace(/"/g, '""')}"`,
        `"${(d.manufacturer || "").replace(/"/g, '""')}"`,
        `"${(d.countryOfOrigin || "").replace(/"/g, '""')}"`,
        `"${((d.customerCarePhone || "") + " " + (d.customerCareEmail || "")).trim().replace(/"/g, '""')}"`,
        `"${i.complianceStatus}"`,
        `"${i.complianceScore}"`,
        `"${i.violationsCount}"`,
        `"${(i.violationsList || []).join("; ").replace(/"/g, '""')}"`,
        `"${i.location ? i.location.state : "Delhi"}"`,
        `"${i.officerReview ? i.officerReview.status : "PENDING"}"`
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Pack_Parikshak_Inspections_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error("[Report] Error exporting CSV:", err);
    res.status(500).send("Failed to export CSV");
  }
};

