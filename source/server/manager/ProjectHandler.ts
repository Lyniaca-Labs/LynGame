import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import { compiledGraphFilename, graphBaseName, graphFilename, scriptSymbol } from "../compiler/graphScripts.js";
import { compiledTextureFilename } from "../compiler/textureCompiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "../../..")
  : path.resolve(__dirname, "../..");

const engineComponentsDir = path.join(sourceRoot, "engine/components");

type ComponentSource = "engine" | "project";
type ComponentEntry = { source: ComponentSource; filename: string; className?: string };
type ComponentManifest = Record<string, ComponentEntry>;
type Asset = { relativePath: string; type: "image" | "audio" | "texture" | "spritesheet" | "other"; size?: number };
type AssetManifest = Record<string, Asset>;
type JsonRecord = Record<string, any>;

interface ComponentSchemaFieldDef {
  type: string;
  default: unknown;
  description?: string;
  options?: { value: string; label: string }[];
}

interface Field {
  key: string;
  type: string;
  defaultValue: unknown;
  editable: boolean;
  description?: string;
  options?: { value: string; label: string }[];
}


export default class ProjectHandler {
  static getProjectFile(projectName) {
    const projectPath = path.join(sourceRoot, "projects", projectName, "project.lg");
    if (!fs.existsSync(projectPath)) {
      throw new Error("Project file not found");
    }
    return projectPath;
  }

