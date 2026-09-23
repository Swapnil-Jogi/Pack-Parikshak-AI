const mongoose = require("mongoose");

const NoticeSchema = new mongoose.Schema(
  {
    noticeNumber: {
      type: String,
      unique: true,
      index: true
    },
    inspection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inspection",
      required: true
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    recipientName: {
      type: String,
      required: true
    },
    recipientEmail: {
      type: String,
      required: true
    },
    recipientAddress: {
      type: String,
      default: ""
    },
    noticeType: {
      type: String,
      enum: ["WARNING", "SHOW_CAUSE"],
      default: "SHOW_CAUSE"
    },
    rectificationDeadlineDays: {
      type: Number,
      default: 15
    },
    potentialPenaltyExposure: {
      type: Number,
      default: 25000
    },
    statutorySection: {
      type: String,
      default: "Section 36(1) of the Legal Metrology Act, 2009"
    },
    penaltyAmount: {
      type: Number,
      default: 25000
    },
    violationsSummary: [String],
    noticeSubject: {
      type: String,
      required: true
    },
    noticeBody: {
      type: String,
      required: true
    },
    hearingDeadlineDays: {
      type: Number,
      default: 15
    },
    emailStatus: {
      type: String,
      enum: ["SENT", "FAILED", "PENDING", "PREVIEW_MODE"],
      default: "PENDING"
    },
    emailSentAt: {
      type: Date,
      default: null
    },
    emailMessageId: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

NoticeSchema.pre("validate", function () {
  if (!this.noticeNumber) {
    const yr = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    if (this.noticeType === "WARNING") {
      this.noticeNumber = `WARN/LM/${yr}/${rand}`;
    } else {
      this.noticeNumber = `SCN/LM/${yr}/${rand}`;
    }
  }
});

module.exports = mongoose.model("Notice", NoticeSchema);

