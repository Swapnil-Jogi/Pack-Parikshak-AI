/**
 * Enforcement Notice Drafting & Dispatch Modal Script
 * Supports both Statutory Warning Notice and Official Show-Cause Notice
 */

function switchModalNoticeType(type) {
  const isWarning = type === "WARNING";
  const radWarning = document.querySelector('input[name="modalNoticeType"][value="WARNING"]');
  const radShowCause = document.querySelector('input[name="modalNoticeType"][value="SHOW_CAUSE"]');
  const lblWarning = document.getElementById("lblNoticeTypeWarning");
  const lblShowCause = document.getElementById("lblNoticeTypeShowCause");
  const headerTitle = document.getElementById("modalHeaderTitle");
  const headerIcon = document.getElementById("modalHeaderIcon");
  const warningBanner = document.getElementById("modalWarningBanner");
  const deadlineLabel = document.getElementById("modalDeadlineLabel");
  const penaltyLabel = document.getElementById("modalPenaltyLabel");
  const penaltyBox = document.getElementById("modalPenaltyBox");
  const penaltyDisplay = document.getElementById("modalPenaltyDisplay");
  const submitBtn = document.getElementById("submitNoticeBtn");
  const submitBtnText = document.getElementById("submitNoticeBtnText");

  if (isWarning) {
    if (radWarning) radWarning.checked = true;
    if (lblWarning) {
      lblWarning.className = "cursor-pointer border rounded-lg p-2.5 text-center transition border-amber-500 bg-amber-50 shadow-xs";
    }
    if (lblShowCause) {
      lblShowCause.className = "cursor-pointer border rounded-lg p-2.5 text-center transition border-slate-300 bg-white";
    }
    if (headerTitle) headerTitle.innerText = "Issue Statutory Warning Notice";
    if (headerIcon) headerIcon.className = "fa-solid fa-triangle-exclamation text-amber-400";
    if (warningBanner) warningBanner.style.display = "block";
    if (deadlineLabel) deadlineLabel.innerText = "Compliance Rectification Deadline";
    if (penaltyLabel) penaltyLabel.innerText = "Statutory Penalty Exposure (if unrectified):";
    if (penaltyBox) penaltyBox.className = "p-2.5 rounded bg-amber-50 border border-amber-200 flex items-center justify-between";
    if (penaltyDisplay) {
      penaltyDisplay.classList.remove("text-red-600");
      penaltyDisplay.classList.add("text-amber-700");
    }
    if (submitBtn) {
      submitBtn.className = "btn btn-warning btn-sm text-xs font-bold py-1.5 px-4 shadow";
    }
    if (submitBtnText) submitBtnText.innerText = "Dispatch Warning Notice to Manufacturer";
  } else {
    if (radShowCause) radShowCause.checked = true;
    if (lblShowCause) {
      lblShowCause.className = "cursor-pointer border rounded-lg p-2.5 text-center transition border-red-500 bg-red-50 shadow-xs";
    }
    if (lblWarning) {
      lblWarning.className = "cursor-pointer border rounded-lg p-2.5 text-center transition border-slate-300 bg-white";
    }
    if (headerTitle) headerTitle.innerText = "Issue Section 36 Show-Cause Notice";
    if (headerIcon) headerIcon.className = "fa-solid fa-gavel text-red-400";
    if (warningBanner) warningBanner.style.display = "none";
    if (deadlineLabel) deadlineLabel.innerText = "Hearing / Reply Deadline";
    if (penaltyLabel) penaltyLabel.innerText = "Assessed Compounding Penalty:";
    if (penaltyBox) penaltyBox.className = "p-2.5 rounded bg-red-50 border border-red-200 flex items-center justify-between";
    if (penaltyDisplay) {
      penaltyDisplay.classList.remove("text-amber-700");
      penaltyDisplay.classList.add("text-red-600");
    }
    if (submitBtn) {
      submitBtn.className = "btn btn-danger btn-sm text-xs font-bold py-1.5 px-4 shadow";
    }
    if (submitBtnText) submitBtnText.innerText = "Issue Official Show-Cause Notice";
  }
  updateModalFine();
}

