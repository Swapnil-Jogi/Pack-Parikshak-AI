const Inspection = require("../models/Inspection");
const Notice = require("../models/Notice");
const emailService = require("../services/emailService");
const PdfService = require("../services/pdfService");

// Render Officer Command Hub
exports.getDashboard = async (req, res) => {
  try {
    const inspections = await Inspection.find().sort({ createdAt: -1 });

    const totalInspections = inspections.length;
    const compliantCount = inspections.filter((i) => i.complianceStatus === "COMPLIANT").length;
    const warningCount = inspections.filter((i) => i.complianceStatus === "WARNING").length;
    const violationCount = inspections.filter((i) => i.complianceStatus === "NON_COMPLIANT").length;

    // Top violations breakdown
    const violationTally = {
      "Rule 6(1)(e): Missing 'Incl. of Taxes'": 0,
      "Rule 13: Illegal Unit (e.g. gms)": 0,
      "Rule 6(1)(aa): Missing Origin": 0,
      "Rule 6(1)(n): Incomplete Customer Care": 0,
      "Rule 6(1)(d): Missing Mfg/Packing Date": 0,
      "Rule 7: Font Size Below Minimum": 0,
      "Rule 6(1)(a): Incomplete Manufacturer": 0
    };

    inspections.forEach((insp) => {
      (insp.violationsList || []).forEach((v) => {
        if (/tax/i.test(v)) violationTally["Rule 6(1)(e): Missing 'Incl. of Taxes'"]++;
        else if (/rule 13|unit|abbreviation/i.test(v)) violationTally["Rule 13: Illegal Unit (e.g. gms)"]++;
        else if (/origin/i.test(v)) violationTally["Rule 6(1)(aa): Missing Origin"]++;
        else if (/care|contact/i.test(v)) violationTally["Rule 6(1)(n): Incomplete Customer Care"]++;
        else if (/mfg|month|year/i.test(v)) violationTally["Rule 6(1)(d): Missing Mfg/Packing Date"]++;
        else if (/font|prominence/i.test(v)) violationTally["Rule 7: Font Size Below Minimum"]++;
        else if (/manufacturer/i.test(v)) violationTally["Rule 6(1)(a): Incomplete Manufacturer"]++;
      });
    });

    // Regional Heatmap aggregation
    const stateHeatmap = {};
    inspections.forEach((insp) => {
      const st = (insp.location && insp.location.state) ? insp.location.state : "Delhi";
      if (!stateHeatmap[st]) {
        stateHeatmap[st] = { total: 0, violations: 0, compliant: 0 };
      }
      stateHeatmap[st].total++;
      if (insp.complianceStatus === "NON_COMPLIANT") {
        stateHeatmap[st].violations++;
      } else if (insp.complianceStatus === "COMPLIANT") {
        stateHeatmap[st].compliant++;
      }
    });

    // Transform heatmap into array
    const heatmapList = Object.keys(stateHeatmap).map((st) => ({
      state: st,
      total: stateHeatmap[st].total,
      violations: stateHeatmap[st].violations,
      compliant: stateHeatmap[st].compliant,
      violationRate: Math.round((stateHeatmap[st].violations / stateHeatmap[st].total) * 100)
    })).sort((a, b) => b.violations - a.violations);

    // Official inspection queue (pending review or violations)
    const queue = inspections.filter((i) => i.officerReview.status !== "RESOLVED" && i.officerReview.status !== "DISMISSED");

    // Total estimated fines assessed
    const totalFines = inspections
      .filter((i) => i.complianceStatus === "NON_COMPLIANT")
      .reduce((sum, i) => sum + (i.section36Penalty ? i.section36Penalty.estimatedAmount : 25000), 0);

    // Recent Notices
    const recentNotices = await Notice.find().sort({ createdAt: -1 }).limit(10).populate("inspection");

    res.render("dashboard/officer.ejs", {
      title: "Enforcement Officer Command Center | Pack-Parikshak AI",
      user: req.user,
      inspections,
      queue,
      recentNotices,
      stats: {
        totalInspections,
        compliantCount,
        warningCount,
        violationCount,
        totalFines,
        complianceRate: totalInspections > 0 ? Math.round((compliantCount / totalInspections) * 100) : 100
      },
      chartData: {
        compliancePie: [compliantCount, violationCount, warningCount],
        violationsLabels: Object.keys(violationTally),
        violationsCounts: Object.values(violationTally)
      },
      heatmapList
    });
  } catch (err) {
    console.error("[Officer] Error loading dashboard:", err);
    res.redirect("/");
  }
};

