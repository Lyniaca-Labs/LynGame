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
