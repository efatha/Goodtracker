const STORAGE_KEY = "goodsRecords";
const SETTINGS_KEY = "goodsTrackerSettings";
const STOCK_KEY = "goodsStockItems";
const STOCK_MOVEMENTS_KEY = "goodsStockMovements";
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
let stockItems = readStorage(STOCK_KEY, []);
if (!Array.isArray(stockItems)) stockItems = [];
stockItems = stockItems.filter(item => item && typeof item.name === "string" && typeof item.unit === "string").map(item => ({
  ...item,
  id: item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: item.name,
  unit: item.unit,
  baseStock: item.baseStock == null
    ? (Number(item.opening) || 0) + (Number(item.purchased) || 0) - (Number(item.sold) || 0) - (Number(item.damaged) || 0)
    : Number(item.baseStock) || 0,
  purchased: Math.max(0, Number(item.purchased) || 0),
  sold: Math.max(0, Number(item.sold) || 0),
  damaged: Math.max(0, Number(item.damaged) || 0)
}));
let stockMovements = readStorage(STOCK_MOVEMENTS_KEY, []);
if (!Array.isArray(stockMovements)) stockMovements = [];
stockMovements = stockMovements.filter(entry => entry && entry.itemId != null && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)).map(entry => ({
  ...entry,
  purchased: Math.max(0, Number(entry.purchased) || 0),
  sold: Math.max(0, Number(entry.sold) || 0),
  damaged: Math.max(0, Number(entry.damaged) || 0)
}));
let editingId = null;

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveStockItems() {
  localStorage.setItem(STOCK_KEY, JSON.stringify(stockItems));
}

function saveStockMovements() {
  localStorage.setItem(STOCK_MOVEMENTS_KEY, JSON.stringify(stockMovements));
}

