const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = null;
    this.isEthereal = false;
  }

  async getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      console.log(`[Email-Service] Connected to SMTP: ${process.env.SMTP_HOST}`);
      return this.transporter;
    }

    // Auto-create test account using Ethereal
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      this.isEthereal = true;
      console.log(`[Email-Service] Created Ethereal Test Email account: ${testAccount.user}`);
      return this.transporter;
    } catch (err) {
      console.warn("[Email-Service] Could not initialize Ethereal test account:", err.message);
      return null;
    }
  }

  /**
   * Dispatches Section 36 Show-Cause Notice to manufacturer/packer.
   * @param {Object} notice - Notice Mongoose document
   * @param {Object} inspection - Inspection document
   * @param {Buffer} [pdfAttachment] - Optional PDF audit report buffer
   */
  async sendNoticeEmail(notice, inspection, pdfAttachment = null) {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        return {
          success: false,
          previewUrl: null,
          error: "Email transporter not initialized"
        };
      }

      const attachments = [];
      if (pdfAttachment) {
        attachments.push({
          filename: `Legal_Metrology_Inspection_${inspection.inspectionNumber}.pdf`,
          content: pdfAttachment,
          contentType: "application/pdf"
        });
      }

      const isWarning = notice.noticeType === "WARNING";
      const deadlineDays = notice.hearingDeadlineDays || notice.rectificationDeadlineDays || 15;
      const penaltyAmt = notice.penaltyAmount || notice.potentialPenaltyExposure || 25000;

      const emailSubject = isWarning
        ? `[STATUTORY WARNING] Pre-Notice Advisory: Non-Compliance on '${inspection.productName}' - Ref: ${notice.noticeNumber}`
        : `[STATUTORY NOTICE] ${notice.noticeSubject} - Ref: ${notice.noticeNumber}`;

      const headerTitle = isWarning ? "PRE-ENFORCEMENT STATUTORY WARNING NOTICE" : "FORMAL STATUTORY NOTICE UNDER SECTION 36(1)";
      const headerColor = isWarning ? "#b45309" : "#b91c1c";
      const deadlineLabel = isWarning ? "Compliance Rectification Deadline" : "Response / Hearing Deadline";

      const mailOptions = {
        from: process.env.SMTP_FROM || '"Directorate of Legal Metrology" <enforcement.lm@gov.in>',
        to: notice.recipientEmail,
        subject: emailSubject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #0f2e5a; color: #ffffff; padding: 24px; text-align: center;">
              <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">GOVERNMENT OF INDIA</h2>
              <h3 style="margin: 4px 0 0; font-size: 16px; font-weight: normal; color: #f97316;">DIRECTORATE OF LEGAL METROLOGY</h3>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Department of Consumer Affairs, Legal Metrology Wing</p>
            </div>
            <div style="padding: 24px; background-color: #ffffff; color: #1e293b; line-height: 1.6;">
              <p style="font-weight: bold; color: ${headerColor}; font-size: 16px; margin-top: 0; text-transform: uppercase;">
                ${headerTitle}
              </p>
              <p><strong>Notice Reference No:</strong> ${notice.noticeNumber}</p>
              <p><strong>Inspection Tracking ID:</strong> ${inspection.inspectionNumber}</p>
              <p><strong>Commodity Inspected:</strong> ${inspection.productName} (${inspection.brand})</p>
              <p><strong>To:</strong> M/s ${notice.recipientName}</p>
              <p><strong>Subject:</strong> ${notice.noticeSubject}</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
              
              <div style="background-color: ${isWarning ? '#fffbeb' : '#f8fafc'}; border-left: 4px solid ${isWarning ? '#f59e0b' : '#ef4444'}; padding: 12px 16px; margin: 16px 0;">
                <h4 style="margin: 0 0 8px; color: ${isWarning ? '#92400e' : '#991b1b'};">Identified Statutory Violations:</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  ${notice.violationsSummary.map((v) => `<li style="margin-bottom: 4px;">${v}</li>`).join("")}
                </ul>
              </div>

              <p>${notice.noticeBody.replace(/\n/g, "<br/>")}</p>

              <div style="background-color: ${isWarning ? '#fef3c7' : '#fef2f2'}; border: 1px dashed ${isWarning ? '#f59e0b' : '#f87171'}; border-radius: 6px; padding: 14px 16px; margin: 16px 0;">
                <p style="margin: 0; font-weight: bold; color: ${isWarning ? '#92400e' : '#991b1b'}; font-size: 14px;">
                  ${deadlineLabel}: <strong>${deadlineDays} Days</strong> from receipt of this electronic advisory
                </p>
                ${isWarning ? `
                  <p style="margin: 6px 0 0; font-size: 13px; color: #78350f;">
                    <strong>Action Required:</strong> Rectify non-compliant packaging declarations on all retail units and submit certified confirmation of compliance within the stipulated deadline.
                  </p>
                  <p style="margin: 8px 0 0; font-size: 12px; color: #b91c1c; font-weight: bold; border-top: 1px solid #fde68a; pt: 6px;">
                    ⚠ STATUTORY WARNING: Failure to remedy the identified violations within ${deadlineDays} days will result in the immediate issuance of an Official Show-Cause Notice under Section 36(1) of the Legal Metrology Act, 2009 with statutory penalties up to ₹${penaltyAmt.toLocaleString('en-IN')} and compounding/prosecution proceedings.
                  </p>
                ` : `
                  <p style="margin: 4px 0 0; font-size: 13px; color: #7f1d1d;">
                    Statutory Penalty Provision: Up to ₹${penaltyAmt.toLocaleString("en-IN")}
                  </p>
                `}
              </div>

              <p style="font-size: 13px; color: #64748b;">
                This notice is electronically issued by an authorized Enforcement Officer via the <strong>Pack-Parikshak AI Legal Metrology Portal</strong>. Please inspect the attached official forensic PDF audit report for full bounding-box and photographic verification records.
              </p>
            </div>
            <div style="background-color: #f1f5f9; padding: 12px 24px; text-align: center; font-size: 12px; color: #64748b;">
              Legal Metrology Bhavan, New Delhi | National Consumer Helpline: 1915
            </div>
          </div>
        `,
        attachments
      };

      const info = await transporter.sendMail(mailOptions);
      let previewUrl = null;
      if (this.isEthereal) {
        previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`[Email-Service] Test notice sent! Preview at: ${previewUrl}`);
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl
      };
    } catch (error) {
      console.error("[Email-Service] Failed to send notice email:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();

