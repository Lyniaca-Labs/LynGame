import test from "node:test";
import assert from "node:assert/strict";
import { createId, createCard, createColumn, createBoard } from "../frontend/js/store.mjs";

test("createId prefixes the id and includes a random suffix", () => {
  const id = createId("x");
  assert.match(id, /^x_[a-z0-9]{8}$/);
});

test("createId produces different ids on each call", () => {
  assert.notEqual(createId("x"), createId("x"));
});

test("createCard has a k_ id, the given title, and an empty description", () => {
  const card = createCard("Add screen shake");
  assert.match(card.id, /^k_/);
  assert.equal(card.title, "Add screen shake");
  assert.equal(card.description, "");
});

test("createColumn has a c_ id, the given name, and no cards", () => {
  const column = createColumn("To Do");
  assert.match(column.id, /^c_/);
  assert.equal(column.name, "To Do");
  assert.deepEqual(column.cards, []);
});

test("createBoard has a b_ id, the given name, a createdAt timestamp, and 3 starter columns", () => {
  const board = createBoard("Features");
  assert.match(board.id, /^b_/);
  assert.equal(board.name, "Features");
  assert.equal(typeof board.createdAt, "string");
  assert.deepEqual(board.columns.map((c) => c.name), ["To Do", "In Progress", "Done"]);
  for (const column of board.columns) assert.deepEqual(column.cards, []);
});
