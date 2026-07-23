import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const engineComponentsDir = path.join(__dirname, "../../engine/components");

export default class ProjectHandler {
  static getProjectFile(projectName) {
    const projectPath = path.join(__dirname, "../../projects", projectName, "project.lg");
    if (!fs.existsSync(projectPath)) {
      throw new Error("Project file not found");
    }
    return projectPath;
  }

  static scanComponents(projectName) {
    const engineComponentsDir = path.join(__dirname, "../../engine/components");
    const projectComponentsDir = path.join(__dirname, "../../projects", projectName, "components");

    const manifest = {}; // componentName -> { source: "engine" | "project", filename }

    if (fs.existsSync(engineComponentsDir)) {
      for (const file of fs.readdirSync(engineComponentsDir)) {
        if (file.endsWith(".js")) {
          const name = path.basename(file, ".js");
          manifest[name] = { source: "engine", filename: file };
        }
      }
    }

    if (fs.existsSync(projectComponentsDir)) {
      for (const file of fs.readdirSync(projectComponentsDir)) {
        if (file.endsWith(".js")) {
          const name = path.basename(file, ".js");
          manifest[name] = { source: "project", filename: file }; // project overrides engine if same name
        }
      }
    }

    return manifest;
  }

  static getScene(projectName, sceneName) {
    const scenePath = path.join(
      __dirname, "../../projects", projectName, "scenes", `${sceneName}.json`
    );
    if (!fs.existsSync(scenePath)) {
      throw new Error(`Scene "${sceneName}" not found`);
    }
    return JSON.parse(fs.readFileSync(scenePath, "utf-8"));
  }

  static resolveComponentPath(componentName) {
    const engineFile = path.join(engineComponentsDir, `${componentName}.js`);
    if (fs.existsSync(engineFile)) {
      return `../engine/components/${componentName}.js`;
    }
    return `./components/${componentName}.js`;
  }

  static scanAssets(projectName) {
    const assetsDir = path.join(__dirname, "../../projects", projectName, "assets");
    const manifest = {}; // key -> { relativePath, type }
    

    if (!fs.existsSync(assetsDir)) return manifest;

    const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
    const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

    function walk(dir, relPrefix) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, relPrefix ? `${relPrefix}/${entry.name}` : entry.name);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        const nameNoExt = entry.name.slice(0, -ext.length);
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const key = relPrefix ? `${relPrefix}/${nameNoExt}` : nameNoExt;

        if (manifest[key]) {
          throw new Error(
            `Duplicate asset key "${key}": "${manifest[key].relativePath}" and "${relPath}" both resolve to it`
          );
        }

        let type = "other";
        if (IMAGE_EXT.has(ext)) type = "image";
        else if (AUDIO_EXT.has(ext)) type = "audio";

