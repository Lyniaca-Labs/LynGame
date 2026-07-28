import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Kills any process currently listening on the given TCP port.
 * Works on Windows (netstat + taskkill) and macOS/Linux (lsof + kill).
 * Resolves silently if nothing is listening.
 */
export async function killPort(port) {
  const platform = process.platform;

  try {
    if (platform === "win32") {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const pids = new Set(
        stdout
          .split("\n")
          .map((line) => line.trim().split(/\s+/))
          .filter((parts) => parts.length >= 5 && parts[3] === "LISTENING")
          .map((parts) => parts[4])
      );

      for (const pid of pids) {
        if (pid === String(process.pid)) continue; // don't kill self
        try {
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (err) {
          console.warn(`Could not kill PID ${pid}:`, err.message);
        }
      }
    } else {
      // macOS / Linux
      const { stdout } = await execAsync(`lsof -ti tcp:${port}`);
      const pids = stdout.split("\n").map((p) => p.trim()).filter(Boolean);

      for (const pid of pids) {
        if (pid === String(process.pid)) continue;
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (err) {
          console.warn(`Could not kill PID ${pid}:`, err.message);
        }
      }
    }
  } catch (err) {
    // netstat/lsof throw a non-zero exit code when nothing matches — that's fine, just means the port is free
    if (!/no.*process|not found/i.test(err.message)) {
      // only log unexpected errors
    }
  }
}