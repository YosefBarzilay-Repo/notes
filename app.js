const SORT_KEY = "minimal-hebrew-task-sort";

const state = { tasks: [], sort: localStorage.getItem(SORT_KEY) || "created", search: "", editingId: null };
const elements = {
  taskList: document.querySelector("#taskList"), taskForm: document.querySelector("#taskForm"), titleInput: document.querySelector("#taskTitleInput"),
  searchInput: document.querySelector("#searchInput"), sortSelect: document.querySelector("#sortSelect"), editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"), editTitle: document.querySelector("#editTitleInput"), editDetails: document.querySelector("#editDetailsInput"),
  editDueDate: document.querySelector("#editDueDateInput"), deleteButton: document.querySelector("#deleteTaskButton"), closeDialog: document.querySelector("#closeDialogButton"),
  archiveButton: document.querySelector("#archiveButton"), archiveDialog: document.querySelector("#archiveDialog"), archiveList: document.querySelector("#archiveList"), closeArchive: document.querySelector("#closeArchiveButton"),
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "הפעולה נכשלה"); }
  return response.status === 204 ? null : response.json();
}

function normalize(value) { return String(value || "").trim().toLocaleLowerCase("he"); }
function createdAscending(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }
function dueDateValue(task) { return task.dueDate ? new Date(`${task.dueDate}T00:00:00`).getTime() : Number.POSITIVE_INFINITY; }
function normalizeDate(value) {
  if (!value) return "";
  const text = String(value);
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}
function normalizeTask(task) { return { ...task, dueDate: normalizeDate(task.dueDate), archived: task.archived === true || task.archived === "true" || task.archived === 1 }; }
function formatDate(isoDate) { const normalized = normalizeDate(isoDate); if (!normalized) return "ללא תאריך"; const [year, month, day] = normalized.split("-"); return `${day}.${month}.${year}`; }

function visibleTasks() {
  const query = normalize(state.search);
  return state.tasks
    .filter((task) => !task.archived)
    .filter((task) => !query || normalize(`${task.title} ${task.details}`).includes(query));
}

function render() {
  const tasks = visibleTasks().sort((a, b) => state.sort === "created" ? createdAscending(a, b) : dueDateValue(a) - dueDateValue(b) || createdAscending(a, b));
  elements.taskList.replaceChildren();
  if (!tasks.length) { const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = state.search ? "לא נמצאו משימות תואמות" : "אין עדיין משימות"; elements.taskList.append(empty); return; }
  if (state.sort === "due") {
    const groups = new Map();
    tasks.forEach((task) => { const key = task.dueDate || ""; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(task); });
    groups.forEach((group, dueDate) => { const heading = document.createElement("div"); heading.className = "date-heading"; heading.textContent = formatDate(dueDate); elements.taskList.append(heading); group.forEach((task) => elements.taskList.append(taskRow(task))); });
  } else tasks.forEach((task) => elements.taskList.append(taskRow(task)));
}

function taskRow(task) {
  const row = document.createElement("article"); row.className = "task-row"; row.addEventListener("click", () => openEditor(task));
  const checkbox = document.createElement("input"); checkbox.className = "task-check"; checkbox.type = "checkbox"; checkbox.setAttribute("aria-label", `השלמת ${task.title}`); checkbox.addEventListener("click", (event) => event.stopPropagation()); checkbox.addEventListener("change", () => archiveTask(task.id));
  const copy = document.createElement("div"); copy.className = "task-copy";
  const title = document.createElement("span"); title.className = "task-title"; title.textContent = task.title; copy.append(title);
  if (task.details) { const details = document.createElement("span"); details.className = "task-details"; details.textContent = task.details; copy.append(details); }
  if (task.dueDate) { const due = document.createElement("span"); due.className = "task-due"; due.textContent = formatDate(task.dueDate); copy.append(due); }
  row.append(checkbox, copy); return row;
}

