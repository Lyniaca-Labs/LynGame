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

  // ProjectHandler.js
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

  // Decide whether a component ships with the engine or lives in the project
  static resolveComponentPath(componentName) {
    const engineFile = path.join(engineComponentsDir, `${componentName}.js`);
    if (fs.existsSync(engineFile)) {
      return `../engine/components/${componentName}.js`;
    }
    return `./components/${componentName}.js`;
  }

  static buildMain(projectName) {
    const projectConfigPath = ProjectHandler.getProjectFile(projectName);
    const config = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));

    if (!config.startScene) {
      throw new Error(`project.lg for "${projectName}" has no startScene set`);
    }

    const scene = ProjectHandler.getScene(projectName, config.startScene);
    const manifest = ProjectHandler.scanComponents(projectName);

    const usedComponents = new Set();
    const usedScripts = new Set();

    for (const entity of scene.entities || []) {
      for (const compName of Object.keys(entity.components || {})) {
        usedComponents.add(compName);
      }
      for (const scriptName of entity.scripts || []) {
        usedScripts.add(scriptName);
      }
    }

    const componentImports = [...usedComponents].map((name) => {
      const entry = manifest[name];
      if (!entry) throw new Error(`Component "${name}" not found in engine or project`);
      const importPath = entry.source === "engine"
        ? `../engine/components/${entry.filename}`
        : `./components/${entry.filename}`;
      return `import { ${name} } from "${importPath}";`;
    }).join("\n");

    const scriptImports = [...usedScripts]
      .map((name) => `import { ${name} } from "./scripts/${name}.js";`)
      .join("\n");

    const entityCode = (scene.entities || []).map((entity) => {
      const compLines = Object.entries(entity.components || {})
        .map(([name, data]) => `  entity_${entity.id}.addComponent(${name}, ${JSON.stringify(data)});`)
        .join("\n");

      const scriptLines = (entity.scripts || [])
        .map((name) => `  entity_${entity.id}.attachScript(${name});`)
        .join("\n");

      return `  const entity_${entity.id} = engine.createEntity("${entity.id}");\n${compLines}\n${scriptLines}`;
    }).join("\n\n");

    return `${componentImports}
${scriptImports}

export function init(engine) {
${entityCode}

  engine.start();
}
`;
  }

  static newConfig(projectName) {
    return JSON.stringify({
      name: projectName,
      startScene: "main",
      assets: [], // {key: "assetName", path: "path/to/asset.png"}
    }, null, 2);
  }
}