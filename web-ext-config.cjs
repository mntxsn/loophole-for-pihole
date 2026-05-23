// Used by `web-ext lint` and `web-ext build` when run from the repo root.
// Everything listed here is excluded from both the lint scan and the .zip.
module.exports = {
  ignoreFiles: [
    "scripts/**",
    "dist/**",
    "docs/**",
    ".github/**",
    ".claude/**",
    "CHANGELOG.md",
    "README.md",
    "LICENSE",
    ".gitignore",
    "web-ext-config.cjs",
  ],
};