async function addTask(event) {
  event.preventDefault(); const title = elements.titleInput.value.trim(); if (!title) return elements.titleInput.focus();
  try { const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title }) }); state.tasks.push(normalizeTask(task)); elements.titleInput.value = ""; render(); } catch (error) { showError(error); }
  elements.titleInput.focus();
}

async function archiveTask(id) {
  try { const updated = await api(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ archived: true }) }); state.tasks = state.tasks.map((task) => task.id === updated.id ? normalizeTask(updated) : task); render(); }
  catch (error) { showError(error); render(); }
}

function openEditor(task) { state.editingId = task.id; elements.editTitle.value = task.title; elements.editDetails.value = task.details || ""; elements.editDueDate.value = task.dueDate || ""; elements.editDialog.showModal(); elements.editTitle.focus(); }

async function saveEditor(event) {
  event.preventDefault(); const title = elements.editTitle.value.trim(); if (!title) return elements.editTitle.focus();
  try { const updated = await api(`/api/tasks/${encodeURIComponent(state.editingId)}`, { method: "PATCH", body: JSON.stringify({ title, details: elements.editDetails.value.trim(), dueDate: elements.editDueDate.value }) }); state.tasks = state.tasks.map((task) => task.id === updated.id ? normalizeTask(updated) : task); closeEditor(); render(); }
  catch (error) { showError(error); }
}

function closeEditor() { state.editingId = null; elements.editDialog.close(); }
async function deleteEditingTask() {
  if (!state.editingId) return;
  try { await api(`/api/tasks/${encodeURIComponent(state.editingId)}`, { method: "DELETE" }); state.tasks = state.tasks.filter((task) => task.id !== state.editingId); closeEditor(); render(); } catch (error) { showError(error); }
}

function renderArchive() {
  const archived = state.tasks.filter((task) => task.archived).sort(createdAscending); elements.archiveList.replaceChildren();
  if (!archived.length) { const empty = document.createElement("p"); empty.className = "archive-empty"; empty.textContent = "הארכיון ריק"; elements.archiveList.append(empty); return; }
  archived.forEach((task) => { const item = document.createElement("div"); item.className = "archived-row"; const button = document.createElement("button"); button.type = "button"; button.innerHTML = `<span class="archived-title"></span><span class="archived-meta">${task.dueDate ? formatDate(task.dueDate) : "ללא תאריך"}</span>`; button.querySelector(".archived-title").textContent = task.title; button.addEventListener("click", () => { elements.archiveDialog.close(); openEditor(task); }); item.append(button); elements.archiveList.append(item); });
}

function showError(error) { elements.taskList.replaceChildren(); const message = document.createElement("p"); message.className = "empty-state"; message.textContent = error.message || "לא ניתן להתחבר לשרת"; elements.taskList.append(message); }

async function initialize() { elements.sortSelect.value = state.sort; try { state.tasks = (await api("/api/tasks")).map(normalizeTask); render(); } catch (error) { showError(error); } elements.titleInput.focus(); }

elements.taskForm.addEventListener("submit", addTask);
elements.searchInput.addEventListener("input", () => { state.search = elements.searchInput.value; render(); });
elements.sortSelect.addEventListener("change", () => { state.sort = elements.sortSelect.value; localStorage.setItem(SORT_KEY, state.sort); render(); });
elements.editForm.addEventListener("submit", saveEditor); elements.deleteButton.addEventListener("click", deleteEditingTask); elements.closeDialog.addEventListener("click", closeEditor);
elements.editDialog.addEventListener("click", (event) => { if (event.target === elements.editDialog) closeEditor(); });
elements.archiveButton.addEventListener("click", () => { renderArchive(); elements.archiveDialog.showModal(); }); elements.closeArchive.addEventListener("click", () => elements.archiveDialog.close());
elements.archiveDialog.addEventListener("click", (event) => { if (event.target === elements.archiveDialog) elements.archiveDialog.close(); });
initialize();
