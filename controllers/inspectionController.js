const path = require("path");
const fs = require("fs");
const Inspection = require("../models/Inspection");
const ocrService = require("../services/ocrService");
const RuleEngine = require("../services/ruleEngine");
const { uploadToCloudinaryOrLocal } = require("../config/cloudinary");

// Render Upload & Sample Selection Page
exports.getNewScan = (req, res) => {
  res.render("sandbox/index.ejs", {
    title: "Verify Package | Pack-Parikshak AI",
    errorMessage: req.session.errorMessage || null
  });
  req.session.errorMessage = null;
};

// Process Upload or Sample Selection
exports.postUploadScan = async (req, res) => {
  try {
    let localPath = "";
    let imageUrl = "";
    let sampleType = req.body.sampleType;

    // Check if user selected one of the instant pre-made samples
    if (sampleType === "wheat_flour") {
      localPath = path.join(__dirname, "..", "public", "samples", "compliant_wheat_flour.png");
      imageUrl = "/samples/compliant_wheat_flour.png";
    } else if (sampleType === "snack_pack") {
      localPath = path.join(__dirname, "..", "public", "samples", "violating_snack_pack.png");
      imageUrl = "/samples/violating_snack_pack.png";
    } else if (req.file) {
      localPath = req.file.path;
      imageUrl = `/uploads/${req.file.filename}`;
    } else {
      if (req.session) {
        req.session.errorMessage = "Please upload an image file or choose a sample packaging label.";
      }
      return res.redirect("/inspections/new");
    }

    console.log(`[Inspection] Processing image through OCR Engine: ${localPath} (sampleType: ${sampleType || "custom"})`);
    const ocrResult = await ocrService.processImage(localPath, sampleType);

    // Run Statutory Rule Verification Engine
    const evaluation = RuleEngine.evaluate(ocrResult.structured, ocrResult.raw_text);

    // Create Inspection record in MongoDB
    const inspection = new Inspection({
      user: req.user ? req.user._id : null,
      productName: ocrResult.structured.commodityName || req.body.productName || "Packaged Commodity",
      brand: req.body.brand || "Commercial Brand",
      category: req.body.category || "Food & Groceries",
      imageUrl: imageUrl,
      localImagePath: localPath,
      imageDims: ocrResult.image_dims || { width: 800, height: 600 },
      ocrBoxes: ocrResult.boxes || [],
      rawText: ocrResult.raw_text || "",
      extractedData: ocrResult.structured,
      rulesEvaluation: evaluation.rules,
      complianceStatus: evaluation.complianceStatus,
      complianceScore: evaluation.score,
      violationsCount: evaluation.violationsCount,
      violationsList: evaluation.violationsList,
      section36Penalty: evaluation.section36Penalty,
      location: {
        state: req.body.state || (req.user ? req.user.state : "Delhi"),
        district: req.body.district || "Central",
        pincode: req.body.pincode || "110001"
      }
    });

    await inspection.save();
    console.log(`[Inspection] Saved new inspection record: ${inspection.inspectionNumber} (${inspection.complianceStatus})`);

    // Non-blocking Cloudinary sync if configured
    if (req.file) {
      uploadToCloudinaryOrLocal(req.file.path, req.file.filename).then((cRes) => {
        if (cRes && cRes.isCloud) {
          inspection.imageUrl = cRes.url;
          inspection.save().catch(() => {});
        }
      }).catch(() => {});
    }

    res.redirect(`/inspections/${inspection._id}/sandbox`);
  } catch (error) {
    console.error("[Inspection] Upload & OCR failed:", error);
    if (req.session) {
      req.session.errorMessage = `OCR processing failed: ${error.message}`;
    }
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.redirect("/inspections/new");
  }
};

// Render Interactive OCR Sandbox Canvas
exports.getSandbox = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) {
      return res.status(404).render("errors/404.ejs", { title: "Inspection Not Found", message: "The requested inspection record could not be found." });
    }

    res.render("sandbox/inspect.ejs", {
      title: `OCR Sandbox: ${inspection.inspectionNumber} | Pack-Parikshak AI`,
      inspection,
      user: req.user
    });
  } catch (err) {
    console.error("[Inspection] Error opening sandbox:", err);
    res.redirect("/inspections/new");
  }
};

