const STORAGE_KEY = "goodsRecords";
const SETTINGS_KEY = "goodsTrackerSettings";
const form = document.getElementById("form");
const history = document.getElementById("history");
const recordType = document.getElementById("type");
const recordDate = document.getElementById("recordDate");
const amountInput = document.getElementById("amount");
const partyInput = document.getElementById("party");
const filterDate = document.getElementById("filterDate");
const reportMonth = document.getElementById("reportMonth");
const currencySelect = document.getElementById("currencySelect");
const expenseCategories = ["Rent", "Transport", "Utilities", "Wages", "Supplies", "Repairs", "Other"];
const today = new Date();
const localDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const currentMonth = monthKey(today);

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

let records = readStorage(STORAGE_KEY, []);
if (!Array.isArray(records)) records = [];
records = records.map(record => ({
  ...record,
  amount: Number(record.amount) || 0,
  date: record.date || currentMonth + "-01",
  party: record.party ?? record.customer ?? "",
  category: record.category || (record.type === "expense" ? "Other" : ""),
  purchaseKind: record.purchaseKind || (record.type === "purchase" ? "direct" : ""),
  paymentStatus: record.paymentStatus || "paid",
  paymentMethod: record.paymentMethod || "Cash",
  notes: record.notes || ""
}));
let settings = readStorage(SETTINGS_KEY, { openingBalance: 0, currency: "USD", dark: false });
if (!settings || typeof settings !== "object") settings = { openingBalance: 0, currency: "USD", dark: false };
let editingId = null;

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function money(value) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.currency || "USD",
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  } catch {
    return `${settings.currency || "USD"} ${(Number(value) || 0).toFixed(2)}`;
  }
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthMetrics(month) {
  const monthRecords = records.filter(record => record.date.slice(0, 7) === month);
  const sales = monthRecords.filter(record => record.type === "sale").reduce((sum, record) => sum + record.amount, 0);
  const directCosts = monthRecords.filter(record => record.type === "purchase" && record.purchaseKind === "direct").reduce((sum, record) => sum + record.amount, 0);
  const expenses = monthRecords.filter(record => record.type === "expense").reduce((sum, record) => sum + record.amount, 0);
  const paidOut = monthRecords.filter(record => record.type !== "sale" && record.paymentStatus === "paid").reduce((sum, record) => sum + record.amount, 0);
  const collected = monthRecords.filter(record => record.type === "sale" && record.paymentStatus === "paid").reduce((sum, record) => sum + record.amount, 0);
  return { records: monthRecords, sales, directCosts, expenses, gross: sales - directCosts, net: sales - directCosts - expenses, paidOut, collected };
}

function previousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthKey(new Date(year, monthNumber - 2, 1));
}

function setComparison(elementId, current, previous, lowerIsBetter = false) {
  const element = document.getElementById(elementId);
  const difference = current - previous;
  const direction = difference === 0 ? "steady" : difference > 0 ? "up" : "down";
  const favorable = difference === 0 || (lowerIsBetter ? difference < 0 : difference > 0);
  const percent = previous === 0 ? (current === 0 ? "0%" : "new") : `${Math.abs((difference / Math.abs(previous)) * 100).toFixed(0)}%`;
  element.className = `comparison ${direction} ${favorable ? "favorable" : "unfavorable"}`;
  element.textContent = previous === 0 && current !== 0
    ? `New this month - ${money(current)}`
    : `${difference > 0 ? "+" : difference < 0 ? "-" : ""}${money(Math.abs(difference))} (${percent}) vs previous`;
}

function updateTypeFields() {
  const isPurchase = recordType.value === "purchase";
  const isExpense = recordType.value === "expense";
  document.getElementById("purchaseFields").hidden = !isPurchase;
  document.getElementById("expenseFields").hidden = !isExpense;
  document.getElementById("partyLabel").textContent = recordType.value === "sale" ? "Customer" : recordType.value === "purchase" ? "Supplier" : "Paid to";
  partyInput.placeholder = recordType.value === "sale" ? "Customer name (optional)" : recordType.value === "purchase" ? "Supplier name (optional)" : "Payee (optional)";
}

function resetForm() {
  form.reset();
  recordDate.value = localDate(new Date());
  editingId = null;
  document.getElementById("submitLabel").textContent = "Add to books";
  document.getElementById("cancelEdit").hidden = true;
  updateTypeFields();
}