        manifest[key] = { relativePath: relPath, type };
      }
    }

    walk(assetsDir, "");
    return manifest;
  }

  static scanFiles(projectName, folder) {
    const root = path.join(__dirname, "../../projects", projectName, folder);
    if (!fs.existsSync(root)) return [];
    const result = [];
    const walk = (dir, prefix = "") => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
        else result.push(relative);
      }
    };
    walk(root);
    return result;
  }

  static async loadComponentClass(projectName, entry) {
    const file = entry.source === "engine"
      ? path.join(__dirname, "../../engine/components", entry.filename)
      : path.join(__dirname, "../../projects", projectName, "components", entry.filename);

    try {
      const mod = await import(pathToFileURL(file).href);
      return mod.default ?? mod[entry.className ?? Object.keys(mod)[0]];
    } catch {
      return null;
    }
  }

  static componentSchemas(projectName) {
    const manifest = this.scanComponents(projectName);
    const schemas = {};

    for (const [name, entry] of Object.entries(manifest)) {
      const editable = entry.source !== "engine";
      const file = entry.source === "engine"
        ? path.join(__dirname, "../../engine/components", entry.filename)
        : path.join(__dirname, "../../projects", projectName, "components", entry.filename);

      const ComponentClass = this.loadComponentClass(projectName, entry);
      const declaredSchema = ComponentClass?.schema;

      const fields = declaredSchema && Object.keys(declaredSchema).length > 0
        ? Object.entries(declaredSchema).map(([key, def]) => ({
          key,
          type: def.type,
          defaultValue: def.default,
          editable,
        }))
        : this.inferFieldsFromSource(fs.readFileSync(file, "utf8"), editable);

      schemas[name] = {
        name,
        source: entry.source,
        filename: entry.filename,
        editable,
        fields,
      };
    }

    return schemas;
  }

  // Legacy fallback: reverse-engineers field metadata by regex-scanning the
  // constructor source. Only used for components that haven't declared a
  // static `schema` yet. Remove once all components are migrated.
  static inferFieldsFromSource(source, editable) {
    const constructorStart = source.indexOf("constructor");
    const constructorEnd = source.indexOf(") {", constructorStart);
    const constructorSource =
      constructorStart >= 0 && constructorEnd >= 0
        ? source.slice(constructorStart, constructorEnd)
        : "";

    const fields = [];
    if (!constructorSource) return fields;

    const fieldPattern =
      /([A-Za-z_$][\w$]*)\s*=\s*(\{[^}]*\}|\[[^\]]*\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[0-9a-fA-F]{3,8}|-?\d+(?:\.\d+)?|true|false|null)/g;

    let field;
    while ((field = fieldPattern.exec(constructorSource))) {
      const raw = field[2].trim();

      let value = raw;
      try {
        value = JSON.parse(
          raw.replace(/([A-Za-z_$][\w$]*)\s*:/g, '"$1":').replace(/'/g, '"')
        );
      } catch {
        // Source defaults can be expressions.
      }

      const type =
        typeof value === "number"
          ? "number"
          : typeof value === "boolean"
            ? "boolean"
            : (value && typeof value === "object") || raw.startsWith("{")
              ? "vector"
              : (typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)) ||
                raw.startsWith("#")
                ? "color"
                : "text";

      fields.push({ key: field[1], type, defaultValue: value, editable });
    }

    return fields;
  }

  static editorSnapshot(projectName) {
    const projectDir = path.join(__dirname, "../../projects", projectName);
    if (!fs.existsSync(projectDir)) throw new Error("Project not found");
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, "project.lg"), "utf8"));
    return {
      project: { ...config, name: projectName },
      components: this.componentSchemas(projectName),
      scenes: this.scanFiles(projectName, "scenes").filter((file) => file.endsWith(".json")),
      prefabs: this.scanFiles(projectName, "prefabs").filter((file) => file.endsWith(".json")),
      scripts: this.scanFiles(projectName, "scripts").filter((file) => file.endsWith(".js")),
      assets: Object.entries(this.scanAssets(projectName)).map(([key, asset]) => ({ key, ...asset })),
    };
  }

  static buildMain(projectName) {
    const projectConfigPath = ProjectHandler.getProjectFile(projectName);
    const config = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
    const manifest = ProjectHandler.scanComponents(projectName);

    const scenesDir = path.join(__dirname, "../../projects", projectName, "scenes");
    const sceneFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".json"));

    const prefabsDir = path.join(__dirname, "../../projects", projectName, "prefabs");
    const prefabFiles = fs.existsSync(prefabsDir)
      ? fs.readdirSync(prefabsDir).filter((f) => f.endsWith(".json"))
      : [];

    const allComponents = new Set();
    const allScripts = new Set();

    // Emits creation code for one plain (non-prefab-referencing) entity node.
    function renderEntity(node, varName, idExpr, indent = "    ") {
      for (const compName of Object.keys(node.components || {})) allComponents.add(compName);
      for (const scriptName of node.scripts || []) allScripts.add(scriptName);

      const lines = [`${indent}const ${varName} = engine.createEntity(${idExpr});`];
      for (const [compName, data] of Object.entries(node.components || {})) {
        lines.push(`${indent}${varName}.addComponent(${compName}, ${JSON.stringify(data)});`);
      }
      for (const scriptName of node.scripts || []) {
        lines.push(`${indent}${varName}.attachScript(${scriptName});`);
      }
      return lines;
    }

    // --- scenes ---
    const sceneFunctions = [];
    for (const file of sceneFiles) {
      const sceneName = path.basename(file, ".json");
      const scene = JSON.parse(fs.readFileSync(path.join(scenesDir, file), "utf-8"));

      const bodyLines = [];
      for (const entity of scene.entities || []) {
        if (entity.prefab) {
          const varName = `entity_${entity.id}`;
          bodyLines.push(
            `    const ${varName} = engine.prefabs.instantiate("${entity.prefab}", ${JSON.stringify(entity.overrides || {})}, "${entity.id}");`
          );

          // Entity-local components/scripts layered on top of the prefab (e.g.
          // added via the Inspector's "Components" section while a prefab is
          // attached). These aren't part of the prefab, so instantiate() has no
          // idea about them — add them explicitly after instantiation.
          for (const [compName, data] of Object.entries(entity.components || {})) {
            allComponents.add(compName);
            bodyLines.push(`    ${varName}.addComponent(${compName}, ${JSON.stringify(data)});`);
          }
          for (const scriptName of entity.scripts || []) {
            allScripts.add(scriptName);
            bodyLines.push(`    ${varName}.attachScript(${scriptName});`);
          }
        } else {
          bodyLines.push(...renderEntity(entity, `entity_${entity.id}`, `"${entity.id}"`));
        }
      }

      sceneFunctions.push(`function scene_${sceneName}(engine) {\n${bodyLines.join("\n")}\n}`);
    }

    // --- prefabs ---
    const prefabFunctions = [];
    const prefabRegistrations = [];
    for (const file of prefabFiles) {
      const prefabName = path.basename(file, ".json");
      const prefab = JSON.parse(fs.readFileSync(path.join(prefabsDir, file), "utf-8"));

      for (const compName of Object.keys(prefab.components || {})) allComponents.add(compName);
      for (const scriptName of prefab.scripts || []) allScripts.add(scriptName);

      const rootLines = [
        `  const entity = engine.createEntity(id ?? engine._generateId("${prefabName}"));`,
        `  entity.prefabName = "${prefabName}";`,
      ];
      for (const [compName, data] of Object.entries(prefab.components || {})) {
        rootLines.push(
          `  entity.addComponent(${compName}, { ...${JSON.stringify(data)}, ...(overrides.${compName} || {}) });`
        );
      }
      for (const scriptName of prefab.scripts || []) {
        rootLines.push(`  entity.attachScript(${scriptName});`);
      }
      rootLines.push(`  return entity;`);

      prefabFunctions.push(
        `function prefab_${prefabName}(engine, overrides = {}, id = null) {\n${rootLines.join("\n")}\n}`
      );
      prefabRegistrations.push(`  engine.prefabs.register("${prefabName}", prefab_${prefabName});`);
    }

    const componentImports = [...allComponents].map((name) => {
      const entry = manifest[name];
      if (!entry) throw new Error(`Component "${name}" not found in engine or project`);
      const importPath = entry.source === "engine" ? `../engine/components/${entry.filename}` : `./components/${entry.filename}`;
      return `import { ${name} } from "${importPath}";`;
    }).join("\n");

    const scriptImports = [...allScripts]
      .map((name) => `import { ${name} } from "./scripts/${name}.js";`)
      .join("\n");

    const sceneRegistrations = sceneFiles
      .map((f) => path.basename(f, ".json"))
      .map((name) => `  engine.registerScene("${name}", scene_${name});`)
      .join("\n");


    const assetManifest = ProjectHandler.scanAssets(projectName);

    return `${componentImports}


${scriptImports}

${prefabFunctions.join("\n\n")}

${sceneFunctions.join("\n\n")}

export async function init(engine) {
  await engine.assets.load(${JSON.stringify(assetManifest)}, "./game/assets");
${prefabRegistrations.join("\n")}
${sceneRegistrations}
  engine.loadScene("${config.startScene}");
  engine.start();
}
`;
  }

  static newConfig(projectName) {
    return JSON.stringify({
      name: projectName,
      startScene: "main",
      assets: [],
    }, null, 2);
  }
}
