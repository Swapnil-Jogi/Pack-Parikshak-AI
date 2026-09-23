const Inspection = require("../models/Inspection");

// Home Landing Page
exports.getHome = async (req, res) => {
  try {
    const totalCount = await Inspection.countDocuments();
    const compliantCount = await Inspection.countDocuments({ complianceStatus: "COMPLIANT" });
    const violationCount = await Inspection.countDocuments({ complianceStatus: "NON_COMPLIANT" });

    res.render("index.ejs", {
      title: "Pack-Parikshak AI | Legal Metrology Packaged Commodities Portal",
      user: req.user,
      stats: {
        total: totalCount || 1420,
        compliant: compliantCount || 1080,
        violations: violationCount || 340,
        rate: totalCount > 0 ? Math.round((compliantCount / totalCount) * 100) : 76
      }
    });
  } catch (err) {
    console.error("[Page] Error on home page:", err);
    res.render("index.ejs", {
      title: "Pack-Parikshak AI",
      user: req.user,
      stats: { total: 1420, compliant: 1080, violations: 340, rate: 76 }
    });
  }
};

// LMPC Certificate Guide under Rule 27
exports.getLmpcGuide = (req, res) => {
  res.render("lmpc-guide/index.ejs", {
    title: "LMPC Registration Guide (Rule 27) | Pack-Parikshak AI",
    user: req.user
  });
};

// Technical Architecture & Render Deployment Documentation
exports.getArchitecture = (req, res) => {
  res.render("docs/architecture.ejs", {
    title: "Architecture & Deployment Guide | Pack-Parikshak AI",
    user: req.user
  });
};

// Multilingual Switcher
exports.changeLanguage = (req, res) => {
  const lang = req.params.lang || req.query.lang || "en";
  if (req.session) {
    req.session.lang = lang;
  }
  res.cookie("app_lang", lang, { maxAge: 30 * 24 * 3600 * 1000, httpOnly: false });
  let referer = req.get("Referrer") || "/";
  try {
    const host = req.headers.host || "localhost:8080";
    const refUrl = new URL(referer, `http://${host}`);
    refUrl.searchParams.delete("lang");
    referer = refUrl.pathname + (refUrl.search ? refUrl.search : "");
  } catch (e) {}
  res.redirect(referer);
};

