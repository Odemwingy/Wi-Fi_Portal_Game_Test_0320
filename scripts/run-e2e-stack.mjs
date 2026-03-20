import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const composeArgs = ["compose"];
const stackServices = ["redis", "platform-api", "channel-web"];
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const apiUrl = process.env.PLATFORM_API_BASE_URL ?? "http://127.0.0.1:3000/api/health";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${code ?? "null"}${signal ? ` (${signal})` : ""}`
        )
      );
    });
    child.on("error", reject);
  });
}

async function waitForHttpOk(url, label, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the service is reachable.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1_500);
    });
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function main() {
  let stackStarted = false;

  try {
    await runCommand("docker", [
      ...composeArgs,
      "up",
      "-d",
      "--build",
      ...stackServices
    ]);
    stackStarted = true;

    await waitForHttpOk(apiUrl, "platform api health");
    await waitForHttpOk(baseUrl, "channel web");

    await runCommand("pnpm", ["exec", "playwright", "test"], {
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseUrl
      }
    });
  } finally {
    if (stackStarted) {
      await runCommand("docker", [...composeArgs, "stop", ...stackServices]).catch(
        () => {}
      );
    }
  }
}

main().catch((error) => {
  console.error(`[e2e-stack] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
