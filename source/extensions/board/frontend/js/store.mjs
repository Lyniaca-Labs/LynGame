export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createCard(title) {
  return { id: createId("k"), title, description: "" };
}

export function createColumn(name) {
  return { id: createId("c"), name, cards: [] };
}

export function createBoard(name) {
  return {
    id: createId("b"),
    name,
    createdAt: new Date().toISOString(),
    columns: [createColumn("To Do"), createColumn("In Progress"), createColumn("Done")],
  };
}

export async function listBoards(project) {
  const res = await fetch(`/api/extensions/board/list?project=${encodeURIComponent(project)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to list boards");
  return data.boards;
}

export async function loadBoard(project, id) {
  const res = await fetch(
    `/api/extensions/board/board?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to load board");
  return data.board;
}

export async function saveBoard(project, board) {
  const res = await fetch("/api/extensions/board/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, board }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to save board");
}

export async function deleteBoard(project, id) {
  const res = await fetch("/api/extensions/board/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, id }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to delete board");
}
