import { spawn } from "node:child_process";
const children = ["dev:web", "dev:server"].map((script) =>
  spawn("pnpm", [script], { stdio: "inherit" }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => children.forEach((child) => child.kill(signal)));