function fillRecordForm(record) {
  editingId = record.id;
  recordType.value = record.type;
  recordDate.value = record.date;
  document.getElementById("desc").value = record.desc;
  partyInput.value = record.party;
  amountInput.value = record.amount;
  document.getElementById("purchaseKind").value = record.purchaseKind || "direct";
  document.getElementById("category").value = expenseCategories.includes(record.category) ? record.category : "Other";
  document.getElementById("paymentStatus").value = record.paymentStatus;
  document.getElementById("paymentMethod").value = record.paymentMethod;
  document.getElementById("notes").value = record.notes;
  document.getElementById("submitLabel").textContent = "Save changes";
  document.getElementById("cancelEdit").hidden = false;
  updateTypeFields();
  document.getElementById("entryTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

function addCell(row, text, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function renderHistory() {
  history.replaceChildren();
  const query = document.getElementById("searchRecords").value.trim().toLocaleLowerCase();
  const date = filterDate.value;
  const filtered = records.filter(record => {
    const content = [record.desc, record.party, record.category, record.notes, record.type].join(" ").toLocaleLowerCase();
    return (!date || record.date === date) && (!query || content.includes(query));
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));

  for (const record of filtered) {
    const row = document.createElement("tr");
    const typeLabel = record.type === "sale" ? "Sale" : record.type === "purchase" ? "Purchase" : "Expense";
    const detail = record.type === "purchase"
      ? (record.purchaseKind === "inventory" ? "Inventory stock" : "Direct cost")
      : record.type === "expense" ? record.category || "Other" : "Sales";
    addCell(row, new Date(`${record.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
    const descriptionCell = addCell(row, "", "record-description");
    const description = document.createElement("strong");
    description.textContent = record.desc;
    const subline = document.createElement("small");
    subline.textContent = `${typeLabel} - ${record.paymentMethod || "Cash"}${record.notes ? ` - ${record.notes}` : ""}`;
    descriptionCell.append(description, subline);
    addCell(row, `${detail}${record.party ? ` - ${record.party}` : ""}`);
    const status = document.createElement("span");
    status.className = `status-pill ${record.paymentStatus === "paid" ? "status-paid" : "status-unpaid"}`;
    status.textContent = record.paymentStatus === "paid" ? "Paid" : "Due";
    addCell(row, "").appendChild(status);
    addCell(row, `${record.type === "sale" ? "+" : "-"}${money(record.amount)}`, `amount-column amount-${record.type}`);
    const actions = document.createElement("td");
    actions.className = "row-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "row-action";
    editButton.title = "Edit record";
    editButton.setAttribute("aria-label", `Edit ${record.desc}`);
    editButton.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    editButton.addEventListener("click", () => fillRecordForm(record));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "row-action delete-action";
    deleteButton.title = "Delete record";
    deleteButton.setAttribute("aria-label", `Delete ${record.desc}`);
    deleteButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(`Delete "${record.desc}" from the books?`)) return;
      records = records.filter(item => item.id !== record.id);
      saveRecords();
      render();
    });
    actions.append(editButton, deleteButton);
    row.appendChild(actions);
    history.appendChild(row);
  }
  document.getElementById("emptyState").hidden = filtered.length !== 0;
}

function renderComparisonChart(selectedMonth) {
  const chart = document.getElementById("comparisonChart");
  chart.replaceChildren();
  const [year, month] = selectedMonth.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => monthKey(new Date(year, month - 6 + index, 1)));
  const maxValue = Math.max(1, ...months.flatMap(key => {
    const metrics = monthMetrics(key);
    return [metrics.sales, metrics.paidOut];
  }));

  for (const key of months) {
    const metrics = monthMetrics(key);
    const group = document.createElement("div");
    group.className = "chart-month";
    group.title = `${monthLabel(key)}: sales ${money(metrics.sales)}, paid out ${money(metrics.paidOut)}`;
    const bars = document.createElement("div");
    bars.className = "chart-bars";
    for (const [value, className, label] of [[metrics.sales, "bar-sales", "Sales"], [metrics.paidOut, "bar-outflow", "Paid out"]]) {
      const bar = document.createElement("span");
      bar.className = `chart-bar ${className}`;
      bar.style.height = `${Math.max(value > 0 ? 4 : 0, value / maxValue * 100)}%`;
      bar.setAttribute("aria-label", `${label}: ${money(value)}`);
      bars.appendChild(bar);
    }
    const label = document.createElement("span");
    label.className = "chart-month-label";
    label.textContent = new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: "short" });
    group.append(bars, label);
    chart.appendChild(group);
  }
}

function renderExpenseBreakdown(metrics, month) {
  const container = document.getElementById("expenseBreakdown");
  container.replaceChildren();
  document.getElementById("expensePeriodLabel").textContent = monthLabel(month);
  const totals = new Map();
  for (const record of metrics.records.filter(item => item.type === "expense")) {
    const category = record.category || "Other";
    totals.set(category, (totals.get(category) || 0) + record.amount);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "No operating expenses recorded for this month.";
    container.appendChild(empty);
    return;
  }
  for (const [category, total] of sorted) {
    const line = document.createElement("div");
    line.className = "expense-line";
    const label = document.createElement("div");
    label.className = "expense-line-label";
    const name = document.createElement("span");
    name.textContent = category;
    const value = document.createElement("strong");
    value.textContent = money(total);
    label.append(name, value);
    const track = document.createElement("div");
    track.className = "expense-track";
    const fill = document.createElement("span");
    fill.style.width = `${metrics.expenses ? total / metrics.expenses * 100 : 0}%`;
    track.appendChild(fill);
    line.append(label, track);
    container.appendChild(line);
  }
}

function renderHighlights(metrics, previous, month) {
  const note = document.getElementById("smartNote");
  const message = note.querySelector("span");
  const topExpense = [...new Set(metrics.records.filter(record => record.type === "expense").map(record => record.category || "Other"))]
    .map(category => ({ category, amount: metrics.records.filter(record => record.type === "expense" && (record.category || "Other") === category).reduce((sum, record) => sum + record.amount, 0) }))
    .sort((a, b) => b.amount - a.amount)[0];
  const unpaid = metrics.records.filter(record => record.paymentStatus === "unpaid").reduce((sum, record) => sum + record.amount, 0);
  if (metrics.records.length === 0) {
    message.textContent = `No entries for ${monthLabel(month)} yet. Add today's sales, purchases and expenses to build your report.`;
  } else if (unpaid > 0) {
    message.textContent = `${money(unpaid)} is still due this month. Follow up on unpaid customer sales or supplier bills.`;
  } else if (topExpense && previous.expenses > 0 && metrics.expenses > previous.expenses) {
    message.textContent = `Expenses are ${money(metrics.expenses - previous.expenses)} above last month. ${topExpense.category} is the largest category at ${money(topExpense.amount)}.`;
  } else if (topExpense) {
    message.textContent = `${topExpense.category} is your largest operating expense this month at ${money(topExpense.amount)}.`;
  } else {
    message.textContent = `No operating expenses recorded for ${monthLabel(month)}. Remember to enter small daily costs too.`;
  }
}

function renderDashboard() {
  const month = reportMonth.value || currentMonth;
  const current = monthMetrics(month);
  const previous = monthMetrics(previousMonth(month));
  document.getElementById("revenueValue").textContent = money(current.sales);
  document.getElementById("grossValue").textContent = money(current.gross);
  document.getElementById("expenseValue").textContent = money(current.expenses);
  document.getElementById("netValue").textContent = money(current.net);
  setComparison("revenueChange", current.sales, previous.sales);
  setComparison("grossChange", current.gross, previous.gross);
  setComparison("expenseChange", current.expenses, previous.expenses, true);
  setComparison("netChange", current.net, previous.net);
  const lifetimeCashMovement = records.reduce((sum, record) => {
    if (record.paymentStatus !== "paid") return sum;
    return sum + (record.type === "sale" ? record.amount : -record.amount);
  }, 0);
  document.getElementById("cashBalance").textContent = money((Number(settings.openingBalance) || 0) + lifetimeCashMovement);
  renderComparisonChart(month);
  renderExpenseBreakdown(current, month);
  renderHighlights(current, previous, month);
}

function render() {
  renderDashboard();
  renderHistory();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const record = {
    id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: recordDate.value,
    desc: document.getElementById("desc").value.trim(),
    party: partyInput.value.trim(),
    amount: Number(amountInput.value),
    type: recordType.value,
    category: recordType.value === "expense" ? document.getElementById("category").value : "",
    purchaseKind: recordType.value === "purchase" ? document.getElementById("purchaseKind").value : "",
    paymentStatus: document.getElementById("paymentStatus").value,
    paymentMethod: document.getElementById("paymentMethod").value,
    notes: document.getElementById("notes").value.trim()
  };
  if (!record.desc || !record.date || !Number.isFinite(record.amount) || record.amount <= 0) return;
  if (editingId === null) records.push(record);
  else records = records.map(item => item.id === editingId ? record : item);
  saveRecords();
  resetForm();
  render();
});

recordType.addEventListener("change", updateTypeFields);
document.getElementById("cancelEdit").addEventListener("click", resetForm);
filterDate.addEventListener("change", renderHistory);
document.getElementById("searchRecords").addEventListener("input", renderHistory);
reportMonth.addEventListener("change", render);
document.getElementById("openingBalance").addEventListener("change", event => {
  settings.openingBalance = Number(event.target.value) || 0;
  saveSettings();
  renderDashboard();
});
currencySelect.addEventListener("change", event => {
  settings.currency = event.target.value;
  saveSettings();
  render();
});

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let safeValue = String(value ?? "");
  if (/^[\t\r=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

document.getElementById("exportBtn").addEventListener("click", () => {
  const columns = ["Date", "Type", "Description", "Customer or supplier", "Amount", "Category", "Purchase treatment", "Payment status", "Payment method", "Notes"];
  const rows = records.map(record => [record.date, record.type, record.desc, record.party, record.amount, record.category, record.purchaseKind, record.paymentStatus, record.paymentMethod, record.notes]);
  const csv = [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  downloadFile("Goodtracker-ledger.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
});

document.getElementById("backupBtn").addEventListener("click", () => {
  const backup = { version: 2, exportedAt: new Date().toISOString(), records, settings };
  downloadFile("Goodtracker-backup.json", JSON.stringify(backup, null, 2), "application/json");
});

document.getElementById("restoreBtn").addEventListener("click", () => document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const importedRecords = Array.isArray(parsed) ? parsed : parsed.records;
    const validTypes = new Set(["sale", "purchase", "expense"]);
    if (!Array.isArray(importedRecords) || importedRecords.some(record =>
      !record || typeof record !== "object" || !validTypes.has(record.type) ||
      !Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0 ||
      (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date))
    )) {
      throw new Error("This file does not contain a valid Goodtracker backup.");
    }
    if (!window.confirm(`Restore ${importedRecords.length} records? This replaces the records currently in this browser.`)) return;
    records = importedRecords.map(record => ({
      ...record,
      id: record.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount: Number(record.amount),
      date: record.date || currentMonth + "-01",
      party: record.party ?? record.customer ?? "",
      category: record.category || (record.type === "expense" ? "Other" : ""),
      purchaseKind: record.purchaseKind || (record.type === "purchase" ? "direct" : ""),
      paymentStatus: record.paymentStatus || "paid",
      paymentMethod: record.paymentMethod || "Cash",
      notes: record.notes || ""
    }));
    if (parsed.settings && typeof parsed.settings === "object") settings = { ...settings, ...parsed.settings };
    saveRecords();
    saveSettings();
    initializeControls();
    render();
  } catch (error) {
    window.alert(error.message || "Could not read that backup file.");
  } finally {
    event.target.value = "";
  }
});

document.getElementById("themeToggle").addEventListener("click", () => {
  settings.dark = !settings.dark;
  saveSettings();
  applyTheme();
});

function applyTheme() {
  document.body.classList.toggle("dark", Boolean(settings.dark));
  document.querySelector("#themeToggle i").className = settings.dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

function initializeControls() {
  reportMonth.value = currentMonth;
  recordDate.value = localDate(today);
  document.getElementById("openingBalance").value = Number(settings.openingBalance) || "";
  currencySelect.value = ["USD", "TZS", "KES", "UGX", "NGN", "GHS"].includes(settings.currency) ? settings.currency : "USD";
  settings.currency = currencySelect.value;
  applyTheme();
  updateTypeFields();
}

initializeControls();
render();