  static scanComponents(projectName: string): ComponentManifest {
    const engineComponentsDir = path.join(sourceRoot, "engine/components");
    const projectComponentsDir = path.join(sourceRoot, "projects", projectName, "components");

    const manifest: ComponentManifest = {}; // componentName -> { source: "engine" | "project", filename }

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
      sourceRoot, "projects", projectName, "scenes", `${sceneName}.json`
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

  static scanAssets(projectName: string): AssetManifest {
    const assetsDir = path.join(sourceRoot, "projects", projectName, "assets");
    const manifest: AssetManifest = {}; // key -> { relativePath, type }
    

    if (!fs.existsSync(assetsDir)) return manifest;

    const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
    const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);

    function walk(dir, relPrefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // A spritesheet is a plain image with a sidecar `<name>.spritesheet.json`
      // sitting next to it — collected up front (per directory) so the sidecar
      // can both be skipped as its own asset (like `.texture.js` below) and
      // reclassify its sibling image's type in the same pass.
      const spritesheetSidecars = new Set(
        entries
          .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".spritesheet.json"))
          .map((entry) => entry.name.slice(0, -".spritesheet.json".length))
      );

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, relPrefix ? `${relPrefix}/${entry.name}` : entry.name);
          continue;
        }
        if (entry.name.endsWith(".texture.js")) continue;
        if (entry.name.endsWith(".spritesheet.json")) continue; // sidecar, not its own asset

        const ext = path.extname(entry.name).toLowerCase();
        const nameNoExt = entry.name.slice(0, -ext.length);
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const key = relPrefix ? `${relPrefix}/${nameNoExt}` : nameNoExt;

        if (manifest[key]) {
          throw new Error(
            `Duplicate asset key "${key}": "${manifest[key].relativePath}" and "${relPath}" both resolve to it`
          );
        }

        let type: Asset["type"] = "other";
        if (IMAGE_EXT.has(ext)) type = spritesheetSidecars.has(nameNoExt) ? "spritesheet" : "image";
        else if (AUDIO_EXT.has(ext)) type = "audio";
        else if (ext === ".texture.json" || entry.name.endsWith(".texture.json")) type = "texture";

        manifest[key] = { relativePath: relPath, type, size: fs.statSync(fullPath).size };
      }
    }

    walk(assetsDir, "");
    return manifest;
  }

  static scanFiles(projectName, folder) {
    const root = path.join(sourceRoot, "projects", projectName, folder);
    if (!fs.existsSync(root)) return [];
    const result: string[] = [];
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

  

  static resolveAliasImports(source, originalFileDir) {
    const aliasRoots = {
      "@types/": path.join(sourceRoot, "engine/types/"),
      "@components/": path.join(sourceRoot, "engine/components/"),
    };

    let resolved = source;

    // 1. Resolve known aliases
    for (const [prefix, realRoot] of Object.entries(aliasRoots)) {
      const pattern = new RegExp(`(['"])${prefix}([^'"]+)\\1`, "g");
      resolved = resolved.replace(pattern, (match, quote, rest) => {
        const realPath = path.join(realRoot, rest);
        return `${quote}${pathToFileURL(realPath).href}${quote}`;
      });
    }

    // 2. Resolve plain relative imports (./ or ../) against the ORIGINAL file's directory
    const relativePattern = /(['"])(\.\.?\/[^'"]+)\1/g;
    resolved = resolved.replace(relativePattern, (match, quote, rel) => {
      const realPath = path.resolve(originalFileDir, rel);
      return `${quote}${pathToFileURL(realPath).href}${quote}`;
    });

    return resolved;
  }

  static async loadComponentClass(projectName, entry) {
    const file = entry.source === "engine"
      ? path.join(sourceRoot, "engine/components", entry.filename)
      : path.join(sourceRoot, "projects", projectName, "components", entry.filename);

    let tempFile;
    try {
      const originalSource = fs.readFileSync(file, "utf8");
      const patchedSource = this.resolveAliasImports(originalSource, path.dirname(file));

      const tmpDir = path.join(sourceRoot, ".tmp-components");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      tempFile = path.join(tmpDir, `component-${Date.now()}-${entry.filename}`);
      fs.writeFileSync(tempFile, patchedSource, "utf8");

      const mod = await import(pathToFileURL(tempFile).href);
      return mod.default ?? mod[entry.className ?? Object.keys(mod)[0]];
    } catch (err) {
      console.error(`Failed to load component ${entry.filename}:`, err);
      return null;
    } finally {
      if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  static async componentSchemas(projectName: string): Promise<Record<string, JsonRecord>> {
    const manifest = this.scanComponents(projectName);
    const schemas: Record<string, JsonRecord> = {};

    for (const [name, entry] of Object.entries(manifest) as [string, ComponentEntry][]) {
      const editable = entry.source !== "engine";
      const file = entry.source === "engine"
        ? path.join(sourceRoot, "engine/components", entry.filename)
        : path.join(sourceRoot, "projects", projectName, "components", entry.filename);

      const ComponentClass = await this.loadComponentClass(projectName, entry);
      const declaredSchema = ComponentClass?.schema as Record<string, ComponentSchemaFieldDef> | undefined;

      // NOTE: check `hasOwnProperty`, not `declaredSchema !== undefined` —
      // `Component` itself declares `static schema = {}`, and JS static
      // members are inherited, so `ComponentClass.schema` resolves to that
      // inherited `{}` for EVERY component, even ones that never declare
      // their own schema. A plain `!== undefined` check therefore always
      // takes this branch and the regex-based legacy inference below never
      // runs. Only a component that explicitly writes `static schema = {}`
      // itself should skip inference (a real, legitimate "no fields").
      const hasOwnSchema = Object.prototype.hasOwnProperty.call(ComponentClass ?? {}, "schema");
      const fields: Field[] = hasOwnSchema
        ? Object.entries(declaredSchema ?? {}).map(([key, def]) => ({
          key,
          type: def.type,
          defaultValue: def.default,
          editable,
          description: def.description ?? "",
          options: def.options,
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

    const fields: Field[] = [];
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

  static async editorSnapshot(projectName) {
    const projectDir = path.join(sourceRoot, "projects", projectName);
    if (!fs.existsSync(projectDir)) throw new Error("Project not found");
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, "project.lg"), "utf8"));
    return {
      project: { ...config, name: projectName },
      components: await this.componentSchemas(projectName),
      scenes: this.scanFiles(projectName, "scenes").filter((file) => file.endsWith(".json")),
      prefabs: this.scanFiles(projectName, "prefabs").filter((file) => file.endsWith(".json")),
      animations: this.scanFiles(projectName, "animations").filter((file) => file.endsWith(".json")),
      // scripts: this.scanFiles(projectName, "scripts").filter((file) => file.endsWith(".js")),
      scripts: this.scanFiles(projectName, "scripts").filter(
        (file) => file.endsWith(".js") || file.endsWith(".lgscript.json")
      ),
      assets: Object.entries(this.scanAssets(projectName)).map(([key, asset]) => ({ key, ...asset })),
    };
  }

  static buildMain(projectName: string): string {
    const projectConfigPath = ProjectHandler.getProjectFile(projectName);
    const config = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
    const manifest = ProjectHandler.scanComponents(projectName);

    const scenesDir = path.join(sourceRoot, "projects", projectName, "scenes");
    const sceneFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".json"));

    const prefabsDir = path.join(sourceRoot, "projects", projectName, "prefabs");
    const prefabFiles = fs.existsSync(prefabsDir)
      ? fs.readdirSync(prefabsDir).filter((f) => f.endsWith(".json"))
      : [];

    const scriptsDir = path.join(sourceRoot, "projects", projectName, "scripts");

    const animationsDir = path.join(sourceRoot, "projects", projectName, "animations");
    const animationFiles = fs.existsSync(animationsDir)
      ? fs.readdirSync(animationsDir).filter((f) => f.endsWith(".json"))
      : [];
    const animationNames = new Set(animationFiles.map((f) => path.basename(f, ".json")));

    // Computed up front (rather than down by the manifest emission below) so
    // checkSpriteFrameRefs can consult it while entities/prefabs are rendered.
    const assetManifest = ProjectHandler.scanAssets(projectName);

    const allComponents = new Set<string>();
    const allScripts = new Map<string, Set<string>>();

    // Animator.clips is just an array of clip names (curated for the editor,
    // not enforced at runtime — Animator.play() resolves against the global
    // engine.animations registry the same way engine.callScript() isn't
    // restricted to entity.scripts). Still worth catching a typo'd/deleted
    // clip name loudly at build time rather than a silent no-op play() later.
    function checkAnimatorClipRefs(compName: string, data: any, location: string) {
      if (compName !== "Animator" || !data || !Array.isArray(data.clips)) return;
      for (const clipName of data.clips) {
        if (!animationNames.has(clipName)) {
          throw new Error(
            `Missing animation clip "${clipName}" (referenced by ${location}) — ` +
            `no file named "${clipName}.json" exists in ${animationsDir}.`
          );
        }
      }
    }

    // SpriteRenderer.frame and SpriteAnimation.clip both name things that
    // live inside the spritesheet asset SpriteRenderer.sprite points at — so,
    // unlike checkAnimatorClipRefs, this needs an entity's whole `components`
    // map in one call (not one component at a time) to see `sprite` and
    // `frame`/`clip` together. Only validates when `sprite` is present in the
    // same map being checked — e.g. a prefab-instance override that sets only
    // `frame` without also overriding `sprite` is skipped here, same
    // known limitation checkAnimatorClipRefs already documents above.
    const spritesheetMetaCache = new Map<string, any | null>(); // assetKey -> parsed sidecar, or null if not a spritesheet
    function loadSpritesheetMeta(assetKey: string) {
      if (spritesheetMetaCache.has(assetKey)) return spritesheetMetaCache.get(assetKey);
      const asset = assetManifest[assetKey];
      if (!asset || asset.type !== "spritesheet") {
        spritesheetMetaCache.set(assetKey, null);
        return null;
      }
      const imagePath = path.join(sourceRoot, "projects", projectName, "assets", asset.relativePath);
      const jsonPath = imagePath.replace(/\.[^./\\]+$/, ".spritesheet.json");
      const meta = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf-8")) : null;
      spritesheetMetaCache.set(assetKey, meta);
      return meta;
    }

    function checkSpriteFrameRefs(components: any, location: string) {
      const renderer = components?.SpriteRenderer;
      if (!renderer?.sprite) return;
      const meta = loadSpritesheetMeta(renderer.sprite);
      if (!meta) return; // plain image asset (or missing asset, caught elsewhere) — nothing to validate

      if (renderer.frame && !meta.frames?.some((f) => f.name === renderer.frame)) {
        throw new Error(
          `Missing frame "${renderer.frame}" on spritesheet "${renderer.sprite}" (referenced by ${location}).`
        );
      }
      const clip = components?.SpriteAnimation?.clip;
      if (clip && !meta.clips?.[clip]) {
        throw new Error(
          `Missing clip "${clip}" on spritesheet "${renderer.sprite}" (referenced by ${location}).`
        );
      }
    }

    // ---------------------------------------------------------------------
    // Script name canonicalization
    //
    // The file on disk is the ONLY source of truth for a script's name/casing
    // — required so import paths are correct on case-sensitive filesystems
    // (itch.io, most non-Windows hosts). Scan scripts/ up front to build a
    // lowercase -> actual-filename map. Any entity/prefab reference is then
    // checked against it in addScriptRef:
    //   - no match at all              -> throw (typo'd/deleted script)
    //   - match but casing differs     -> throw (must fix the JSON, not the file)
    //   - match, casing identical      -> fine, proceed
    // Two files on disk differing only by case is itself ambiguous and is
    // rejected at scan time below.
    // ---------------------------------------------------------------------
    const scriptNameCanon = new Map<string, string>(); // lowercase -> actual on-disk name

    if (fs.existsSync(scriptsDir)) {
      for (const file of fs.readdirSync(scriptsDir)) {
        let diskName: string | null = null;
        if (file.endsWith(".lgscript.json")) {
          diskName = file.slice(0, -".lgscript.json".length);
        } else if (file.endsWith(".lgscript.js")) {
          continue; // compiled output, not a source name
        } else if (file.endsWith(".js")) {
          diskName = path.basename(file, ".js");
        }
        if (!diskName) continue;

        const lower = diskName.toLowerCase();
        const existing = scriptNameCanon.get(lower);
        if (existing !== undefined && existing !== diskName) {
          throw new Error(
            `Ambiguous scripts in ${scriptsDir}: "${existing}" and "${diskName}" differ only by case. ` +
            `Rename one — this is not resolvable on case-sensitive filesystems.`
          );
        }
        scriptNameCanon.set(lower, diskName);
      }
    }

    function addScriptRef(scriptName: string, location: string): string {
      const baseName = graphBaseName(scriptName); // strip an optional trailing .lgscript(.json|.js) suffix
      const lower = baseName.toLowerCase();
      const onDisk = scriptNameCanon.get(lower);

      if (onDisk === undefined) {
        throw new Error(
          `Missing script "${scriptName}" (referenced by ${location}) — ` +
          `no file named "${baseName}.js" or "${baseName}.lgscript.json" exists in ${scriptsDir}.`
        );
      }
      if (onDisk !== baseName) {
        throw new Error(
          `Script "${scriptName}" (referenced by ${location}) does not match the on-disk casing "${onDisk}". ` +
          `Fix the reference to use "${onDisk}" exactly — casing must match for case-sensitive filesystems.`
        );
      }

      if (!allScripts.has(onDisk)) allScripts.set(onDisk, new Set());
      allScripts.get(onDisk)?.add(location);
      return onDisk;
    }

    function renderEntity(node, varName, idExpr, indent = "    ", location) {
      for (const compName of Object.keys(node.components || {})) allComponents.add(compName);
      for (const scriptName of node.scripts || []) addScriptRef(scriptName, location);

      const lines = [`${indent}const ${varName} = engine.createEntity(${idExpr});`];
      for (const [compName, data] of Object.entries(node.components || {})) {
        checkAnimatorClipRefs(compName, data, location);
        lines.push(`${indent}${varName}.addComponent(${compName}_component, ${JSON.stringify(data)});`);
      }
      checkSpriteFrameRefs(node.components, location);
      for (const scriptName of node.scripts || []) {
        lines.push(`${indent}${varName}.attachScript(${scriptSymbol(scriptName)}_script);`);
      }
      return lines;
    }

    // Recursively renders a prefab's `children` tree (children of children of...)
    // into entity-creation code, run inside the prefab factory function where
    // `entity` (the root) and `childOverrides` (= overrides.children || {}) are
    // already in scope. `path` is the dot-joined chain of childName segments
    // from the prefab root (e.g. "description.badge"), used both as the
    // override lookup key and as the runtime `childName` — this is exactly
    // the addressing scheme entity.getChild()/query() and instance overrides
    // both rely on.
    function renderPrefabChildren(children, parentVar, pathPrefix, indent, prefabName) {
      const lines: string[] = [];
      for (const [childName, child] of Object.entries<any>(children || {})) {
        const path = pathPrefix ? `${pathPrefix}.${childName}` : childName;
        const varName = `child_${path.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        const location = `child "${path}" of prefab "${prefabName}"`;
        const pathLit = JSON.stringify(path);

        for (const compName of Object.keys(child.components || {})) allComponents.add(compName);
        for (const scriptName of child.scripts || []) addScriptRef(scriptName, location);

        lines.push(`${indent}const ${varName} = engine.createEntity(\`\${entity.id}.${path}\`);`);
        lines.push(`${indent}${varName}.childName = ${JSON.stringify(childName)};`);
        for (const [compName, data] of Object.entries(child.components || {})) {
          checkAnimatorClipRefs(compName, data, location);
          lines.push(
            `${indent}${varName}.addComponent(${compName}_component, { ...${JSON.stringify(data)}, ...(childOverrides[${pathLit}]?.${compName} || {}) });`
          );
        }
        checkSpriteFrameRefs(child.components, location);
        for (const scriptName of child.scripts || []) {
          lines.push(`${indent}${varName}.attachScript(${scriptSymbol(scriptName)}_script);`);
        }
        lines.push(`${indent}${parentVar}.addChild(${varName});`);
        lines.push(...renderPrefabChildren(child.children, varName, path, indent, prefabName));
      }
      return lines;
    }

    const sceneFunctions: string[] = [];
    const sceneCameraIds = new Map<string, string | null>();

    for (const file of sceneFiles) {
      const sceneName = path.basename(file, ".json");
      const scene = JSON.parse(fs.readFileSync(path.join(scenesDir, file), "utf-8"));

      sceneCameraIds.set(sceneName, scene.cameraId ?? null);

      const bodyLines: string[] = [];
      for (const entity of scene.entities || []) {
        const location = `entity "${entity.id}" in scene "${sceneName}"`;

        if (entity.prefab) {
          const varName = `entity_${entity.id}`;
          bodyLines.push(
            `    const ${varName} = engine.prefabs.instantiate("${entity.prefab}", ${JSON.stringify(entity.overrides || {})}, "${entity.id}");`
          );

          for (const [compName, data] of Object.entries(entity.components || {})) {
            allComponents.add(compName);
            checkAnimatorClipRefs(compName, data, location);
            bodyLines.push(`    ${varName}.addComponent(${compName}_component, ${JSON.stringify(data)});`);
          }
          checkSpriteFrameRefs(entity.components, location);
          for (const scriptName of entity.scripts || []) {
            addScriptRef(scriptName, location);
            bodyLines.push(`    ${varName}.attachScript(${scriptSymbol(scriptName)}_script);`);
          }
          // Extra scripts on a prefab's ghost children (component-field overrides
          // for children flow at runtime through overrides.children, already
          // passed into instantiate() above — but attachScript needs a static
          // import, so any additional per-child scripts are wired here instead.
          for (const [childPath, childOverride] of Object.entries<any>(entity.overrides?.children || {})) {
            for (const scriptName of childOverride?.scripts || []) {
              addScriptRef(scriptName, `child "${childPath}" override in ${location}`);
              bodyLines.push(
                `    ${varName}.getChild(${JSON.stringify(childPath)}).attachScript(${scriptSymbol(scriptName)}_script);`
              );
            }
          }
        } else {
          bodyLines.push(...renderEntity(entity, `entity_${entity.id}`, `"${entity.id}"`, "    ", location));
        }
      }

      // Second pass: wire up parent/child relationships. This has to run
      // after every entity in the scene has been created above, since
      // parentId can reference an entity declared later in the array —
      // by now every `entity_<id>` var is already in scope regardless of
      // declaration order.
      const idsInScene = new Set((scene.entities || []).map((e) => e.id));
      for (const entity of scene.entities || []) {
        if (!entity.parentId) continue;
        if (!idsInScene.has(entity.parentId)) {
          throw new Error(
            `Entity "${entity.id}" in scene "${sceneName}" has parentId "${entity.parentId}", which does not exist in this scene.`
          );
        }
        if (entity.parentId === entity.id) {
          throw new Error(`Entity "${entity.id}" in scene "${sceneName}" cannot be its own parent.`);
        }
        bodyLines.push(`    entity_${entity.parentId}.addChild(entity_${entity.id});`);
      }

      sceneFunctions.push(`function scene_${sceneName}(engine) {\n${bodyLines.join("\n")}\n}`);
    }

    const prefabFunctions: string[] = [];
    const prefabRegistrations: string[] = [];

    for (const file of prefabFiles) {
      const prefabName = path.basename(file, ".json");
      const prefab = JSON.parse(fs.readFileSync(path.join(prefabsDir, file), "utf-8"));
      const location = `prefab "${prefabName}"`;

      for (const compName of Object.keys(prefab.components || {})) allComponents.add(compName);
      for (const scriptName of prefab.scripts || []) addScriptRef(scriptName, location);

      const rootLines: string[] = [
        `  const entity = engine.createEntity(id ?? engine._generateId("${prefabName}"));`,
        `  entity.prefabName = "${prefabName}";`,
      ];
      for (const [compName, data] of Object.entries(prefab.components || {})) {
        checkAnimatorClipRefs(compName, data, location);
        rootLines.push(
          `  entity.addComponent(${compName}_component, { ...${JSON.stringify(data)}, ...(overrides.${compName} || {}) });`
        );
      }
      checkSpriteFrameRefs(prefab.components, location);
      for (const scriptName of prefab.scripts || []) {
        rootLines.push(`  entity.attachScript(${scriptSymbol(scriptName)}_script);`);
      }
      if (prefab.children && Object.keys(prefab.children).length > 0) {
        rootLines.push(`  const childOverrides = overrides.children || {};`);
        rootLines.push(...renderPrefabChildren(prefab.children, "entity", "", "  ", prefabName));
      }
      rootLines.push(`  return entity;`);

      prefabFunctions.push(
        `function prefab_${prefabName}(engine, overrides = {}, id = null) {\n${rootLines.join("\n")}\n}`
      );
      prefabRegistrations.push(`  engine.prefabs.register("${prefabName}", prefab_${prefabName});`);
    }

    if (fs.existsSync(scriptsDir)) {
      for (const file of fs.readdirSync(scriptsDir).sort()) {
        let name: string | null = null;

        if (file.endsWith(".lgscript.json")) {
          name = file.slice(0, -".lgscript.json".length);
        } else if (file.endsWith(".lgscript.js")) {
          continue;
        } else if (file.endsWith(".js")) {
          name = path.basename(file, ".js");
        }

        if (!name) continue;
        addScriptRef(name, "registered from scripts/ (not attached to any entity/prefab)");
      }
    }

    const componentImports = [...allComponents].map((name) => {
      const entry = manifest[name];
      if (!entry) throw new Error(`Component "${name}" not found in engine or project`);
      const importPath = entry.source === "engine" ? `../engine/components/${entry.filename}` : `./components/${entry.filename}`;
      return `import { ${name} as ${name}_component } from "${importPath}";`;
    }).join("\n");

    // Scripts import with a suffixed alias (e.g. `testScript` -> `testScript_script`).
    // Missing scripts and case mismatches are now caught earlier in addScriptRef
    // (thrown, failing the build) — by the time we get here every entry in
    // allScripts is guaranteed to have a real file on disk with matching casing.
    const scriptImports = (() => {
      const seenSymbols = new Set<string>();
      const lines: string[] = [];

      for (const name of allScripts.keys()) {
        const graphPath = path.join(scriptsDir, graphFilename(name));
        const symbol = scriptSymbol(name);
        if (seenSymbols.has(symbol)) continue;
        seenSymbols.add(symbol);

        const filename = fs.existsSync(graphPath) ? compiledGraphFilename(name) : `${name}.js`;
        lines.push(`import { ${symbol} as ${symbol}_script } from "./scripts/${filename}";`);
      }

      return lines.join("\n");
    })();

    const sceneRegistrations = sceneFiles
      .map((f) => path.basename(f, ".json"))
      .map((name) => {
        const cameraId = sceneCameraIds.get(name);
        return `  engine.registerScene("${name}", scene_${name}, ${JSON.stringify(cameraId)});`;
      })
      .join("\n");

    for (const asset of Object.values(assetManifest)) {
      if (asset.type === "texture") asset.relativePath = compiledTextureFilename(asset.relativePath);
    }

    const engineScriptRegistrations = (() => {
      const seenSymbols = new Set<string>();
      const lines: string[] = [];
      for (const name of allScripts.keys()) {
        const symbol = scriptSymbol(name);
        if (seenSymbols.has(symbol)) continue;
        seenSymbols.add(symbol);
        lines.push(`  engine.registerScript("${name}", ${symbol}_script);`);
      }
      return lines.join("\n");
    })();

    // Clips are invoked on demand by name (Animator.play("clipName")), never
    // auto-run, so — like scripts — they're registered into a flat runtime
    // registry rather than baked per-reference like prefab component data.
    const animationRegistrations = animationFiles
      .map((file) => {
        const name = path.basename(file, ".json");
        const data = JSON.parse(fs.readFileSync(path.join(animationsDir, file), "utf-8"));
        return `  engine.registerAnimation(${JSON.stringify(name)}, ${JSON.stringify(data)});`;
      })
      .join("\n");

    return `${componentImports}
  
  
  ${scriptImports}
  
  ${prefabFunctions.join("\n\n")}
  
  ${sceneFunctions.join("\n\n")}
  
  export async function init(engine) {
    await engine.assets.load(${JSON.stringify(assetManifest)}, "./game/assets");
  ${prefabRegistrations.join("\n")}
  ${sceneRegistrations}
  ${engineScriptRegistrations}
  ${animationRegistrations}
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
