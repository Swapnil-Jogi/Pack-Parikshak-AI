const Joi = require("joi");

/**
 * Reusable validation schemas using Joi
 */

// Registration Schema
const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    "string.empty": "Full name is required.",
    "string.min": "Full name must be at least 2 characters.",
    "string.max": "Full name cannot exceed 100 characters."
  }),
  email: Joi.string().trim().email({ tlds: { allow: false } }).required().messages({
    "string.empty": "Valid email address is required.",
    "string.email": "Please provide a valid email address."
  }),
  password: Joi.string().min(6).max(128).required().messages({
    "string.empty": "Password is required.",
    "string.min": "Password must be at least 6 characters long."
  }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match."
  }),
  role: Joi.string().valid("user", "officer").default("user"),
  badgeId: Joi.string().trim().allow("", null).max(50),
  department: Joi.string().trim().allow("", null).max(200),
  state: Joi.string().trim().allow("", null).max(100),
  organization: Joi.string().trim().allow("", null).max(200),
  phone: Joi.string().trim().allow("", null).pattern(/^[0-9+\-\s()]{7,20}$/).messages({
    "string.pattern.base": "Please provide a valid phone number (7-20 digits)."
  }),
  returnTo: Joi.string().trim().allow("", null).max(500)
}).unknown(true);

// Login Schema
const loginSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).required().messages({
    "string.empty": "Email is required.",
    "string.email": "Please provide a valid email address."
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required."
  }),
  returnTo: Joi.string().trim().allow("", null).max(500),
  role: Joi.string().trim().allow("", null)
}).unknown(true);

// Enforcement Notice Schema (Warning Notice or Show-Cause Notice)
const noticeSchema = Joi.object({
  inspectionId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    "string.pattern.base": "Invalid inspection record ID."
  }),
  noticeType: Joi.string().valid("WARNING", "SHOW_CAUSE").default("SHOW_CAUSE"),
  recipientName: Joi.string().trim().min(2).max(200).required().messages({
    "string.empty": "Manufacturer / Packer enterprise name is required."
  }),
  recipientEmail: Joi.string().trim().email({ tlds: { allow: false } }).required().messages({
    "string.empty": "Manufacturer / Packer email is required.",
    "string.email": "Please enter a valid recipient email address."
  }),
  recipientAddress: Joi.string().trim().allow("", null).max(500),
  offenceLevel: Joi.string().valid("first", "second", "subsequent").default("first"),
  hearingDays: Joi.number().integer().min(1).max(90).default(15).messages({
    "number.min": "Compliance deadline must be at least 1 day.",
    "number.max": "Compliance deadline cannot exceed 90 days."
  }),
  customNotes: Joi.string().trim().allow("", null).max(2000)
}).unknown(true);

// Corrections Schema
const correctionsSchema = Joi.object({
  commodityName: Joi.string().trim().allow("", null).max(200),
  netQuantity: Joi.string().trim().allow("", null).max(100),
  unit: Joi.string().trim().allow("", null).max(30),
  mrp: Joi.string().trim().allow("", null).max(50),
  hasInclusiveOfTaxes: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false", "")).allow(null),
  mfgDate: Joi.string().trim().allow("", null).max(50),
  expDate: Joi.string().trim().allow("", null).max(50),
  manufacturer: Joi.string().trim().allow("", null).max(500),
  customerCareEmail: Joi.string().trim().allow("", null).max(100),
  customerCarePhone: Joi.string().trim().allow("", null).max(50),
  countryOfOrigin: Joi.string().trim().allow("", null).max(100),
  productAddress: Joi.string().trim().allow("", null).max(500),
  unitSalePrice: Joi.string().trim().allow("", null).max(100)
}).unknown(true);

// Helper middleware creator
function validate(schema, fallbackRedirect = "/") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: false });
    if (error) {
      const errorMessage = error.details.map((d) => d.message).join(". ");
      console.warn(`[Validation Warning] ${req.method} ${req.originalUrl}:`, errorMessage);

      // JSON or AJAX requests
      if (req.xhr || req.headers.accept?.includes("application/json") || req.originalUrl.startsWith("/api/")) {
        return res.status(400).json({
          success: false,
          error: errorMessage,
          details: error.details.map((d) => ({ field: d.path.join("."), message: d.message }))
        });
      }

      // Standard Form Submission: Flash error and redirect back
      if (req.flash) {
        req.flash("error", errorMessage);
      }
      const redirectUrl = req.header("Referer") || fallbackRedirect;
      return res.redirect(redirectUrl);
    }
    // Replace with sanitized/validated values
    req.body = value;
    next();
  };
}

module.exports = {
  validateRegister: validate(registerSchema, "/auth/register"),
  validateLogin: validate(loginSchema, "/auth/login"),
  validateNotice: validate(noticeSchema, "/officer/dashboard"),
  validateCorrections: validate(correctionsSchema, "/dashboard"),
  schemas: {
    registerSchema,
    loginSchema,
    noticeSchema,
    correctionsSchema
  }
};

