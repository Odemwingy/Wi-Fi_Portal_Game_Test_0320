import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const stackServices = ["redis", "platform-api", "channel-web"];
const webBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
const apiHealthUrl =
  process.env.PLATFORM_API_HEALTH_URL ?? "http://127.0.0.1:3000/api/health";

function logStep(message) {
  console.log(`[release-check] ${message}`);
}

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

async function runCommandWithRetry(command, args, options = {}) {
  const retries = options.retries ?? 0;
  const delayMs = options.delayMs ?? 5_000;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      await runCommand(command, args, options);
      return;
    } catch (error) {
      if (attempt > retries) {
        throw error;
      }

      console.warn(
        `[release-check] retrying ${command} ${args.join(" ")} after failed attempt ${attempt}/${retries + 1}`
      );
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
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
    logStep("running lint");
    await runCommand("pnpm", ["lint"]);

    logStep("running unit and integration tests");
    await runCommand("pnpm", ["test"]);

    logStep("building workspace packages");
    await runCommand("pnpm", ["build"]);

    logStep("starting docker compose release stack");
    await runCommandWithRetry(
      "docker",
      [
        "compose",
        "up",
        "-d",
        "--build",
        ...stackServices
      ],
      {
        delayMs: 5_000,
        retries: 2
      }
    );
    stackStarted = true;

    logStep("waiting for platform api health");
    await waitForHttpOk(apiHealthUrl, "platform api health");

    logStep("waiting for channel web");
    await waitForHttpOk(webBaseUrl, "channel web");

    logStep("running api smoke");
    await runCommand("pnpm", ["test:smoke"]);

    logStep("running browser smoke");
    await runCommand("pnpm", ["exec", "playwright", "test"], {
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: webBaseUrl
      }
    });

    logStep("release gate passed");
  } finally {
    if (stackStarted) {
      logStep("stopping docker compose release stack");
      await runCommand("docker", ["compose", "stop", ...stackServices]).catch(
        () => {}
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `[release-check] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
