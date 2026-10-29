'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createModuleLoader } = require('./harness.cjs');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');
const businessRoot = path.join(sourceRoot, 'business');
const technicalRoot = path.join(sourceRoot, 'technical');
const compositionRoot = path.join(sourceRoot, 'composition');

function isInside(filename, directory) {
  return filename.startsWith(directory + path.sep);
}

async function listJavaScript(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScript(filename));
    else if (entry.name.endsWith('.js')) files.push(filename);
  }
  return files;
}

async function readModuleGraph() {
  const files = [
    ...await listJavaScript(sourceRoot),
    ...['background.js', 'popup.js', 'report.js'].map((name) => path.join(projectRoot, name))
  ];
  const graph = new Map();
  for (const filename of files) {
    const source = await fs.readFile(filename, 'utf8');
    const module = new vm.SourceTextModule(source, { identifier: filename });
    const dependencies = module.dependencySpecifiers.map((specifier) => {
      assert.ok(specifier.startsWith('.'), filename + ': use explicit local imports');
      return path.resolve(path.dirname(filename), specifier);
    });
    graph.set(filename, dependencies);
  }
  return graph;
}

test('business and technical code have explicit, one-way import boundaries', async () => {
  const directories = (await fs.readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, ['business', 'composition', 'technical']);

  const graph = await readModuleGraph();
  for (const [filename, dependencies] of graph) {
    for (const dependency of dependencies) {
      assert.ok(graph.has(dependency), filename + ': missing local module ' + dependency);
      if (isInside(filename, businessRoot)) {
        assert.ok(isInside(dependency, businessRoot),
          filename + ': business code must receive technical capabilities through ports');
      }
      if (isInside(filename, technicalRoot)) {
        assert.ok(isInside(dependency, sourceRoot) && !isInside(dependency, compositionRoot),
          filename + ': adapters must not depend on application composition or entry points');
      }
    }
  }
});

test('production imports contain no dependency cycles', async () => {
  const graph = await readModuleGraph();
  const visited = new Set();

  function visit(filename, route) {
    assert.ok(!route.includes(filename), 'Import cycle: ' + [...route, filename].join(' -> '));
    if (visited.has(filename)) return;
    for (const dependency of graph.get(filename) || []) {
      visit(dependency, [...route, filename]);
    }
    visited.add(filename);
  }

  for (const filename of graph.keys()) visit(filename, []);
});

test('business modules load without Chrome, DOM, file encoders or timers', async () => {
  // Analiza adresu URL nie ma efektów ubocznych. Celowo nie udostępniamy tu operacji wejścia i wyjścia przeglądarki.
  const context = vm.createContext({ URL });
  const loader = createModuleLoader(context);
  const files = await listJavaScript(businessRoot);
  assert.ok(files.length > 0);
  for (const filename of files) await loader.load(filename);
});
