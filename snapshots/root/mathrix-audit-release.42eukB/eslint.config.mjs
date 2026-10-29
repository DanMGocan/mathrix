import next from "eslint-config-next/core-web-vitals";
const config = [
  ...next,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
      "var/**",
      "backups/**",
    ],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: [
      "lib/**/*.ts",
      "server/**/*.ts",
      "scripts/**/*.ts",
      "tests/**/*.ts",
    ],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];
export default config;
