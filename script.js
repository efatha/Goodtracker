const form = document.getElementById("form");
const desc = document.getElementById("desc");
const customer = document.getElementById("customer");
const amount = document.getElementById("amount");
const type = document.getElementById("type");
const history = document.getElementById("history");
const filterDate = document.getElementById("filterDate");

let records = JSON.parse(localStorage.getItem("goodsRecords")) || [];

form.addEventListener("submit", e => {
  e.preventDefault();
  const record = {
    id: Date.now(),
    desc: desc.value,
    customer: customer.value || "N/A",
    amount: +amount.value,
    type: type.value,
    date: new Date().toISOString().split("T")[0]
  };
  records.push(record);
  localStorage.setItem("goodsRecords", JSON.stringify(records));
  render();
  form.reset();
});

filterDate.addEventListener("change", render);

function removeRecord(id) {
  records = records.filter(r => r.id !== id);
  localStorage.setItem("goodsRecords", JSON.stringify(records));
  render();
}

function render() {
  history.innerHTML = "";

  const dateFilter = filterDate.value;
  const filtered = dateFilter
    ? records.filter(r => r.date === dateFilter)
    : records;

  let sales = 0, purchases = 0, expenses = 0;

  filtered.forEach(rec => {
    const li = document.createElement("li");
    li.classList.add(rec.type);
    li.innerHTML = `
      [${rec.date}] ${rec.desc} (${rec.customer}): $${rec.amount.toFixed(2)}
      <button class="delete-btn" onclick="removeRecord(${rec.id})">x</button>
    `;
    history.appendChild(li);

    if (rec.type === "sale") sales += rec.amount;
    if (rec.type === "purchase") purchases += rec.amount;
    if (rec.type === "expense") expenses += rec.amount;
  });

  const calculatedProfit = sales - (purchases + expenses);
  const balance = calculatedProfit;

  document.getElementById("totalSales").textContent = `$${sales.toFixed(2)}`;
  document.getElementById("totalPurchases").textContent = `$${purchases.toFixed(2)}`;
  document.getElementById("totalExpenses").textContent = `$${expenses.toFixed(2)}`;
  document.getElementById("profit").textContent = `$${calculatedProfit.toFixed(2)}`;
  document.getElementById("balance").textContent = `$${balance.toFixed(2)}`;
}

render();


// Utils file
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
