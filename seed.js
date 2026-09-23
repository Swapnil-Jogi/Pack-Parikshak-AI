require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Inspection = require("./models/Inspection");
const Notice = require("./models/Notice");
const RuleEngine = require("./services/ruleEngine");

const seedData = async () => {
  try {
    const connUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pack_parikshak";
    await mongoose.connect(connUri);
    console.log("[Seed] Connected to MongoDB.");

    // Clean existing records
    await User.deleteMany({});
    await Inspection.deleteMany({});
    await Notice.deleteMany({});
    console.log("[Seed] Cleared existing data.");

    // 1. Create Default Users
    const officer = new User({
      name: "Inspector Ramesh Sharma",
      email: "officer@delhi.lm.gov.in",
      password: "Password123!",
      role: "officer",
      badgeId: "DL-LM-0842",
      department: "Legal Metrology Enforcement Wing, Government of NCT of Delhi",
      state: "Delhi",
      organization: "Directorate of Legal Metrology",
      phone: "+91 98112 34567"
    });
    await officer.save();

    const consumer = new User({
      name: "Aakash Verma",
      email: "consumer@example.com",
      password: "Password123!",
      role: "user",
      department: "Consumer / Packer",
      state: "Delhi",
      organization: "Verma Retail Foods Pvt Ltd",
      phone: "+91 98765 43210"
    });
    await consumer.save();
    console.log("[Seed] Created Officer & Consumer demo accounts.");

    // 2. Realistic Packaging Inspection Data Across States
    const sampleInspections = [
      {
        productName: "Supreme Quality Sharbati Wheat Flour",
        brand: "Kisan Agro",
        category: "Food & Groceries",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Haryana",
        data: {
          commodityName: "Whole Wheat Flour",
          netQuantity: "5 kg",
          declaredQuantity: "5",
          unit: "kg",
          mrp: "Rs. 285.00 (Incl. of all taxes)",
          mrpNumeric: 285.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 57.00 / kg",
          mfgDate: "04/2026",
          manufacturer: "Kisan Agro Industries Pvt Ltd, Sector 18, Karnal, Haryana",
          productAddress: "Plot No. 45, Sector 18, Industrial Area, Karnal, Haryana - 132001",
          countryOfOrigin: "India",
          customerCarePhone: "1800-200-8899",
          customerCareEmail: "care@kisanagro.in",
          customerCareAddress: "Sector 18, Karnal, Haryana",
          batchNo: "B-2026-WHT-09",
          estimatedFontHeightMm: 6.2
        }
      },
      {
        productName: "Crunchy Masala Potato Chips",
        brand: "Desi Snackers",
        category: "Food & Groceries",
        imageUrl: "/samples/violating_snack_pack.png",
        state: "Delhi",
        data: {
          commodityName: "Potato Chips",
          netQuantity: "400 gms", // ILLEGAL UNIT Rule 13
          declaredQuantity: "400",
          unit: "gms",
          mrp: "Rs. 60.00", // MISSING TAX CLAUSE Rule 6(1)(e)
          mrpNumeric: 60.0,
          hasInclusiveOfTaxes: false,
          mfgDate: "01/2026",
          manufacturer: "Desi Snackers, Delhi",
          countryOfOrigin: "", // MISSING ORIGIN Rule 6(1)(aa)
          customerCarePhone: "9876543210",
          customerCareEmail: "", // MISSING EMAIL Rule 6(1)(n)
          customerCareAddress: "",
          batchNo: "DS-400-01",
          estimatedFontHeightMm: 3.5
        }
      },
      {
        productName: "Pure Cold Pressed Mustard Oil",
        brand: "Sarson Shuddh",
        category: "Food & Groceries",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Uttar Pradesh",
        data: {
          commodityName: "Mustard Oil",
          netQuantity: "1 L",
          declaredQuantity: "1",
          unit: "L",
          mrp: "Rs. 195.00 (Inclusive of all taxes)",
          mrpNumeric: 195.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 195.00 / L",
          mfgDate: "03/2026",
          manufacturer: "Agro Bio Oils Ltd, Mathura, UP",
          productAddress: "Plot 12, Industrial Area, Mathura, Uttar Pradesh - 281001",
          countryOfOrigin: "India",
          customerCarePhone: "1800-111-9988",
          customerCareEmail: "help@sarsonshuddh.com",
          customerCareAddress: "Industrial Area, Mathura, UP",
          batchNo: "MO-902-UP",
          estimatedFontHeightMm: 6.0
        }
      },
      {
        productName: "Organic Green Tea Leaves",
        brand: "Himalayan Herbal",
        category: "Beverages",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Karnataka",
        data: {
          commodityName: "Green Tea",
          netQuantity: "250 g",
          declaredQuantity: "250",
          unit: "g",
          mrp: "Rs. 320.00 (Incl. of all taxes)",
          mrpNumeric: 320.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 1.28 / g",
          mfgDate: "02/2026",
          manufacturer: "Himalayan Plantations Ltd, Ooty & Bengaluru",
          productAddress: "Estate No. 7, Tea Park, Ooty, Tamil Nadu - 643001",
          countryOfOrigin: "India",
          customerCarePhone: "080-45678901",
          customerCareEmail: "support@himalayanherbal.in",
          customerCareAddress: "MG Road, Bengaluru, Karnataka",
          batchNo: "GT-441-26",
          estimatedFontHeightMm: 4.2
        }
      },
      {
        productName: "Herbal Neem Face Wash",
        brand: "GlowAura",
        category: "Cosmetics & Personal Care",
        imageUrl: "/samples/violating_snack_pack.png",
        state: "Maharashtra",
        data: {
          commodityName: "Face Wash",
          netQuantity: "150 ml",
          declaredQuantity: "150",
          unit: "ml",
          mrp: "Rs. 140.00 Only", // MISSING TAXES
          mrpNumeric: 140.0,
          hasInclusiveOfTaxes: false,
          mfgDate: "01/2026",
          manufacturer: "GlowAura Personal Care, Andheri East, Mumbai",
          countryOfOrigin: "India",
          customerCarePhone: "9820011223",
          customerCareEmail: "",
          customerCareAddress: "Mumbai, Maharashtra",
          batchNo: "GA-FW-102",
          estimatedFontHeightMm: 1.8 // Undersized font
        }
      },
      {
        productName: "Premium Basmati Rice Classic",
        brand: "Royal Heritage",
        category: "Food & Groceries",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Punjab",
        data: {
          commodityName: "Basmati Rice",
          netQuantity: "10 kg",
          declaredQuantity: "10",
          unit: "kg",
          mrp: "Rs. 1,250.00 (Inclusive of all taxes)",
          mrpNumeric: 1250.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 125.00 / kg",
          mfgDate: "04/2026",
          manufacturer: "Heritage Rice Mills Ltd, Amritsar, Punjab",
          productAddress: "GT Road, Near Grain Market, Amritsar, Punjab - 143001",
          countryOfOrigin: "India",
          customerCarePhone: "1800-333-7766",
          customerCareEmail: "care@heritagerice.in",
          customerCareAddress: "Amritsar, Punjab",
          batchNo: "R-B-10KG-26",
          estimatedFontHeightMm: 6.5
        }
      },
      {
        productName: "Imported Dark Chocolate Bar",
        brand: "Alpine Confectionery",
        category: "Food & Groceries",
        imageUrl: "/samples/violating_snack_pack.png",
        state: "Delhi",
        data: {
          commodityName: "Dark Chocolate",
          netQuantity: "100 grams", // NON-STANDARD 'grams' instead of 'g'
          declaredQuantity: "100",
          unit: "grams",
          mrp: "Rs. 250.00 (Inclusive of all taxes)",
          mrpNumeric: 250.0,
          hasInclusiveOfTaxes: true,
          mfgDate: "11/2025",
          manufacturer: "Alpine Swiss Confiserie, Zurich, Switzerland",
          countryOfOrigin: "", // Missing mandatory origin declaration on Indian retail pack
          customerCarePhone: "",
          customerCareEmail: "import@delhiconfect.in",
          customerCareAddress: "Connaught Place, New Delhi",
          batchNo: "CHOC-891",
          estimatedFontHeightMm: 2.5
        }
      },
      {
        productName: "Alphonso Mango Pulp",
        brand: "Konkan Fresh",
        category: "Food & Groceries",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Maharashtra",
        data: {
          commodityName: "Mango Pulp",
          netQuantity: "850 g",
          declaredQuantity: "850",
          unit: "g",
          mrp: "Rs. 220.00 (Inclusive of all taxes)",
          mrpNumeric: 220.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 0.26 / g",
          mfgDate: "03/2026",
          manufacturer: "Konkan Agro Processing Co-op, Ratnagiri, Maharashtra",
          productAddress: "Agro Complex, MIDC Mirjole, Ratnagiri, Maharashtra - 415639",
          countryOfOrigin: "India",
          customerCarePhone: "02352-224466",
          customerCareEmail: "contact@konkanfresh.org",
          customerCareAddress: "Ratnagiri, Maharashtra",
          batchNo: "KF-MP-850",
          estimatedFontHeightMm: 4.5
        }
      },
      {
        productName: "Sparkling Lemon Drink",
        brand: "Citrus Zing",
        category: "Beverages",
        imageUrl: "/samples/violating_snack_pack.png",
        state: "Gujarat",
        data: {
          commodityName: "Carbonated Fruit Drink",
          netQuantity: "750 ml",
          declaredQuantity: "750",
          unit: "ml",
          mrp: "Rs. 45.00 Only", // MISSING TAXES
          mrpNumeric: 45.0,
          hasInclusiveOfTaxes: false,
          mfgDate: "", // MISSING DATE
          manufacturer: "Zing Beverages, Ahmedabad, Gujarat",
          countryOfOrigin: "India",
          customerCarePhone: "1800-444-2211",
          customerCareEmail: "info@citruszing.com",
          customerCareAddress: "Sanand, Ahmedabad, Gujarat",
          batchNo: "CZ-750-G",
          estimatedFontHeightMm: 4.0
        }
      },
      {
        productName: "Refined Sunflower Cooking Oil",
        brand: "Suraj Gold",
        category: "Food & Groceries",
        imageUrl: "/samples/compliant_wheat_flour.png",
        state: "Tamil Nadu",
        data: {
          commodityName: "Sunflower Oil",
          netQuantity: "1 L",
          declaredQuantity: "1",
          unit: "L",
          mrp: "Rs. 175.00 (Inclusive of all taxes)",
          mrpNumeric: 175.0,
          hasInclusiveOfTaxes: true,
          unitSalePrice: "Rs. 175.00 / L",
          mfgDate: "04/2026",
          manufacturer: "Southern Refineries Ltd, Madurai, Tamil Nadu",
          productAddress: "Kappalur Industrial Estate, Madurai, Tamil Nadu - 625008",
          countryOfOrigin: "India",
          customerCarePhone: "0452-2890123",
          customerCareEmail: "care@surajgold.in",
          customerCareAddress: "Madurai, Tamil Nadu",
          batchNo: "SG-1L-04",
          estimatedFontHeightMm: 6.1
        }
      },
      {
        productName: "Instant Roasted Masala Makhana",
        brand: "NutriCrunch",
        category: "Food & Groceries",
        imageUrl: "/samples/violating_snack_pack.png",
        state: "West Bengal",
        data: {
          commodityName: "Fox Nut Snack",
          netQuantity: "80 gms", // ILLEGAL UNIT Rule 13
          declaredQuantity: "80",
          unit: "gms",
          mrp: "Rs. 120.00 (Incl. of all taxes)",
          mrpNumeric: 120.0,
          hasInclusiveOfTaxes: true,
          mfgDate: "02/2026",
          manufacturer: "NutriCrunch Snacks, Howrah, West Bengal",
          countryOfOrigin: "India",
          customerCarePhone: "",
          customerCareEmail: "", // MISSING CARE
          customerCareAddress: "",
          batchNo: "MK-80-WB",
          estimatedFontHeightMm: 2.2
        }
      }
    ];

    for (const item of sampleInspections) {
      const evaluation = RuleEngine.evaluate(item.data, "");
      const inspection = new Inspection({
        user: consumer._id,
        productName: item.productName,
        brand: item.brand,
        category: item.category,
        imageUrl: item.imageUrl,
        localImagePath: "",
        imageDims: { width: 800, height: 450 },
        ocrBoxes: [
          { box: [[40, 30], [240, 30], [240, 45], [40, 45]], text: item.productName, confidence: 0.94 },
          { box: [[40, 80], [120, 80], [120, 95], [40, 95]], text: "Net Qty: " + item.data.netQuantity, confidence: 0.91 },
          { box: [[40, 120], [140, 120], [140, 135], [40, 135]], text: "MRP: " + item.data.mrp, confidence: 0.93 },
          { box: [[40, 160], [180, 160], [180, 175], [40, 175]], text: item.data.manufacturer, confidence: 0.89 }
        ],
        rawText: `${item.productName}\n${item.data.commodityName}\n${item.data.netQuantity}\n${item.data.mrp}\n${item.data.manufacturer}`,
        extractedData: item.data,
        rulesEvaluation: evaluation.rules,
        complianceStatus: evaluation.complianceStatus,
        complianceScore: evaluation.score,
        violationsCount: evaluation.violationsCount,
        violationsList: evaluation.violationsList,
        section36Penalty: evaluation.section36Penalty,
        location: {
          state: item.state,
          district: "Urban",
          pincode: "110001"
        },
        officerReview: {
          reviewedBy: evaluation.complianceStatus === "NON_COMPLIANT" ? officer._id : null,
          reviewedAt: evaluation.complianceStatus === "NON_COMPLIANT" ? new Date() : null,
          status: evaluation.complianceStatus === "NON_COMPLIANT" ? "INVESTIGATING" : "RESOLVED",
          officerNotes: evaluation.complianceStatus === "NON_COMPLIANT" ? "Flagged for Section 36 review" : "Label conforms to standards"
        }
      });

      await inspection.save();
    }

    console.log(`[Seed] Seeded ${sampleInspections.length} realistic inspection records across Indian states.`);

    // 3. Create a sample Section 36 Notice
    const violatingInsp = await Inspection.findOne({ complianceStatus: "NON_COMPLIANT" });
    if (violatingInsp) {
      const notice = new Notice({
        inspection: violatingInsp._id,
        issuedBy: officer._id,
        recipientName: violatingInsp.extractedData.manufacturer || "Desi Snackers, Delhi",
        recipientEmail: "compliance@desisnackers.in",
        recipientAddress: "Industrial Area, Delhi - 110020",
        penaltyAmount: 25000,
        violationsSummary: violatingInsp.violationsList,
        noticeSubject: `Show-Cause Notice under Section 36(1) - Packaged Commodity Violations [${violatingInsp.inspectionNumber}]`,
        noticeBody: `Whereas inspection of commodity '${violatingInsp.productName}' confirmed statutory violations under Rule 13 and Rule 6(1)(e). Show cause within 15 days why fine up to Rs. 25,000 should not be levied.`,
        hearingDeadlineDays: 15,
        emailStatus: "SENT",
        emailSentAt: new Date(),
        emailMessageId: "seed-test-msg-01"
      });
      await notice.save();

      violatingInsp.notices.push(notice._id);
      violatingInsp.officerReview.status = "NOTICE_ISSUED";
      await violatingInsp.save();
      console.log(`[Seed] Seeded sample Notice: ${notice.noticeNumber}`);
    }

    console.log("==================================================================");
    console.log("[Seed] SUCCESS! Database seeded with test accounts & inspections.");
    console.log("Officer Login:   officer@delhi.lm.gov.in  |  Password123!");
    console.log("Consumer Login:  consumer@example.com     |  Password123!");
    console.log("==================================================================");

    process.exit(0);
  } catch (err) {
    console.error("[Seed] Error seeding data:", err);
    process.exit(1);
  }
};

seedData();

