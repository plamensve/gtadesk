import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const modules = ["login", "dashboard", "zaraex", "certifications"];
const pages = ["index.html", "dashboard.html", "zaraex.html", "certifications.html"];
const allJS = [...modules, "navigation", "globe", "orbits", "dom"];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertResolved(from, ref) {
  if (!ref || ref.startsWith("#") || /^(https?:|data:|mailto:|javascript:)/.test(ref)) return;
  const value = ref.split(/[?#]/)[0];
  if (!value || value === "/") return;
  const target = resolve(root, dirname(from), value);
  assert.ok(target.startsWith(root), `Invalid relative path: ${from} -> ${ref}`);
  assert.ok(existsSync(target), `Missing file: ${from} -> ${ref}`);
}

test("HTML uses external styles and scripts only", () => {
  for (const [i, page] of pages.entries()) {
    const html = read(page);
    const name = modules[i];

    assert.doesNotMatch(html, /<style(?:\s|>)/i, page);
    assert.doesNotMatch(html, /\sstyle\s*=\s*["']/i, page);
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
    assert.ok(scripts.length > 0, page);
    for (const script of scripts) assert.match(script[0], /\bsrc\s*=/i, page);
    assert.ok(html.includes(`assets/css/${name}.css`), page);
    assert.ok(html.includes(`assets/js/${name}.js`), page);

    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      assertResolved(page, match[1]);
    }
  }
});

test("CSS local backgrounds resolve against the stylesheet directory", () => {
  for (const name of [...modules, "sidebar", "globe"]) {
    const path = `assets/css/${name}.css`;
    const css = read(path);
    assert.ok(css.trim(), path);
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      assertResolved(path, match[1]);
    }
  }
});

test("browser JS parses and local module imports resolve", () => {
  for (const name of allJS) {
    const path = `assets/js/${name}.js`;
    const js = read(path);
    assert.ok(js.trim(), path);
    execFileSync(process.execPath, ["--check", join(root, path)], { stdio: "pipe" });
    for (const match of js.matchAll(/\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      assertResolved(path, match[1]);
    }
  }
  execFileSync(process.execPath, ["--check", join(root, "config.js")], { stdio: "pipe" });
});

test("navigation links use canonical tab routes", () => {
  for (const page of pages.slice(1)) {
    const html = read(page);
    assert.ok(html.includes("assets/js/navigation.js"), page);
    for (const tab of ["loads", "settings", "stay", "pdf"]) {
      assert.ok(html.includes(`zaraex.html?tab=${tab}`), `${page}: missing ${tab}`);
      assert.ok(!html.includes(`zaraex.html#${tab}`), `${page}: legacy hash ${tab}`);
    }
  }
});
