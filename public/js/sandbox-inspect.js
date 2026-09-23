/**
 * Client-side script for Interactive OCR Sandbox inspection view
 * Handles Canvas Sandbox initialization, live statutory re-verification,
 * OCR text copying, and tab transitions.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Read sandbox config from DOM
  const configEl = document.getElementById("sandboxConfig");
  if (!configEl) return;

  const inspectionId = configEl.dataset.id || "";
  const imageUrl = configEl.dataset.imageUrl || "";
  let boxes = [];
  let dims = { width: 800, height: 600 };

  try {
    if (configEl.dataset.boxes) {
      boxes = JSON.parse(decodeURIComponent(configEl.dataset.boxes));
    }
    if (configEl.dataset.dims) {
      dims = JSON.parse(decodeURIComponent(configEl.dataset.dims));
    }
    if (configEl.dataset.translations) {
      window.__CLIENT_TRANSLATIONS__ = JSON.parse(decodeURIComponent(configEl.dataset.translations));
    }
  } catch (e) {
    console.error("Error parsing sandbox configuration data:", e);
  }

  // 2. Initialize Canvas Sandbox
  if (typeof OcrCanvasSandbox === "function") {
    window.sandbox = new OcrCanvasSandbox("ocrCanvas", imageUrl, boxes, dims);
  }

  // 3. Initialize checkbox state from data attribute
  const checkTaxes = document.getElementById("checkTaxes");
  if (checkTaxes && checkTaxes.dataset.checked === "true") {
    checkTaxes.checked = true;
  }

  // 3b. Initialize compliance progress bar width
  const initialBar = document.getElementById("complianceProgressBar");
  if (initialBar && initialBar.dataset.initialScore) {
    initialBar.style.width = `${initialBar.dataset.initialScore}%`;
  }

  // 4. Attach Section 36 Notice opener button
  const btnOpenNotice = document.getElementById("btnOpenNoticeModal");
  if (btnOpenNotice) {
    btnOpenNotice.addEventListener("click", () => {
      const nd = document.getElementById("noticeData");
      if (nd && typeof openNoticeModal === "function") {
        openNoticeModal(
          nd.dataset.id,
          nd.dataset.product,
          nd.dataset.manufacturer,
          nd.dataset.violations,
          parseInt(nd.dataset.penalty, 10) || 25000
        );
      }
    });
  }

  // 5. Live Re-verification AJAX Handler
  const form = document.getElementById("correctionForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btnReverify");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Re-Verifying Rules...';
      }

      const payload = {
        commodityName: document.getElementById("inputCommodity")?.value || "",
        netQuantity: document.getElementById("inputNetQty")?.value || "",
        unit: document.getElementById("inputUnit")?.value || "",
        mrp: document.getElementById("inputMrp")?.value || "",
        hasInclusiveOfTaxes: !!document.getElementById("checkTaxes")?.checked,
        unitSalePrice: document.getElementById("inputUsp")?.value || "",
        mfgDate: document.getElementById("inputMfgDate")?.value || "",
        countryOfOrigin: document.getElementById("inputOrigin")?.value || "",
        manufacturer: document.getElementById("inputManufacturer")?.value || "",
        productAddress: document.getElementById("inputProductAddress")?.value || "",
        customerCarePhone: document.getElementById("inputCarePhone")?.value || "",
        customerCareEmail: document.getElementById("inputCareEmail")?.value || ""
      };

      try {
        const res = await fetch("/inspections/" + encodeURIComponent(inspectionId) + "/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          // Update score display
          const scoreEl = document.getElementById("complianceScoreDisplay");
          if (scoreEl) scoreEl.innerText = `${data.complianceScore}%`;

          const bar = document.getElementById("complianceProgressBar");
          if (bar) {
            bar.style.width = `${data.complianceScore}%`;
            bar.className = `h-2 rounded-full transition-all duration-500 ${data.complianceScore >= 80 ? 'bg-emerald-600' : data.complianceScore >= 50 ? 'bg-amber-500' : 'bg-red-600'}`;
          }

          // Update penalty
          const penaltyEl = document.getElementById("penaltyAmountDisplay");
          if (penaltyEl) {
            penaltyEl.innerText = `₹ ${(data.section36Penalty ? data.section36Penalty.estimatedAmount : 0).toLocaleString('en-IN')}`;
          }

          // Update violations
          const vBox = document.getElementById("violationsSummaryBox");
          if (vBox) {
            if (data.violationsCount > 0) {
              vBox.classList.remove("hidden");
              const countEl = document.getElementById("violationsCountDisplay");
              if (countEl) countEl.innerText = data.violationsCount;
              const ulEl = document.getElementById("violationsUl");
              if (ulEl) ulEl.innerHTML = (data.violationsList || []).map(v => `<li>${v}</li>`).join("");
            } else {
              vBox.classList.add("hidden");
            }
          }

          // Update rules checklist
          const rulesHtml = (data.rules || []).map(r => {
            const isPass = r.status === 'PASS';
            const isWarn = r.status === 'WARNING';
            const borderBg = isPass ? 'border-emerald-200 bg-emerald-50/50' : isWarn ? 'border-amber-200 bg-amber-50/50' : 'border-red-200 bg-red-50/50';
            const badgeBg = isPass ? 'bg-emerald-600' : isWarn ? 'bg-amber-500' : 'bg-red-600';
            const icon = isPass ? '<i class="fa-solid fa-circle-check text-emerald-600"></i>' : isWarn ? '<i class="fa-solid fa-circle-exclamation text-amber-500"></i>' : '<i class="fa-solid fa-circle-xmark text-red-600"></i>';

            return `
              <div class="rule-card p-2.5 rounded-lg border ${borderBg} flex items-start justify-between gap-2">
                <div class="text-xs">
                  <div class="font-bold text-slate-900 flex items-center gap-1.5">
                    ${icon}
                    <span>${r.ruleName}</span>
                  </div>
                  <div class="text-[11px] text-slate-600 mt-0.5">${r.message}</div>
                </div>
                <span class="badge text-[10px] uppercase font-bold shrink-0 ${badgeBg} text-white">
                  ${r.status}
                </span>
              </div>
            `;
          }).join("");

          const listEl = document.getElementById("rulesListContainer");
          if (listEl) listEl.innerHTML = rulesHtml;
        }
      } catch (err) {
        alert("Failed to re-verify rules: " + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-arrows-rotate me-1"></i> Re-Verify Rules & Recalculate Compliance';
        }
      }
    });
  }

  // 6. Navigation tabs styling transitions
  const tabFull = document.getElementById("tab-fulltext-btn");
  const tabLines = document.getElementById("tab-lines-btn");
  if (tabFull && tabLines) {
    tabFull.addEventListener("shown.bs.tab", () => {
      tabFull.classList.add("border-govblue", "text-govblue");
      tabFull.classList.remove("border-transparent", "text-slate-500");
      tabLines.classList.remove("border-govblue", "text-govblue");
      tabLines.classList.add("border-transparent", "text-slate-500");
    });
    tabLines.addEventListener("shown.bs.tab", () => {
      tabLines.classList.add("border-govblue", "text-govblue");
      tabLines.classList.remove("border-transparent", "text-slate-500");
      tabFull.classList.remove("border-govblue", "text-govblue");
      tabFull.classList.add("border-transparent", "text-slate-500");
    });
  }
});

// Copy Raw Text Helper (Global)
function copyRawOcrText() {
  const el = document.getElementById("rawOcrPreText");
  if (!el) return;
  const text = el.innerText || el.textContent;
  const t = window.__CLIENT_TRANSLATIONS__ || {};
  const copiedMsg = t.rawOcrCopied || "Copied!";
  const copyBtnMsg = t.rawOcrCopyBtn || "Copy Text";
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtnText");
    if (btn) {
      btn.innerText = copiedMsg;
      setTimeout(() => { btn.innerText = copyBtnMsg; }, 2000);
    }
  }).catch(err => {
    console.error("Failed to copy text:", err);
  });
}