function stockOpening(item, date) {
  return stockMovements
    .filter(entry => entry.itemId === item.id && entry.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((balance, entry) => balance + entry.purchased - entry.sold - entry.damaged, item.baseStock);
}

function stockClosing(item, date, movement) {
  return stockOpening(item, date) + movement.purchased - movement.sold - movement.damaged;
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

function renderStock() {
  const body = document.getElementById("stockHistory");
  body.replaceChildren();
  const query = document.getElementById("stockSearch").value.trim().toLocaleLowerCase();
  const visibleItems = stockItems.filter(item => item.name.toLocaleLowerCase().includes(query));
  const selectedDate = document.getElementById("stockDate").value || localDate(today);
  const todayEntries = new Map(stockMovements.filter(entry => entry.date === selectedDate).map(entry => [entry.itemId, entry]));
  const needsAttention = visibleItems.filter(item => {
    const movement = todayEntries.get(item.id) || { purchased: 0, sold: 0, damaged: 0 };
    return stockClosing(item, selectedDate, movement) <= 0;
  }).length;
  document.getElementById("stockSummary").textContent = stockItems.length
    ? query
      ? `${visibleItems.length} of ${stockItems.length} items match`
      : `${stockItems.length} item${stockItems.length === 1 ? "" : "s"} tracked · ${needsAttention} out of stock or short on ${selectedDate}`
    : "No items tracked";
  const itemById = new Map(stockItems.map(item => [item.id, item]));
  const visibleItemIds = new Set(visibleItems.map(item => item.id));
  const entries = stockMovements.filter(entry => visibleItemIds.has(entry.itemId)).map(entry => ({ ...entry, preview: false }));
  for (const item of visibleItems) {
    if (!todayEntries.has(item.id)) entries.push({ itemId: item.id, date: selectedDate, purchased: 0, sold: 0, damaged: 0, preview: true });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || itemById.get(a.itemId).name.localeCompare(itemById.get(b.itemId).name));
  const emptyState = document.getElementById("stockEmptyState");
  emptyState.hidden = entries.length > 0;
  document.getElementById("stockEmptyTitle").textContent = query && stockItems.length
    ? "No matching item"
    : "No items tracked yet";
  document.getElementById("stockEmptyMessage").textContent = query && stockItems.length
    ? `No stock item name contains "${document.getElementById("stockSearch").value.trim()}".`
    : "Add an item above to start counting stock.";

  for (const entry of entries) {
    const item = itemById.get(entry.itemId);
    const opening = stockOpening(item, entry.date);
    const remaining = opening + entry.purchased - entry.sold - entry.damaged;
    const row = document.createElement("tr");
    if (entry.preview) row.classList.add("stock-row-preview");
    if (remaining < 0) row.classList.add("stock-row-short");
    addCell(row, new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
    const nameCell = addCell(row, "", "stock-item-name");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const unit = document.createElement("small");
    unit.textContent = `Counted in ${item.unit}`;
    nameCell.append(name, unit);
    addCell(row, opening.toLocaleString());
    addCell(row, entry.purchased.toLocaleString());
    addCell(row, entry.sold.toLocaleString());
    addCell(row, entry.damaged.toLocaleString());
    addCell(row, `${remaining.toLocaleString()} ${item.unit}`, "stock-remaining");
    const status = document.createElement("span");
    status.className = `stock-status ${remaining < 0 ? "stock-status-short" : remaining === 0 ? "stock-status-empty" : "stock-status-ok"}`;
    status.textContent = remaining < 0 ? `Short by ${Math.abs(remaining).toLocaleString()}` : remaining === 0 ? "Out of stock" : "In stock";
    addCell(row, "").appendChild(status);
    const actions = document.createElement("td");
    actions.className = "row-actions";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "row-action delete-action";
    removeButton.title = "Remove item and all daily counts";
    removeButton.setAttribute("aria-label", `Remove ${item.name} and all its daily counts`);
    removeButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
    removeButton.addEventListener("click", () => {
      if (!window.confirm(`Remove ${item.name} and all its daily stock counts?`)) return;
      stockItems = stockItems.filter(current => current.id !== item.id);
      stockMovements = stockMovements.filter(current => current.itemId !== item.id);
      saveStockItems();
      saveStockMovements();
      renderStock();
    });
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "row-action";
    editButton.title = "Edit daily count";
    editButton.setAttribute("aria-label", `Edit ${item.name} count for ${entry.date}`);
    editButton.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    editButton.addEventListener("click", () => {
      document.getElementById("stockDate").value = entry.date;
      document.getElementById("stockName").value = item.name;
      document.getElementById("stockUnit").value = item.unit;
      document.getElementById("stockOpening").value = "";
      document.getElementById("stockPurchased").value = entry.purchased;
      document.getElementById("stockSold").value = entry.sold;
      document.getElementById("stockDamaged").value = entry.damaged;
      renderStock();
      document.getElementById("stockName").focus();
    });
    actions.append(editButton, removeButton);
    row.appendChild(actions);
    body.appendChild(row);
  }
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
  renderStock();
}

document.getElementById("stockForm").addEventListener("submit", event => {
  event.preventDefault();
  const date = document.getElementById("stockDate").value;
  const name = document.getElementById("stockName").value.trim();
  const unit = document.getElementById("stockUnit").value.trim();
  const openingInput = document.getElementById("stockOpening").value;
  const hasOpening = openingInput !== "";
  const opening = Number(openingInput) || 0;
  const purchased = Number(document.getElementById("stockPurchased").value) || 0;
  const sold = Number(document.getElementById("stockSold").value) || 0;
  const damaged = Number(document.getElementById("stockDamaged").value) || 0;
  if (!date || !name || !unit || opening < 0 || purchased < 0 || sold < 0 || damaged < 0) return;

  const existing = stockItems.find(item =>
    item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.unit.toLocaleLowerCase() === unit.toLocaleLowerCase()
  );
  const existingMovement = existing && stockMovements.find(entry => entry.itemId === existing.id && entry.date === date);
  if (!existing && opening + purchased + sold + damaged === 0) return;
  if (existing && !hasOpening && !existingMovement && purchased + sold + damaged === 0) return;
  const item = existing || { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, unit, baseStock: opening };
  if (!existing) stockItems.push(item);
  if (hasOpening) item.baseStock = opening;
  const movement = {
    id: existingMovement?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: item.id,
    date,
    purchased,
    sold,
    damaged
  };
  if (existingMovement) stockMovements = stockMovements.map(entry => entry.id === existingMovement.id ? movement : entry);
  else stockMovements.push(movement);
  saveStockItems();
  saveStockMovements();
  document.getElementById("stockOpening").value = "";
  renderStock();
});

function loadStockDay() {
  const name = document.getElementById("stockName").value.trim().toLocaleLowerCase();
  const unit = document.getElementById("stockUnit").value.trim().toLocaleLowerCase();
  const date = document.getElementById("stockDate").value;
  const item = stockItems.find(current => current.name.toLocaleLowerCase() === name && current.unit.toLocaleLowerCase() === unit);
  const movement = item && stockMovements.find(entry => entry.itemId === item.id && entry.date === date);
  if (!movement) {
    document.getElementById("stockOpening").value = "";
    for (const id of ["stockPurchased", "stockSold", "stockDamaged"]) document.getElementById(id).value = "";
    return;
  }
  document.getElementById("stockOpening").value = "";
  document.getElementById("stockPurchased").value = movement.purchased;
  document.getElementById("stockSold").value = movement.sold;
  document.getElementById("stockDamaged").value = movement.damaged;
}

for (const id of ["stockName", "stockUnit"]) document.getElementById(id).addEventListener("change", loadStockDay);
document.getElementById("stockDate").addEventListener("change", () => {
  loadStockDay();
  renderStock();
});
document.getElementById("stockSearch").addEventListener("input", renderStock);

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
  const backup = { version: 5, exportedAt: new Date().toISOString(), records, stockItems, stockMovements, settings };
  downloadFile("Goodtracker-backup.json", JSON.stringify(backup, null, 2), "application/json");
});

document.getElementById("restoreBtn").addEventListener("click", () => document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const importedRecords = Array.isArray(parsed) ? parsed : parsed.records;
    const importedStockItems = Array.isArray(parsed) ? [] : parsed.stockItems ?? [];
    const importedStockMovements = Array.isArray(parsed) ? [] : parsed.stockMovements ?? [];
    const validTypes = new Set(["sale", "purchase", "expense"]);
    if (!Array.isArray(importedRecords) || importedRecords.some(record =>
      !record || typeof record !== "object" || !validTypes.has(record.type) ||
      !Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0 ||
      (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date))
    )) {
      throw new Error("This file does not contain a valid Goodtracker backup.");
    }
    if (!Array.isArray(importedStockItems) || importedStockItems.some(item =>
      !item || typeof item !== "object" || typeof item.name !== "string" || !item.name.trim() ||
      typeof item.unit !== "string" || !item.unit.trim() ||
      (item.opening != null && (!Number.isFinite(Number(item.opening)) || Number(item.opening) < 0)) ||
      [item.purchased, item.sold, item.damaged].some(value => !Number.isFinite(Number(value)) || Number(value) < 0)
    )) {
      throw new Error("This file contains invalid stock counts.");
    }
    const itemIds = new Set(importedStockItems.map(item => item.id));
    if (!Array.isArray(importedStockMovements) || importedStockMovements.some(entry =>
      !entry || typeof entry !== "object" || !itemIds.has(entry.itemId) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      [entry.purchased, entry.sold, entry.damaged].some(value => !Number.isFinite(Number(value)) || Number(value) < 0)
    )) {
      throw new Error("This file contains invalid dated stock counts.");
    }
    if (!window.confirm(`Restore ${importedRecords.length} records, ${importedStockItems.length} stock items and ${importedStockMovements.length} daily stock counts? This replaces the books currently in this browser.`)) return;
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
    stockItems = importedStockItems.map(item => ({
      ...item,
      id: item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: item.name.trim(),
      unit: item.unit.trim(),
      baseStock: item.baseStock == null
        ? (Number(item.opening) || 0) + (Number(item.purchased) || 0) - (Number(item.sold) || 0) - (Number(item.damaged) || 0)
        : Number(item.baseStock) || 0,
      purchased: Number(item.purchased) || 0,
      sold: Number(item.sold) || 0,
      damaged: Number(item.damaged) || 0
    }));
    stockMovements = importedStockMovements.map(entry => ({
      ...entry,
      id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      purchased: Number(entry.purchased) || 0,
      sold: Number(entry.sold) || 0,
      damaged: Number(entry.damaged) || 0
    }));
    if (parsed.settings && typeof parsed.settings === "object") settings = { ...settings, ...parsed.settings };
    saveRecords();
    saveStockItems();
    saveStockMovements();
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
  document.getElementById("stockDate").value = localDate(today);
  document.getElementById("openingBalance").value = Number(settings.openingBalance) || "";
  currencySelect.value = ["USD", "TZS", "KES", "UGX", "NGN", "GHS"].includes(settings.currency) ? settings.currency : "USD";
  settings.currency = currencySelect.value;
  applyTheme();
  updateTypeFields();
}

initializeControls();
render();
