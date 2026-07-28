export function visual(entity, engine, dt, data = {}) {
  const n1_scriptInput = data.value;
  const n2_valueNumber = 5;
  const n3_vectorCreate = [n1_scriptInput, n2_valueNumber];
  const n4_vectorSplit_x = n3_vectorCreate[0];
  const n4_vectorSplit_y = n3_vectorCreate[1];
  const n5_mathAdd = (n4_vectorSplit_x + 3);
  const n6_vectorCreate = [n5_mathAdd, n4_vectorSplit_y];
  const n7_scriptOutput = n6_vectorCreate;
  return n7_scriptOutput;
}