function openNoticeModal(inspectionId, prodName, mfgName, violationsStr, estFine, initialType = "WARNING") {
  const modalEl = document.getElementById("noticeModal");
  if (!modalEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  document.getElementById("modalInspectionId").value = inspectionId;
  document.getElementById("modalProdName").innerText = prodName || "Commodity";
  document.getElementById("modalRecipientName").value = mfgName || "M/s Manufacturing Unit";
  document.getElementById("modalRecipientEmail").value = "compliance@manufacturer.in";

  const violationsList = violationsStr ? violationsStr.split(";") : [];
  const violationsUl = document.getElementById("modalViolationsList");
  if (violationsUl) {
    violationsUl.innerHTML = violationsList.map(v => `<li class="text-xs text-red-700 py-0.5">${v.trim()}</li>`).join("");
  }

  switchModalNoticeType(initialType || "WARNING");
  modal.show();
}

function updateModalFine() {
  const levelEl = document.getElementById("modalOffenceLevel");
  const displayEl = document.getElementById("modalPenaltyDisplay");
  if (!levelEl || !displayEl) return;

  const level = levelEl.value;
  let fine = 25000;
  if (level === "second") fine = 50000;
  else if (level === "subsequent") fine = 100000;
  displayEl.innerText = `₹ ${fine.toLocaleString("en-IN")}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const offenceSelect = document.getElementById("modalOffenceLevel");
  if (offenceSelect) {
    offenceSelect.addEventListener("change", updateModalFine);
  }

  const noticeForm = document.getElementById("noticeDraftForm");
  if (noticeForm) {
    noticeForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const inspectionId = document.getElementById("modalInspectionId").value.trim();
      const recipientName = document.getElementById("modalRecipientName").value.trim();
      const recipientEmail = document.getElementById("modalRecipientEmail").value.trim();
      const recipientAddress = document.getElementById("modalRecipientAddress").value.trim();
      const offenceLevel = document.getElementById("modalOffenceLevel").value;
      const hearingDays = parseInt(document.getElementById("modalHearingDays").value, 10);
      const customNotes = document.getElementById("modalCustomNotes").value.trim();
      const noticeTypeRadio = document.querySelector('input[name="modalNoticeType"]:checked');
      const noticeType = noticeTypeRadio ? noticeTypeRadio.value : "WARNING";

      // Frontend validation
      if (!recipientName) {
        alert("Please enter the recipient enterprise name.");
        document.getElementById("modalRecipientName").focus();
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!recipientEmail || !emailRegex.test(recipientEmail)) {
        alert("Please enter a valid recipient email address (e.g. compliance@manufacturer.in).");
        document.getElementById("modalRecipientEmail").focus();
        return;
      }

      const submitBtn = document.getElementById("submitNoticeBtn");
      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> Dispathing Notice...`;

      const payload = {
        inspectionId,
        noticeType,
        recipientName,
        recipientEmail,
        recipientAddress,
        offenceLevel,
        hearingDays,
        customNotes
      };

      try {
        const res = await fetch("/officer/notice", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
          const typeLabel = noticeType === "WARNING" ? "Statutory Warning Notice" : "Official Show-Cause Notice";
          alert(`Success! ${typeLabel} (${data.notice.noticeNumber}) dispatched to ${payload.recipientEmail} with a ${hearingDays}-day deadline!\n${data.previewUrl ? 'Email Preview: ' + data.previewUrl : ''}`);
          window.location.reload();
        } else {
          alert(`Error issuing notice: ${data.error || "Unknown error occurred"}`);
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHtml;
        }
      } catch (err) {
        alert(`Network error: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  }
});
