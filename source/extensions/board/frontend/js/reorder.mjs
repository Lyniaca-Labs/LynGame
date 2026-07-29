export function moveItem(array, fromIndex, toIndex) {
  const copy = array.slice();
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}
