import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "server.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file at ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (typeof parsed.port !== "number") {
    throw new Error("server.json is missing a valid 'port' number");
  }

  return {
    port: parsed.port,
    host: parsed.host || "localhost",
  };
}

export const config = loadConfig();