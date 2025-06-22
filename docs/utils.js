const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const records = JSON.parse(localStorage.getItem("goodsRecords")) || [];
    const csv = records.map(r =>
      `${r.date},${r.desc},${r.customer},${r.amount},${r.type}`
    ).join("\n");
    const blob = new Blob(["Date,Description,Customer,Amount,Type\n" + csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Report.csv";
    a.click();
  });
}

const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
}
