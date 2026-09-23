# Pack-Parikshak AI (पैक-परीक्षक एआई)

**Official Statutory Compliance & Automated Verification Platform for Packaged Commodities**  
*Built under the Legal Metrology (Packaged Commodities) Rules, 2011 & The Legal Metrology Act, 2009*

---

## Executive Overview
**Pack-Parikshak AI** is a production-grade, full-stack web application designed for consumers, manufacturers, and Legal Metrology Enforcement Officers. It automatically analyzes product packaging labels using **PaddleOCR (RapidOCR PP-OCRv4)** to extract label declarations, resolve complex scattered layouts (e.g. left-side keys and right-side values), and rigorously evaluate statutory compliance under the **Legal Metrology (Packaged Commodities) Rules, 2011**.

---

## Key Features & Capabilities

### 1. Dual-Role RBAC & Portals
- **Consumer / Manufacturer Portal:**
  - Fast upload of packaging photos (or instant 1-click test scenarios).
  - Personal scan history with compliance health scores.
  - Interactive HTML5 Canvas bounding box sandbox.
  - One-click downloadable Government of India styled legal audit report (PDF).
- **Enforcement Officer Command Center:**
  - **Chart.js Visualizations:** Real-time compliance breakdown (donut chart) and top statutory rule violations (bar chart).
  - **Regional Compliance Heatmap:** State-wise inspection volumes and violation heat density across Indian states (Delhi, Maharashtra, Karnataka, Gujarat, etc.).
  - **Official Inspection Queue:** Actionable queue of flagged packaging cases.
  - **Section 36 Penalty Calculator & Notice Generator:** Automatically computes statutory penalties under Section 36(1) (₹25,000 for 1st offence, ₹50,000 for 2nd, up to ₹1,00,000 for subsequent offences) and drafts formal Show-Cause Notices dispatched via email (Nodemailer) with PDF audit attachments.

### 2. PaddleOCR Spatial Layout Parser
- Resolves separated key-value packaging designs (e.g., "MRP" on left, "₹ 285.00" on right).
- Horizontal stripe clustering and geometric proximity algorithms bind keys to values accurately.
- Generates 4-point polygon bounding boxes rendered directly on an interactive HTML5 Canvas with hover inspection and zoom controls.

### 3. Rigorous 8-Mandatory Declarations Rule Engine
Evaluates compliance strictly against:
1. **Rule 6(1)(a):** Name & Address of Manufacturer / Packer / Importer
2. **Rule 6(1)(aa):** Country of Origin Declaration
3. **Rule 6(1)(b):** Common or Generic Name of the Commodity
4. **Rule 6(1)(c) & Rule 13:** Net Quantity in standard SI units (strictly prohibits non-standard abbreviations like `gms`, `gm`, `ltrs`, `kilo`)
5. **Rule 6(1)(d):** Month & Year of Manufacture / Packing / Import
6. **Rule 6(1)(e):** Maximum Retail Price (MRP) with explicit phrase *"inclusive of all taxes"*
7. **Rule 6(1)(n):** Consumer Care Redressal telephone number AND email address
8. **Rule 7 & Schedule II:** Minimum Numeral Font Height & Prominence scaled to net weight

### 4. Interactive OCR Correction Sandbox
- Users and Officers can correct any OCR misreadings in the UI.
- Clicking **"Re-Verify Rules"** triggers asynchronous AJAX re-evaluation and recalculates the compliance score and badges in real-time without page reload.

### 5. Multi-Lingual Localization (10 Indian Languages)
Supports standard Government-style top-bar language switcher across:
- **English**
- **हिन्दी** (Hindi)
- **मराठी** (Marathi)
- **বাংলা** (Bengali)
- **தமிழ்** (Tamil)
- **తెలుగు** (Telugu)
- **ગુજરાતી** (Gujarati)
- **ಕನ್ನಡ** (Kannada)
- **മലയാളം** (Malayalam)
- **ਪੰਜਾਬੀ** (Punjabi)

### 6. Rule 27 LMPC Certificate Guide
- Complete statutory roadmap to obtain an LMPC Certificate under Rule 27 for Importers, Packers, and Manufacturers.
- Interactive **LMPC Fee & Timeline Calculator** and interactive **Document Readiness Checklist**.

---

## Technology Stack
- **Frontend:** HTML5 Canvas, CSS3, JavaScript (ES6+), Bootstrap 5, Tailwind CSS, EJS Templates (Strictly NO React).
- **Backend:** Node.js, Express.js (Clean MVC Architecture).
- **Database:** MongoDB with Mongoose.
- **OCR Engine:** Python microservice using PaddleOCR (RapidOCR PP-OCRv4 ONNX).
- **Storage:** Cloudinary with local disk fallback (`public/uploads`).
- **Reports:** Styled PDF generation via PDFKit & CSV data exports.
- **Email:** Nodemailer for automated Section 36 Show-Cause Warning notices.

---

## Single-Terminal Unified Execution

You can run the entire platform (**Express server + Python PaddleOCR microservice**) from a **single command in a single terminal**:

```bash
node app.js
```
*`app.js` automatically detects, spawns, and manages the background Python OCR microservice on port 5000, handles unified terminal logging, and terminates gracefully on shutdown.*

---

## Quick Start & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+) with `rapidocr-onnxruntime`, `flask`, `flask-cors`, `pillow` (already installed)
- MongoDB running locally or MongoDB Atlas URI

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
A configured `.env` file is already provided. Configure Cloudinary or custom SMTP credentials if desired.

### 3. Seed Realistic Database Records
Populates demo accounts and 11+ realistic packaging inspection records across Indian states:
```bash
npm run seed
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Start the Application
```bash
npm start
```

Visit the application at:
- **Home Portal:** [http://localhost:8080](http://localhost:8080)
- **Consumer Portal:** [http://localhost:8080/dashboard](http://localhost:8080/dashboard)
- **Officer Command Hub:** [http://localhost:8080/officer/dashboard](http://localhost:8080/officer/dashboard)
- **LMPC Registration Guide:** [http://localhost:8080/lmpc-guide](http://localhost:8080/lmpc-guide)
- **System Architecture:** [http://localhost:8080/architecture](http://localhost:8080/architecture)

---

## Pre-Configured Test Credentials

| Role | Email | Password | Badge ID |
| :--- | :--- | :--- | :--- |
| **Enforcement Officer** | `officer@delhi.lm.gov.in` | `Officer123!` | `DL-LM-0842` |
| **Consumer / Packer** | `consumer@example.com` | `Password123!` | N/A |

*Tip: You can also use the **1-Click Fast Login** buttons on the Sign In page for instant access!*

---

## Render Cloud Deployment

Deploy directly to Render using the provided `render.yaml` blueprint:
1. Connect your repository to **Render**.
2. Select **Web Service** with Node environment.
3. Build Command: `npm install && pip install -r python_ocr/requirements.txt`
4. Start Command: `node app.js`
5. Set environment variables: `MONGODB_URI`, `SESSION_SECRET`, `JWT_SECRET`.

