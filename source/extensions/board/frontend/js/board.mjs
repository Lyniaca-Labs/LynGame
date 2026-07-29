import { createCard, createColumn, createBoard, listBoards, loadBoard, saveBoard, deleteBoard } from "./store.mjs";
import { moveItem } from "./reorder.mjs";

export function initBoardApp(els) {
  const state = {
    project: els.project,
    boards: [],
    board: null,
    saveTimer: null,
  };

  let dragCard = null;
  let dragColumnId = null;

  if (!state.project) {
    els.main.innerHTML = '<p style="padding:16px;color:var(--text-faint)">No project — open this from the editor.</p>';
    return;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showError(err, retry) {
    els.errorText.textContent = err instanceof Error ? err.message : String(err);
    els.errorBanner.style.display = "flex";
    els.errorRetry.onclick = () => { els.errorBanner.style.display = "none"; retry(); };
    els.errorDismiss.onclick = () => { els.errorBanner.style.display = "none"; };
  }

  // Native window.confirm()/prompt() silently no-op in this app's
  // sandboxed iframe (no allow-modals) — these render custom in-page
  // overlays instead.
  function showConfirm(message) {
    return new Promise((resolve) => {
      els.overlayRoot.innerHTML = `
        <div class="overlay">
          <div class="panel">
            <p>${escapeHtml(message)}</p>
            <div class="panel-actions">
              <div></div>
              <div>
                <button id="confirmNo">Cancel</button>
                <button id="confirmYes" class="danger">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const close = (result) => { els.overlayRoot.innerHTML = ""; resolve(result); };
      els.overlayRoot.querySelector("#confirmNo").addEventListener("click", () => close(false));
      els.overlayRoot.querySelector("#confirmYes").addEventListener("click", () => close(true));
    });
  }

  function showPrompt(message, defaultValue) {
    return new Promise((resolve) => {
      els.overlayRoot.innerHTML = `
        <div class="overlay">
          <div class="panel">
            <p>${escapeHtml(message)}</p>
            <input type="text" id="promptInput" value="${escapeHtml(defaultValue ?? "")}" />
            <div class="panel-actions">
              <div></div>
              <div>
                <button id="promptCancel">Cancel</button>
                <button id="promptOk" class="primary">OK</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const input = els.overlayRoot.querySelector("#promptInput");
      input.focus();
      input.select();
      const close = (result) => { els.overlayRoot.innerHTML = ""; resolve(result); };
      els.overlayRoot.querySelector("#promptCancel").addEventListener("click", () => close(null));
      els.overlayRoot.querySelector("#promptOk").addEventListener("click", () => close(input.value));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") close(input.value); });
    });
  }

  function setStatus(text) {
    const el = els.header.querySelector(".status");
    if (el) el.textContent = text;
  }

  function scheduleSave() {
    setStatus("Saving…");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveBoard(state.project, state.board)
        .then(() => setStatus("Saved"))
        .catch((err) => showError(err, scheduleSave));
    }, 500);
  }

  function findColumn(columnId) {
    return state.board.columns.find((c) => c.id === columnId);
  }

  function moveCard(fromColumnId, cardId, toColumnId, toIndex) {
    const fromColumn = findColumn(fromColumnId);
    const cardIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
    if (cardIndex < 0) return;

    if (fromColumnId === toColumnId) {
      const adjustedIndex = toIndex > cardIndex ? toIndex - 1 : toIndex;
      fromColumn.cards = moveItem(fromColumn.cards, cardIndex, adjustedIndex);
    } else {
      const [card] = fromColumn.cards.splice(cardIndex, 1);
      findColumn(toColumnId).cards.splice(toIndex, 0, card);
    }
    scheduleSave();
    renderColumns();
  }

  function attachCardDragHandlers() {
    els.main.querySelectorAll('[data-role="card"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        dragCard = { columnId: el.dataset.columnId, cardId: el.dataset.cardId };
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        dragCard = null;
      });
    });

    els.main.querySelectorAll('[data-role="column-body"]').forEach((body) => {
      body.addEventListener("dragover", (e) => {
        if (dragCard) e.preventDefault();
      });
      body.addEventListener("drop", (e) => {
        if (!dragCard) return;
        e.preventDefault();
        const targetColumnId = body.dataset.columnId;
        const cardEls = Array.from(body.querySelectorAll('[data-role="card"]'));
        let insertIndex = cardEls.length;
        for (let i = 0; i < cardEls.length; i++) {
          const rect = cardEls[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            insertIndex = i;
            break;
          }
        }
        moveCard(dragCard.columnId, dragCard.cardId, targetColumnId, insertIndex);
      });
    });
  }

  function attachColumnDragHandlers() {
    els.main.querySelectorAll('[data-role="column-handle"]').forEach((handle) => {
      handle.addEventListener("dragstart", (e) => {
        dragColumnId = handle.dataset.columnId;
        e.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => { dragColumnId = null; });
    });

    els.main.querySelectorAll(".column").forEach((columnEl) => {
      columnEl.addEventListener("dragover", (e) => {
        if (dragColumnId && e.target.closest(".column-header")) e.preventDefault();
      });
      columnEl.addEventListener("drop", (e) => {
        if (!dragColumnId || !e.target.closest(".column-header")) return;
        e.preventDefault();
        const targetColumnId = columnEl.dataset.columnId;
        if (targetColumnId === dragColumnId) return;
        const fromIndex = state.board.columns.findIndex((c) => c.id === dragColumnId);
        const toIndex = state.board.columns.findIndex((c) => c.id === targetColumnId);
        state.board.columns = moveItem(state.board.columns, fromIndex, toIndex);
        dragColumnId = null;
        scheduleSave();
        renderColumns();
      });
    });
  }

  function renderHeader() {
    els.header.innerHTML = `
      <select id="boardSelect">
        ${state.boards
          .map((b) => `<option value="${b.id}" ${b.id === state.board.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
          .join("")}
      </select>
      <button id="renameBoardBtn">Rename</button>
      <button id="newBoardBtn">+ New board</button>
      <button id="deleteBoardBtn" class="danger">Delete board</button>
      <span class="status">Saved</span>
    `;
    els.header.querySelector("#boardSelect").addEventListener("change", (e) => selectBoard(e.target.value));
    els.header.querySelector("#renameBoardBtn").addEventListener("click", renameCurrentBoard);
    els.header.querySelector("#newBoardBtn").addEventListener("click", createNewBoard);
    els.header.querySelector("#deleteBoardBtn").addEventListener("click", deleteCurrentBoard);
  }

  function renderColumns() {
    els.main.innerHTML =
      state.board.columns
        .map(
          (col) => `
        <div class="column" data-column-id="${col.id}">
          <div class="column-header">
            <span class="drag-handle" draggable="true" data-role="column-handle" data-column-id="${col.id}">⠿</span>
            <input type="text" value="${escapeHtml(col.name)}" data-role="column-name" data-column-id="${col.id}" />
            <button data-role="delete-column" data-column-id="${col.id}">✕</button>
          </div>
          <div class="column-body" data-role="column-body" data-column-id="${col.id}">
            ${col.cards
              .map(
                (card) => `
              <div class="card" draggable="true" data-role="card" data-column-id="${col.id}" data-card-id="${card.id}">
                ${escapeHtml(card.title)}
              </div>
            `
              )
              .join("")}
          </div>
          <div class="add-card-row">
            <input type="text" placeholder="+ Add card" data-role="add-card" data-column-id="${col.id}" />
          </div>
        </div>
      `
        )
        .join("") +
      `
        <div class="column add-column">
          <input type="text" placeholder="+ Add column" data-role="add-column" />
        </div>
      `;

    els.main.querySelectorAll('[data-role="card"]').forEach((el) => {
      el.addEventListener("click", () => openCardPanel(el.dataset.columnId, el.dataset.cardId));
    });

    els.main.querySelectorAll('[data-role="column-name"]').forEach((el) => {
      el.addEventListener("change", () => renameColumn(el.dataset.columnId, el.value));
    });

    els.main.querySelectorAll('[data-role="delete-column"]').forEach((el) => {
      el.addEventListener("click", () => deleteColumn(el.dataset.columnId));
    });

    els.main.querySelectorAll('[data-role="add-card"]').forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && el.value.trim()) {
          addCard(el.dataset.columnId, el.value.trim());
          el.value = "";
        }
      });
    });

    const addColumnInput = els.main.querySelector('[data-role="add-column"]');
    addColumnInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && addColumnInput.value.trim()) {
        addColumn(addColumnInput.value.trim());
        addColumnInput.value = "";
      }
    });

    attachCardDragHandlers();
    attachColumnDragHandlers();
  }

  function addCard(columnId, title) {
    findColumn(columnId).cards.push(createCard(title));
    scheduleSave();
    renderColumns();
  }

  function renameColumn(columnId, name) {
    const trimmed = name.trim();
    if (trimmed) findColumn(columnId).name = trimmed;
    scheduleSave();
  }

  async function deleteColumn(columnId) {
    const col = findColumn(columnId);
    if (col.cards.length > 0 && !(await showConfirm(`Delete column "${col.name}" and its ${col.cards.length} card(s)?`))) {
      return;
    }
    state.board.columns = state.board.columns.filter((c) => c.id !== columnId);
    scheduleSave();
    renderColumns();
  }

  function addColumn(name) {
    state.board.columns.push(createColumn(name));
    scheduleSave();
    renderColumns();
  }

  function openCardPanel(columnId, cardId) {
    const card = findColumn(columnId).cards.find((c) => c.id === cardId);
    els.overlayRoot.innerHTML = `
      <div class="overlay">
        <div class="panel">
          <input type="text" id="cardTitle" value="${escapeHtml(card.title)}" />
          <textarea id="cardDescription" placeholder="Description">${escapeHtml(card.description)}</textarea>
          <div class="panel-actions">
            <button id="cardDelete" class="danger">Delete</button>
            <div>
              <button id="cardCancel">Cancel</button>
              <button id="cardSave" class="primary">Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const close = () => { els.overlayRoot.innerHTML = ""; };
    els.overlayRoot.querySelector("#cardCancel").addEventListener("click", close);
    els.overlayRoot.querySelector("#cardSave").addEventListener("click", () => {
      card.title = els.overlayRoot.querySelector("#cardTitle").value.trim() || card.title;
      card.description = els.overlayRoot.querySelector("#cardDescription").value;
      scheduleSave();
      close();
      renderColumns();
    });
    els.overlayRoot.querySelector("#cardDelete").addEventListener("click", () => {
      const column = findColumn(columnId);
      column.cards = column.cards.filter((c) => c.id !== cardId);
      scheduleSave();
      close();
      renderColumns();
    });
  }

  async function selectBoard(id) {
    if (id === state.board.id) return;
    try {
      state.board = await loadBoard(state.project, id);
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, () => selectBoard(id));
    }
  }

  async function createNewBoard() {
    const name = await showPrompt("New board name:", "New board");
    if (!name || !name.trim()) return;
    const board = createBoard(name.trim());
    try {
      await saveBoard(state.project, board);
      state.boards.push({ id: board.id, name: board.name });
      state.board = board;
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, createNewBoard);
    }
  }

  async function renameCurrentBoard() {
    const name = await showPrompt("Rename board:", state.board.name);
    if (!name || !name.trim()) return;
    state.board.name = name.trim();
    const entry = state.boards.find((b) => b.id === state.board.id);
    if (entry) entry.name = state.board.name;
    scheduleSave();
    renderHeader();
  }

  async function deleteCurrentBoard() {
    if (!(await showConfirm(`Delete board "${state.board.name}"? This cannot be undone.`))) return;
    try {
      await deleteBoard(state.project, state.board.id);
      state.boards = state.boards.filter((b) => b.id !== state.board.id);
      if (state.boards.length === 0) {
        const fresh = createBoard("Main");
        await saveBoard(state.project, fresh);
        state.boards = [{ id: fresh.id, name: fresh.name }];
        state.board = fresh;
      } else {
        state.board = await loadBoard(state.project, state.boards[0].id);
      }
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, deleteCurrentBoard);
    }
  }

  async function init() {
    try {
      state.boards = await listBoards(state.project);
      if (state.boards.length === 0) {
        const board = createBoard("Main");
        await saveBoard(state.project, board);
        state.boards = [{ id: board.id, name: board.name }];
        state.board = board;
      } else {
        state.board = await loadBoard(state.project, state.boards[0].id);
      }
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, init);
    }
  }

  init();
}
