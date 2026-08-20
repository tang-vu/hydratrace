import { spawn } from "node:child_process";

async function runPnpm(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const windows = process.platform === "win32";
    const child = windows
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm", script], { stdio: "inherit" })
      : spawn("pnpm", [script], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pnpm ${script} exited with code ${code}`)));
  });
}

await runPnpm("hydra:prepare");
await runPnpm("hydra:up");
await runPnpm("hydra:wait");
await runPnpm("hydra:smoke");
await runPnpm("demo:verify");
console.log("Starting HydraTrace at http://127.0.0.1:3000");
const child = process.platform === "win32"
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm", "dev"], { stdio: "inherit" })
  : spawn("pnpm", ["dev"], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
