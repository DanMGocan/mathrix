import config from "./playwright.config";
const ui = ["**/practice.e2e.ts", "**/shortcuts.e2e.ts"];
export default {
  ...config,
  projects: [
    {
      name: "game-ui",
      testMatch: ui,
    },
    {
      name: "regressions",
      testIgnore: ui,
      grep: [/Vs AI guest/, /pregame ads and synchronized start: Premium/],
      dependencies: ["game-ui"],
    },
  ],
};
