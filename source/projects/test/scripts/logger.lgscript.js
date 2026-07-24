export function logger_lgscript(entity, engine, dt, data = {}) {
  const n1_scriptOutput = undefined;
  const n2_scriptParameters_entity = entity;
  const n2_scriptParameters_engine = engine;
  const n2_scriptParameters_dt = dt;
  const n3_entityGetcomponent = n2_scriptParameters_entity.getComponent("Transform");
  if (!n3_entityGetcomponent) throw new Error("Required component \"Transform\" was not found on the entity.");
  const n4_componentGet = n3_entityGetcomponent?.["x"];
  const n5_mathAdd = (n4_componentGet + 1);
  const n6_componentSet = ((n3_entityGetcomponent["x"] = n5_mathAdd), n3_entityGetcomponent);
  return n1_scriptOutput;
}
