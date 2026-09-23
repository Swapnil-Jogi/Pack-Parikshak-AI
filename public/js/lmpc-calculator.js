/**
 * Rule 27 LMPC Certificate Fee & Readiness Calculator
 */

document.addEventListener("DOMContentLoaded", () => {
  const applicantTypeSelect = document.getElementById("lmpcApplicantType");
  const stateSelect = document.getElementById("lmpcState");
  const scaleSelect = document.getElementById("lmpcScale");

  const feeDisplay = document.getElementById("lmpcFeeDisplay");
  const timelineDisplay = document.getElementById("lmpcTimelineDisplay");
  const authorityDisplay = document.getElementById("lmpcAuthorityDisplay");
  const portalLink = document.getElementById("lmpcPortalLink");

  function calculateLmpc() {
    if (!applicantTypeSelect) return;

    const applicant = applicantTypeSelect.value;
    const state = stateSelect ? stateSelect.value : "Delhi";
    const scale = scaleSelect ? scaleSelect.value : "small";

    let fee = 500;
    let timeline = "20-30 Days";
    let authority = "Director of Legal Metrology (Central Government, New Delhi)";
    let portalUrl = "https://lm.doca.gov.in";
    let portalName = "National Legal Metrology Portal (Central)";

    if (applicant === "importer") {
      fee = 500;
      timeline = "20-25 Working Days";
      authority = "Director of Legal Metrology, Krishi Bhawan, New Delhi";
      portalUrl = "https://www.nsws.gov.in";
      portalName = "National Single Window System (NSWS)";
    } else {
      // Manufacturer or Packer (State Controller)
      authority = `Controller of Legal Metrology, Government of ${state}`;
      portalName = `State Legal Metrology Online Portal (${state})`;
      if (state === "Maharashtra" || state === "Karnataka" || state === "Gujarat") {
        fee = scale === "large" ? 2500 : scale === "medium" ? 1500 : 750;
        timeline = "15-20 Working Days";
      } else {
        fee = scale === "large" ? 2000 : scale === "medium" ? 1000 : 500;
        timeline = "15-30 Working Days";
      }
    }

    if (feeDisplay) feeDisplay.innerText = `₹ ${fee.toLocaleString("en-IN")}`;
    if (timelineDisplay) timelineDisplay.innerText = timeline;
    if (authorityDisplay) authorityDisplay.innerText = authority;
    if (portalLink) {
      portalLink.href = portalUrl;
      portalLink.innerText = `Apply via ${portalName}`;
    }
  }

  if (applicantTypeSelect) applicantTypeSelect.addEventListener("change", calculateLmpc);
  if (stateSelect) stateSelect.addEventListener("change", calculateLmpc);
  if (scaleSelect) scaleSelect.addEventListener("change", calculateLmpc);

  calculateLmpc();

  // Document Readiness Checklist tracker
  const checkboxes = document.querySelectorAll(".lmpc-doc-check");
  const progressText = document.getElementById("docReadinessPct");
  const progressBar = document.getElementById("docReadinessBar");

  function updateChecklist() {
    if (!checkboxes.length) return;
    let checkedCount = 0;
    checkboxes.forEach((cb) => {
      if (cb.checked) checkedCount++;
    });
    const pct = Math.round((checkedCount / checkboxes.length) * 100);
    if (progressText) progressText.innerText = `${pct}% Ready (${checkedCount}/${checkboxes.length} Documents)`;
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", updateChecklist));
  updateChecklist();
});

