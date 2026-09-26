const mongoose = require("mongoose");

const InspectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    inspectionNumber: {
      type: String,
      unique: true,
      index: true
    },
    productName: {
      type: String,
      default: "Unlabeled Packaged Commodity"
    },
    brand: {
      type: String,
      default: "General"
    },
    category: {
      type: String,
      enum: ["Food & Groceries", "Beverages", "Cosmetics & Personal Care", "Electronics & Appliances", "Pharmaceuticals", "Textiles", "General Merchandise"],
      default: "Food & Groceries"
    },
    imageUrl: {
      type: String,
      required: true
    },
    localImagePath: {
      type: String,
      default: ""
    },
    imageDims: {
      width: { type: Number, default: 800 },
      height: { type: Number, default: 600 }
    },
    ocrBoxes: [
      {
        box: [[Number]],
        text: String,
        confidence: Number
      }
    ],
    rawText: {
      type: String,
      default: ""
    },
    extractedData: {
      commodityName: { type: String, default: "" },
      netQuantity: { type: String, default: "" },
      declaredQuantity: { type: String, default: "" },
      unit: { type: String, default: "" },
      mrp: { type: String, default: "" },
      mrpNumeric: { type: Number, default: null },
      hasInclusiveOfTaxes: { type: Boolean, default: false },
      mfgDate: { type: String, default: "" },
      expDate: { type: String, default: "" },
      manufacturer: { type: String, default: "" },
      countryOfOrigin: { type: String, default: "" },
      productAddress: { type: String, default: "" },
      unitSalePrice: { type: String, default: "" },
      customerCarePhone: { type: String, default: "" },
      customerCareEmail: { type: String, default: "" },
      customerCareAddress: { type: String, default: "" },
      batchNo: { type: String, default: "" },
      estimatedFontHeightMm: { type: Number, default: 2.5 }
    },
    manualCorrections: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    rulesEvaluation: [
      {
        ruleId: String,
        ruleName: String,
        statutoryReference: String,
        status: {
          type: String,
          enum: ["PASS", "FAIL", "WARNING"]
        },
        detectedValue: String,
        requirement: String,
        message: String
      }
    ],
    complianceStatus: {
      type: String,
      enum: ["COMPLIANT", "NON_COMPLIANT", "WARNING"],
      default: "NON_COMPLIANT",
      index: true
    },
    complianceScore: {
      type: Number,
      default: 0
    },
    violationsCount: {
      type: Number,
      default: 0
    },
    violationsList: [String],
    section36Penalty: {
      firstOffenceMax: { type: Number, default: 25000 },
      secondOffenceMax: { type: Number, default: 50000 },
      subsequentOffenceMax: { type: Number, default: 100000 },
      applicableClause: { type: String, default: "Section 36(1) of Legal Metrology Act, 2009" },
      estimatedAmount: { type: Number, default: 25000 }
    },
    location: {
      state: { type: String, default: "Delhi", index: true },
      district: { type: String, default: "Central" },
      pincode: { type: String, default: "110001" }
    },
    officerReview: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      reviewedAt: { type: Date, default: null },
      officerNotes: { type: String, default: "" },
      status: {
        type: String,
        enum: ["PENDING", "INVESTIGATING", "WARNING_ISSUED", "NOTICE_ISSUED", "RESOLVED", "DISMISSED"],
        default: "PENDING",
        index: true
      }
    },
    notices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Notice"
      }
    ],
    complaint: {
      isFiled: { type: Boolean, default: false, index: true },
      complaintNumber: { type: String, default: "" },
      filedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      consumerName: { type: String, default: "" },
      consumerEmail: { type: String, default: "" },
      consumerPhone: { type: String, default: "" },
      reason: { type: String, default: "" },
      description: { type: String, default: "" },
      filedAt: { type: Date, default: null },
      status: {
        type: String,
        enum: ["PENDING", "CONFIRMED", "INVESTIGATING", "NOTICE_ISSUED", "RESOLVED", "DISMISSED"],
        default: "PENDING"
      },
      viewedByOfficer: { type: Boolean, default: false, index: true },
      viewedByOfficerAt: { type: Date, default: null },
      officerViewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      officerName: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

// Auto-generate Unique Inspection ID before validation
InspectionSchema.pre("validate", function () {
  if (!this.inspectionNumber) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.inspectionNumber = `LM-INSP-${dateStr}-${rand}`;
  }
});

module.exports = mongoose.model("Inspection", InspectionSchema);

