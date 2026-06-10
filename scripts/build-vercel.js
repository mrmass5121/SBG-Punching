const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");

const dirsToCopy = [
  "admin",
  "assets",
  "components",
  "cnc-punching",
  "control-panel-enclosures",
  "css",
  "fonts",
  "img",
  "js",
  "laser-cutting",
  "ms-sheet-cutting",
  "sheet-metal-bending",
  "sheet-metal-fabrication",
  "stainless-steel-cutting",
  "public"
];

const filesToCopy = [
  "index.html",
  "404.html",
  "manifest.webmanifest",
  "robots.txt",
  "service-worker.js",
  "sitemap.xml"
];

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true });
}

function copyFile(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const dir of dirsToCopy) {
  copyDirectory(path.join(root, dir), path.join(outDir, dir));
}

for (const file of filesToCopy) {
  copyFile(path.join(root, file), path.join(outDir, file));
}

console.log("Vercel static output created in dist.");
