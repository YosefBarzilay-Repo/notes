const SORT_KEY = "minimal-hebrew-task-sort";
const SWIPE_TRIGGER_DISTANCE = 140;

const state = { tasks: [], sort: localStorage.getItem(SORT_KEY) || "created", search: "", editingId: null, page: window.location.hash === "#archive" ? "archive" : "tasks" };
const elements = {
  taskList: document.querySelector("#taskList"), taskForm: document.querySelector("#taskForm"), titleInput: document.querySelector("#taskTitleInput"),
  menuButton: document.querySelector("#menuButton"), sideMenu: document.querySelector("#sideMenu"), menuBackdrop: document.querySelector("#menuBackdrop"), closeMenuButton: document.querySelector("#closeMenuButton"), menuItems: document.querySelectorAll(".menu-item"), headerTools: document.querySelector(".header-tools"),
  searchInput: document.querySelector("#searchInput"), sortSelect: document.querySelector("#sortSelect"), editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"), editTitle: document.querySelector("#editTitleInput"), editDetails: document.querySelector("#editDetailsInput"),
  editDueDate: document.querySelector("#editDueDateInput"), closeDialog: document.querySelector("#closeDialogButton"),
};

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "הפעולה נכשלה"); }
  return response.status === 204 ? null : response.json();
}

function normalize(value) { return String(value || "").trim().toLocaleLowerCase("he"); }
function createdAscending(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }
function dueDateValue(task) { return task.dueDate ? new Date(`${task.dueDate}T00:00:00`).getTime() : Number.POSITIVE_INFINITY; }
function taskOrder(a, b) { return state.sort === "created" ? createdAscending(a, b) : dueDateValue(a) - dueDateValue(b) || createdAscending(a, b); }
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
  elements.headerTools.hidden = false;
  elements.searchInput.closest(".search-box").hidden = state.page === "archive";
  elements.taskForm.hidden = state.page === "archive";
  const tasks = visibleTasks().sort(taskOrder);
  elements.taskList.replaceChildren();
  if (state.page === "archive") return renderArchive();
  if (!tasks.length) { const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = state.search ? "לא נמצאו משימות תואמות" : "אין עדיין משימות"; elements.taskList.append(empty); return; }
  if (state.sort === "due") {
    const groups = new Map();
    tasks.forEach((task) => { const key = task.dueDate || ""; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(task); });
    groups.forEach((group, dueDate) => { const heading = document.createElement("div"); heading.className = "date-heading"; heading.textContent = formatDate(dueDate); elements.taskList.append(heading); group.forEach((task) => elements.taskList.append(taskRow(task))); });
  } else tasks.forEach((task) => elements.taskList.append(taskRow(task)));
}

