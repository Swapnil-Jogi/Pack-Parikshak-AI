/**
 * Chart.js Visualizations & Officer Dashboard Analytics
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Compliance Ratio Donut Chart
  const complianceCanvas = document.getElementById("complianceDonutChart");
  if (complianceCanvas && window.officerChartData) {
    const pieData = window.officerChartData.compliancePie || [12, 5, 2];
    new Chart(complianceCanvas, {
      type: "doughnut",
      data: {
        labels: ["Compliant", "Non-Compliant", "Warning"],
        datasets: [
          {
            data: pieData,
            backgroundColor: ["#16a34a", "#dc2626", "#d97706"],
            borderWidth: 2,
            borderColor: "#ffffff"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, font: { size: 11, family: "'Inter', sans-serif" } }
          }
        },
        cutout: "70%"
      }
    });
  }

  // 2. Top Rule Violations Horizontal Bar Chart
  const violationsCanvas = document.getElementById("violationsBarChart");
  if (violationsCanvas && window.officerChartData) {
    const labels = window.officerChartData.violationsLabels || [];
    const counts = window.officerChartData.violationsCounts || [];

    new Chart(violationsCanvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Detected Infractions",
            data: counts,
            backgroundColor: "rgba(220, 38, 38, 0.8)",
            borderColor: "#dc2626",
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 10 } }
          },
          y: {
            ticks: { font: { size: 10 } }
          }
        }
      }
    });
  }

  // 3. Inspection Queue Filter
  const queueSearchInput = document.getElementById("queueSearchInput");
  const queueStatusFilter = document.getElementById("queueStatusFilter");

  function filterQueue() {
    const term = (queueSearchInput ? queueSearchInput.value : "").toLowerCase();
    const status = queueStatusFilter ? queueStatusFilter.value : "ALL";

    document.querySelectorAll(".queue-row").forEach((row) => {
      const text = row.innerText.toLowerCase();
      const rowStatus = row.getAttribute("data-status");
      const matchesSearch = text.includes(term);
      const matchesStatus = status === "ALL" || rowStatus === status;

      if (matchesSearch && matchesStatus) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    });
  }

  if (queueSearchInput) queueSearchInput.addEventListener("input", filterQueue);
  if (queueStatusFilter) queueStatusFilter.addEventListener("change", filterQueue);
});