// AJAX/API: Update manual corrections and re-evaluate compliance live
exports.postUpdateCorrections = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id);
    if (!inspection) {
      return res.status(404).json({ success: false, error: "Inspection not found" });
    }

    const corrected = req.body;
    // Merge into extractedData
    const updatedData = {
      ...inspection.extractedData.toObject(),
      ...corrected
    };

    // If mrp was updated with text, update mrpNumeric and hasInclusiveOfTaxes
    if (corrected.mrp) {
      const numMatch = corrected.mrp.match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
      if (numMatch) {
        updatedData.mrpNumeric = parseFloat(numMatch[1].replace(",", "."));
      }
    }
    if (typeof corrected.hasInclusiveOfTaxes !== "undefined") {
      updatedData.hasInclusiveOfTaxes = Boolean(corrected.hasInclusiveOfTaxes);
    }

    // Re-evaluate rules using updated data
    const evaluation = RuleEngine.evaluate(updatedData, inspection.rawText);

    // Save changes
    inspection.extractedData = updatedData;
    inspection.manualCorrections = {
      ...inspection.manualCorrections,
      ...corrected,
      updatedAt: new Date(),
      updatedBy: req.user ? req.user.name : "Anonymous"
    };
    inspection.rulesEvaluation = evaluation.rules;
    inspection.complianceStatus = evaluation.complianceStatus;
    inspection.complianceScore = evaluation.score;
    inspection.violationsCount = evaluation.violationsCount;
    inspection.violationsList = evaluation.violationsList;
    inspection.section36Penalty = evaluation.section36Penalty;

    await inspection.save();

    return res.json({
      success: true,
      message: "Rules re-verified successfully!",
      complianceStatus: inspection.complianceStatus,
      complianceScore: inspection.complianceScore,
      violationsCount: inspection.violationsCount,
      violationsList: inspection.violationsList,
      rules: inspection.rulesEvaluation,
      section36Penalty: inspection.section36Penalty
    });
  } catch (err) {
    console.error("[Inspection] Error updating corrections:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Uploaded Images / Scans Dashboard (Accessible to both Consumers and Officers)
exports.getUserDashboard = async (req, res) => {
  try {
    const isOfficer = Boolean(req.user && req.user.role === "officer");
    const filter = req.query.filter || "my";

    let query = {};
    if (req.user) {
      if (isOfficer && filter === "all") {
        query = {};
      } else {
        query = { user: req.user._id };
      }
    }

    let inspections = await Inspection.find(query).sort({ createdAt: -1 }).limit(40);

    // If an officer hasn't uploaded personal scans under this specific account ID yet,
    // load recent repository scans so they can see images and sample package audits immediately
    let showingAllFallback = false;
    if (isOfficer && inspections.length === 0 && filter === "my") {
      inspections = await Inspection.find().sort({ createdAt: -1 }).limit(30);
      showingAllFallback = true;
    }

    const totalScans = inspections.length;
    const compliantCount = inspections.filter((i) => i.complianceStatus === "COMPLIANT").length;
    const warningCount = inspections.filter((i) => i.complianceStatus === "WARNING").length;
    const violationCount = inspections.filter((i) => i.complianceStatus === "NON_COMPLIANT").length;
    const avgScore = totalScans > 0 ? Math.round(inspections.reduce((sum, i) => sum + i.complianceScore, 0) / totalScans) : 0;

    res.render("dashboard/user.ejs", {
      title: (isOfficer ? "Officer Scans Dashboard" : "Consumer Compliance Portal") + " | Pack-Parikshak AI",
      user: req.user,
      isOfficer,
      currentFilter: filter,
      showingAllFallback,
      inspections,
      stats: {
        totalScans,
        compliantCount,
        warningCount,
        violationCount,
        avgScore
      }
    });
  } catch (err) {
    console.error("[Inspection] Error loading dashboard:", err);
    res.redirect("/");
  }
};

// Consumer Raise Complaint against Packaged Commodity
exports.postRaiseComplaint = async (req, res) => {
  try {
    const inspectionId = req.params.id;

    // Enforce that officers cannot raise consumer complaints
    if (req.user && req.user.role === "officer") {
      req.flash("error_msg", "Officers cannot file consumer complaints. Use Officer Notice issuance tools.");
      return res.redirect("/dashboard");
    }

    const inspection = await Inspection.findById(inspectionId);
    if (!inspection) {
      req.flash("error_msg", "Inspection record not found.");
      return res.redirect("/dashboard");
    }

    // Check if complaint is already filed
    if (inspection.complaint && inspection.complaint.isFiled) {
      req.flash("error_msg", `A complaint has already been submitted for this package (Tracking #${inspection.complaint.complaintNumber}).`);
      return res.redirect("/dashboard");
    }

    // Generate tracking number CMP-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    const complaintNumber = `CMP-${dateStr}-${rand}`;

    const reason = (req.body.reason || "Statutory Legal Metrology Non-Compliance").trim();
    const description = (req.body.description || "Consumer reported packaged commodity non-compliance.").trim();
    const phone = (req.body.phone || (req.user ? req.user.phone : "") || "").trim();

    inspection.complaint = {
      isFiled: true,
      complaintNumber,
      filedBy: req.user ? req.user._id : null,
      consumerName: req.user ? req.user.name : "Consumer",
      consumerEmail: req.user ? req.user.email : "consumer@citizen.gov.in",
      consumerPhone: phone,
      reason,
      description,
      filedAt: new Date(),
      status: "PENDING"
    };

    if (!inspection.officerReview) {
      inspection.officerReview = {};
    }
    inspection.officerReview.status = "INVESTIGATING";

    await inspection.save();

    console.log(`[Complaint] Lodged new complaint #${complaintNumber} for inspection ${inspection.inspectionNumber}`);

    if (req.xhr || (req.headers["accept"] && req.headers["accept"].includes("json"))) {
      return res.json({
        success: true,
        message: `Complaint #${complaintNumber} successfully lodged with Legal Metrology Enforcement Division!`,
        complaint: inspection.complaint
      });
    }

    req.flash("success_msg", `Complaint #${complaintNumber} successfully lodged! An enforcement officer has been alerted for priority inspection.`);
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("[Inspection] Error raising complaint:", err);
    if (req.xhr || (req.headers["accept"] && req.headers["accept"].includes("json"))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash("error_msg", "Failed to submit complaint: " + err.message);
    res.redirect("/dashboard");
  }
};


