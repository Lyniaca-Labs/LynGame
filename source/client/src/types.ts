export type FieldType = "number" | "boolean" | "text" | "color" | "vector";
export type ComponentSchema = { name: string; source: string; filename: string; fields: { key: string; type: FieldType; defaultValue: unknown }[] };
export type Entity = { id: string; prefab?: string; overrides?: Record<string, Record<string, unknown>>; components?: Record<string, Record<string, unknown>>; scripts?: string[] };
export type Scene = { name: string; entities: Entity[] };
export type EditorSnapshot = { project: { name: string; startScene: string }; components: Record<string, ComponentSchema>; scenes: string[]; prefabs: string[]; scripts: string[]; assets: { key: string; relativePath: string; type: string }[] };