// Issue Section 36 Warning / Show-Cause Notice
exports.postIssueNotice = async (req, res) => {
  try {
    const { inspectionId, noticeType, recipientName, recipientEmail, recipientAddress, offenceLevel, hearingDays, customNotes } = req.body;

    const inspection = await Inspection.findById(inspectionId);
    if (!inspection) {
      return res.status(404).json({ success: false, error: "Inspection record not found" });
    }

    const isWarning = noticeType === "WARNING";
    const deadline = parseInt(hearingDays || "15", 10);

    // Determine statutory fine under Section 36(1)
    let penalty = 25000;
    if (offenceLevel === "second") {
      penalty = 50000;
    } else if (offenceLevel === "subsequent") {
      penalty = 100000;
    }

    const violations = inspection.violationsList && inspection.violationsList.length > 0
      ? inspection.violationsList
      : ["Non-compliance with mandatory packaging declarations under Legal Metrology Rules, 2011"];

    let subject = "";
    let noticeBody = "";

    if (isWarning) {
      subject = `Pre-Enforcement Statutory Warning Notice: Declaration Non-Compliance on '${inspection.productName}' [${inspection.inspectionNumber}]`;
      noticeBody = `
Whereas an official statutory verification was conducted by the Legal Metrology Enforcement Wing regarding the packaged commodity '${inspection.productName}' (${inspection.brand}).
Upon statutory analysis, the packaging was identified as non-compliant with the Legal Metrology (Packaged Commodities) Rules, 2011 on the following counts:
${violations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

${customNotes ? `Additional Officer Advisory Remarks:\n${customNotes}\n` : ""}
You are hereby issued this formal Statutory Warning Advisory and granted a compliance rectification deadline of ${deadline} days to remedy the non-compliant packaging declarations across retail supply chains and submit confirmation of compliance.

IMPORTANT STATUTORY ESCALATION WARNING: Failure to remedy the identified violations or submit proof of rectification within ${deadline} days shall result in the immediate and automatic issuance of a Formal Show-Cause Notice under Section 36(1) of the Legal Metrology Act, 2009 with statutory penalties up to Rs. ${penalty.toLocaleString("en-IN")}, compounding proceedings, and prosecution before the competent Judicial Magistrate.
      `.trim();
    } else {
      subject = `Show-Cause Notice under Section 36(1) - Packaged Commodity Violations [${inspection.inspectionNumber}]`;
      noticeBody = `
Whereas an inspection was conducted by the Legal Metrology Enforcement Wing regarding the packaged commodity '${inspection.productName}' (${inspection.brand}).
Upon statutory analysis, the package was determined to violate the Legal Metrology (Packaged Commodities) Rules, 2011 on the following counts:
${violations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

${customNotes ? `Additional Enforcement Notes:\n${customNotes}\n` : ""}
You are hereby called upon to show cause within ${deadline} days from the receipt of this notice as to why penal proceedings under Section 36(1) of the Legal Metrology Act, 2009 (penalty up to Rs. ${penalty.toLocaleString("en-IN")}) should not be initiated against your enterprise.
Failure to reply within the stipulated time shall result in immediate compounding proceedings or filing of an official complaint before the Judicial Magistrate.
      `.trim();
    }

    const notice = new Notice({
      inspection: inspection._id,
      issuedBy: req.user ? req.user._id : null,
      noticeType: isWarning ? "WARNING" : "SHOW_CAUSE",
      recipientName: recipientName || inspection.extractedData.manufacturer || "Manufacturer / Packer",
      recipientEmail: recipientEmail || "compliance@packer.com",
      recipientAddress: recipientAddress || inspection.extractedData.manufacturer || "",
      penaltyAmount: isWarning ? 0 : penalty,
      potentialPenaltyExposure: penalty,
      violationsSummary: violations,
      noticeSubject: subject,
      noticeBody: noticeBody,
      hearingDeadlineDays: deadline,
      rectificationDeadlineDays: deadline,
      emailStatus: "PENDING"
    });

    await notice.save();

    // Generate PDF Audit report as attachment
    let pdfBuffer = null;
    try {
      pdfBuffer = await PdfService.generateReportBuffer(inspection, req.user);
    } catch (pdfErr) {
      console.warn("[Officer] Could not generate PDF attachment for notice:", pdfErr.message);
    }

    // Send email via Nodemailer
    const emailResult = await emailService.sendNoticeEmail(notice, inspection, pdfBuffer);

    notice.emailStatus = emailResult.success ? "SENT" : "FAILED";
    notice.emailSentAt = new Date();
    notice.emailMessageId = emailResult.messageId || "";
    await notice.save();

    // Update inspection review status
    inspection.officerReview.status = isWarning ? "WARNING_ISSUED" : "NOTICE_ISSUED";
    inspection.officerReview.reviewedBy = req.user ? req.user._id : null;
    inspection.officerReview.reviewedAt = new Date();
    inspection.officerReview.officerNotes = isWarning
      ? `Statutory Warning Notice ${notice.noticeNumber} dispatched with ${deadline}-day rectification deadline. Potential liability if unrectified: Rs. ${penalty}. ${customNotes || ""}`
      : `Official Show-Cause Notice ${notice.noticeNumber} issued. Penalty assessed: Rs. ${penalty}. ${customNotes || ""}`;
    inspection.notices.push(notice._id);
    await inspection.save();

    return res.json({
      success: true,
      message: `${isWarning ? 'Statutory Warning Notice' : 'Official Notice'} ${notice.noticeNumber} issued successfully!`,
      notice,
      emailSent: emailResult.success,
      previewUrl: emailResult.previewUrl
    });
  } catch (err) {
    console.error("[Officer] Error issuing notice:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update Officer Review Status
exports.postUpdateReviewStatus = async (req, res) => {
  try {
    const { inspectionId, status, officerNotes } = req.body;
    const inspection = await Inspection.findById(inspectionId);
    if (!inspection) {
      return res.status(404).json({ success: false, error: "Inspection not found" });
    }

    inspection.officerReview.status = status || "INVESTIGATING";
    inspection.officerReview.reviewedBy = req.user ? req.user._id : null;
    inspection.officerReview.reviewedAt = new Date();
    if (officerNotes) {
      inspection.officerReview.officerNotes = officerNotes;
    }
    await inspection.save();

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (err) {
    console.error("[Officer] Error updating status:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