function taskRow(task) {
  const container = document.createElement("div"); container.className = "swipe-container";
  const action = swipeAction("archive-action", "העברה לארכיון", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16M6 7.5v11h12v-11M9 11h6M5 4h14v3.5H5z"/></svg>`);
  const row = document.createElement("article"); row.className = "task-row"; addSwipeToArchive(container, row, task);
  row.addEventListener("click", () => openEditor(task));
  const copy = document.createElement("div"); copy.className = "task-copy";
  const title = document.createElement("span"); title.className = "task-title"; title.textContent = task.title; copy.append(title);
  if (task.dueDate) { const due = document.createElement("span"); due.className = "task-due"; due.textContent = formatDate(task.dueDate); copy.append(due); }
  row.append(copy); container.append(action, row); return container;
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
function renderArchive() {
  const archived = state.tasks.filter((task) => task.archived).sort(taskOrder);
  if (!archived.length) { const empty = document.createElement("p"); empty.className = "archive-empty"; empty.textContent = "הארכיון ריק"; elements.taskList.append(empty); return; }
  archived.forEach((task) => { const container = document.createElement("div"); container.className = "swipe-container"; const deleteAction = swipeAction("delete-action", "מחיקה", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 10v7M14 10v7M7 7l1 13h8l1-13M9 4h6l1 3H8l1-3z"/></svg>`); const restoreAction = swipeAction("restore-action", "החזרה למשימות", `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5M4.5 12A8 8 0 1 0 7 6.3"/></svg>`); const item = document.createElement("article"); item.className = "archived-row"; addSwipeToDelete(container, item, task); const button = document.createElement("button"); button.type = "button"; button.innerHTML = `<span class="archived-title"></span><span class="archived-meta">${task.dueDate ? formatDate(task.dueDate) : ""}</span>`; button.querySelector(".archived-title").textContent = task.title; button.addEventListener("click", () => openEditor(task)); item.append(button); container.append(deleteAction, restoreAction, item); elements.taskList.append(container); });
}

function swipeAction(className, label, icon) {
  const action = document.createElement("div"); action.className = `swipe-action ${className}`; action.setAttribute("aria-label", label); action.innerHTML = icon; return action;
}

function addSwipeToArchive(container, row, task) {
  let startX = 0; let startY = 0; let swiping = false;
  container.addEventListener("pointerdown", (event) => { startX = event.clientX; startY = event.clientY; swiping = false; container.setPointerCapture?.(event.pointerId); });
  container.addEventListener("pointermove", (event) => {
    const deltaX = Math.max(-180, Math.min(0, event.clientX - startX)); const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) { swiping = true; container.classList.add("swiping-left"); container.style.setProperty("--swipe-distance", `${deltaX}px`); container.querySelector(".archive-action").style.opacity = String(Math.min(1, Math.abs(deltaX) / 60)); }
  });
  container.addEventListener("pointerup", async (event) => {
    const deltaX = event.clientX - startX; const deltaY = event.clientY - startY;
    container.style.removeProperty("--swipe-distance"); container.classList.remove("swiping-left"); container.querySelector(".archive-action").style.removeProperty("opacity");
    if (deltaX <= -SWIPE_TRIGGER_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY)) { swiping = true; await archiveTask(task.id); }
    else swiping = false;
  });
  container.addEventListener("pointercancel", () => { container.style.removeProperty("--swipe-distance"); container.classList.remove("swiping-left"); container.querySelector(".archive-action").style.removeProperty("opacity"); swiping = false; });
  container.addEventListener("click", (event) => { if (swiping) { event.stopImmediatePropagation(); swiping = false; } }, true);
}

function addSwipeToDelete(container, row, task) {
  let startX = 0; let startY = 0; let swiping = false;
  container.addEventListener("pointerdown", (event) => { startX = event.clientX; startY = event.clientY; swiping = false; container.setPointerCapture?.(event.pointerId); });
  container.addEventListener("pointermove", (event) => {
    const deltaX = Math.max(-180, Math.min(180, event.clientX - startX)); const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) { swiping = true; container.classList.toggle("swiping-left", deltaX < 0); container.classList.toggle("swiping-right", deltaX > 0); container.style.setProperty("--swipe-distance", `${deltaX}px`); container.querySelector(".delete-action").style.opacity = deltaX < 0 ? String(Math.min(1, Math.abs(deltaX) / 60)) : "0"; container.querySelector(".restore-action").style.opacity = deltaX > 0 ? String(Math.min(1, deltaX / 60)) : "0"; }
  });
  container.addEventListener("pointerup", async (event) => {
    const deltaX = event.clientX - startX; const deltaY = event.clientY - startY;
    container.style.removeProperty("--swipe-distance"); container.classList.remove("swiping-left", "swiping-right"); container.querySelector(".delete-action").style.removeProperty("opacity"); container.querySelector(".restore-action").style.removeProperty("opacity");
    if (deltaX <= -SWIPE_TRIGGER_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY)) { swiping = true; try { await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" }); state.tasks = state.tasks.filter((item) => item.id !== task.id); render(); } catch (error) { showError(error); } }
    else if (deltaX >= SWIPE_TRIGGER_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY)) { swiping = true; try { const updated = await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ archived: false }) }); state.tasks = state.tasks.map((item) => item.id === task.id ? { ...item, ...normalizeTask(updated), archived: false } : item); render(); } catch (error) { showError(error); } }
    else swiping = false;
  });
  container.addEventListener("pointercancel", () => { container.style.removeProperty("--swipe-distance"); container.classList.remove("swiping-left", "swiping-right"); container.querySelector(".delete-action").style.removeProperty("opacity"); container.querySelector(".restore-action").style.removeProperty("opacity"); swiping = false; });
  container.addEventListener("click", (event) => { if (swiping) { event.stopImmediatePropagation(); swiping = false; } }, true);
}

function showError(error) { elements.taskList.replaceChildren(); const message = document.createElement("p"); message.className = "empty-state"; message.textContent = error.message || "לא ניתן להתחבר לשרת"; elements.taskList.append(message); }

function closeMenu() { elements.sideMenu.classList.remove("open"); elements.sideMenu.setAttribute("aria-hidden", "true"); elements.menuButton.setAttribute("aria-expanded", "false"); elements.menuBackdrop.hidden = true; }
function openMenu() { elements.sideMenu.classList.add("open"); elements.sideMenu.setAttribute("aria-hidden", "false"); elements.menuButton.setAttribute("aria-expanded", "true"); elements.menuBackdrop.hidden = false; }
async function selectPage(page) { state.page = page; window.history.pushState({}, "", state.page === "archive" ? "#archive" : window.location.pathname); closeMenu(); if (state.page === "tasks") { try { await loadTasks(); } catch (error) { showError(error); } } else render(); }

async function loadTasks() { state.tasks = (await api("/api/tasks")).map(normalizeTask); render(); }
async function initialize() { elements.sortSelect.value = state.sort; try { await loadTasks(); } catch (error) { showError(error); } elements.titleInput.focus(); }

elements.taskForm.addEventListener("submit", addTask);
elements.searchInput.addEventListener("input", () => { state.search = elements.searchInput.value; render(); });
elements.sortSelect.addEventListener("change", () => { state.sort = elements.sortSelect.value; localStorage.setItem(SORT_KEY, state.sort); render(); });
elements.editDetails.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && elements.editDetails.selectionStart === elements.editDetails.selectionEnd) {
    const cursor = elements.editDetails.selectionStart;
    const value = elements.editDetails.value;
    const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
    const linePrefix = value.slice(lineStart, cursor);
    const marker = linePrefix.match(/^(\s*)(•|\d+\.)\s/);
    if (marker) {
      const nextMarker = marker[2] === "•" ? "• " : `${Number.parseInt(marker[2], 10) + 1}. `;
      const insertion = `\n${marker[1]}${nextMarker}`;
      elements.editDetails.value = `${value.slice(0, cursor)}${insertion}${value.slice(cursor)}`;
      const nextCursor = cursor + insertion.length;
      elements.editDetails.setSelectionRange(nextCursor, nextCursor);
      event.preventDefault();
    }
    return;
  }
  if (event.key !== " " || elements.editDetails.selectionStart !== elements.editDetails.selectionEnd) return;
  const cursor = elements.editDetails.selectionStart;
  const lineStart = elements.editDetails.value.lastIndexOf("\n", cursor - 1) + 1;
  const linePrefix = elements.editDetails.value.slice(lineStart, cursor);
  const marker = linePrefix.match(/^(\s*)([-*]|\d+\.?)$/);
  if (!marker) return;
  const indent = marker[1];
  const replacement = /^[-*]$/.test(marker[2]) ? "• " : `${marker[2].replace(/\.$/, "")}. `;
  const value = elements.editDetails.value;
  elements.editDetails.value = `${value.slice(0, lineStart)}${indent}${replacement}${value.slice(cursor)}`;
  const nextCursor = lineStart + indent.length + replacement.length;
  elements.editDetails.setSelectionRange(nextCursor, nextCursor);
  event.preventDefault();
});
elements.editForm.addEventListener("submit", saveEditor); elements.closeDialog.addEventListener("click", closeEditor);
elements.editDialog.addEventListener("click", (event) => { if (event.target === elements.editDialog) closeEditor(); });
elements.menuButton.addEventListener("click", () => elements.sideMenu.classList.contains("open") ? closeMenu() : openMenu());
elements.closeMenuButton.addEventListener("click", closeMenu);
elements.menuBackdrop.addEventListener("click", closeMenu);
elements.menuItems.forEach((item) => item.addEventListener("click", () => selectPage(item.dataset.page)));
window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
window.addEventListener("popstate", () => { state.page = window.location.hash === "#archive" ? "archive" : "tasks"; render(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
initialize();
