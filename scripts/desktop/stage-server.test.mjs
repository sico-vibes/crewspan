import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { stageServer, verifyStage } from './stage-server.mjs';

const FIXED_NOW = '2026-09-30T12:34:56.000Z';
const PRUNED_PROD_FILES = [
  'pkg/types.d.ts', 'pkg/types.d.mts', 'pkg/types.d.cts',
  'pkg/types.d.ts.map', 'pkg/types.d.mts.map', 'pkg/types.d.cts.map',
  'pkg/bundle.js.map', 'pkg/bundle.mjs.map', 'pkg/bundle.cjs.map', 'pkg/styles.css.map', 'pkg/other.map',
];

function write(root, relative, contents = 'fixture') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function packageAt(root, dir, name, manifest = {}) {
  const target = path.join(root, dir);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, ...manifest }, null, 2));
  write(target, 'src/index.ts', `export const name = ${JSON.stringify(name)};`);
  write(target, 'dist/index.js', `module.exports = ${JSON.stringify(name)};`);
  return target;
}

function fixture(t, { serverUi = true, rootName = 'fixture' } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewspan-stage-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, rootName);
  const prodModules = path.join(temp, 'prod-modules');
  const out = path.join(temp, 'stage');
  fs.mkdirSync(repo, { recursive: true });
  write(repo, 'server/dist/index.js', 'server entry');
  write(repo, 'server/package.json', JSON.stringify({
    name: '@paperclipai/server',
    publishConfig: { files: ['dist', 'ui-dist', 'skills'], exports: { './main': './dist/index.js' } },
    dependencies: { '@paperclipai/alpha': 'workspace:*', 'external-package': '^1.0.0' },
    optionalDependencies: { '@paperclipai/server-helper': 'workspace:*' },
    devDependencies: { '@paperclipai/dev-only': 'workspace:*' },
  }, null, 2));
  write(repo, 'desktop/sidecar/entry.mjs', "import '../app/server/dist/index.js';\n");
  write(repo, 'desktop/sidecar/db-template-seed.mjs', 'export const seedDatabaseFromTemplate = () => {};\n');
  if (serverUi) write(repo, 'server/ui-dist/index.html', '<main>ui</main>');
  else write(repo, 'ui/dist/index.html', '<main>ui fallback</main>');
  write(repo, 'server/skills/README.md', 'skills');
  write(repo, 'server/dist/types.d.ts', 'server declaration stays');
  write(repo, 'server/dist/index.js.map', 'server map stays');
  packageAt(repo, 'packages/alpha', '@paperclipai/alpha', {
    publishConfig: { files: ['dist'], exports: { '.': './dist/index.js' } },
    dependencies: { '@paperclipai/beta': 'workspace:*', 'outside-map': '^1.0.0' },
    devDependencies: { '@paperclipai/dev-only': 'workspace:*' },
    peerDependencies: { '@paperclipai/peer-only': 'workspace:*' },
  });
  write(repo, 'packages/alpha/src/types.d.ts', 'workspace declaration stays');
  write(repo, 'packages/alpha/dist/index.js.map', 'workspace map stays');
  write(repo, 'packages/alpha/node_modules/local-link-placeholder/file.txt', 'excluded');
  write(repo, 'packages/alpha/.turbo/state.json', '{}');
  write(repo, 'packages/alpha/coverage/coverage.json', '{}');
  write(repo, 'packages/alpha/build.tsbuildinfo', '{}');
  packageAt(repo, 'packages/adapters/beta', '@paperclipai/beta', {
    publishConfig: { files: ['dist'], exports: { '.': './dist/index.js' } },
    optionalDependencies: { '@paperclipai/server-helper': 'workspace:*' },
    dependencies: { '@paperclipai/ignored-recursive': 'workspace:*' },
  });
  packageAt(repo, 'packages/server-helper', '@paperclipai/server-helper', {
    publishConfig: { files: ['dist'], exports: { '.': './dist/index.js' } },
  });
  packageAt(repo, 'packages/dev-only', '@paperclipai/dev-only');
  packageAt(repo, 'packages/peer-only', '@paperclipai/peer-only');
  const modules = path.join(prodModules, '');
  write(modules, 'tsx/dist/loader.mjs', 'loader');
  write(modules, 'lodash/index.js', 'lodash');
  write(modules, '.bin/tsx', 'shim');
  write(modules, 'some-package/.cache/cache.json', '{}');
  write(modules, 'some-package/index.js', 'package');
  for (const relative of PRUNED_PROD_FILES) write(modules, relative, `prune:${relative}`);
  write(modules, 'pkg/runtime.ts', 'typescript runtime source');
  write(modules, 'pkg/runtime.mts', 'module typescript runtime source');
  write(modules, 'pkg/dir.map/directory-content.js', 'directory names are not pruned');
  return { temp, repo, prodModules, out };
}

function opts(f, extra = {}) {
  return { repo: f.repo, prodModules: f.prodModules, out: f.out, now: FIXED_NOW, loader: 'tsx', ...extra };
}

function treeCounts(root) {
  let files = 0;
  let directories = 0;
  let bytes = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory() && !stat.isSymbolicLink()) { directories += 1; visit(target); }
      else if (stat.isFile() && !stat.isSymbolicLink()) { files += 1; bytes += stat.size; }
    }
  };
  visit(root);
  return { files, directories, bytes };
}

function snapshotTree(root) {
  const result = [];
  const visit = (dir, relative = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.join(relative, entry.name);
      const target = path.join(dir, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) result.push([rel, 'link', fs.readlinkSync(target)]);
      else if (stat.isDirectory()) { result.push([rel, 'dir']); visit(target, rel); }
      else if (stat.isFile()) result.push([rel, 'file', fs.readFileSync(target).toString('base64')]);
      else result.push([rel, 'other']);
    }
  };
  visit(root);
  return result;
}

function partialEntries(parent, base) {
  return fs.readdirSync(parent).filter((name) => name.startsWith(`${base}.partial-`));
}

test('stages a self-contained layout with a stable, valid manifest and transitive workspace closure', async (t) => {
  const f = fixture(t);
  const manifest = await stageServer(opts(f));
  assert.deepEqual(manifest.closure, ['@paperclipai/alpha', '@paperclipai/beta', '@paperclipai/server-helper']);
  assert.equal(manifest.generatedAt, FIXED_NOW);
  assert.deepEqual(manifest.entries, ['app', 'sidecar', 'stage-manifest.json']);
  assert.equal(fs.readFileSync(path.join(f.out, 'app/server/dist/index.js'), 'utf8'), 'server entry');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/server/ui-dist/index.html'), 'utf8'), '<main>ui</main>');
  assert.equal(fs.readFileSync(path.join(f.out, 'sidecar/entry.mjs'), 'utf8'), "import '../app/server/dist/index.js';\n");
  assert.equal(fs.readFileSync(path.join(f.out, 'sidecar/db-template-seed.mjs'), 'utf8'), 'export const seedDatabaseFromTemplate = () => {};\n');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/tsx/dist/loader.mjs'), 'utf8'), 'loader');
  assert.equal(manifest.pathBudget.installPrefixLength, 60);
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/src/index.ts'), 'utf8').includes('@paperclipai/alpha'), true);
  assert.equal(fs.lstatSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha')).isDirectory(), true);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/node_modules')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/.turbo')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/coverage')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/build.tsbuildinfo')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/dev-only')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/peer-only')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/.bin')), false);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/some-package/.cache')), false);
  assert.equal(manifest.counts.files > 0, true);
  assert.deepEqual(manifest.counts, treeCounts(f.out));
  const onDisk = JSON.parse(fs.readFileSync(path.join(f.out, 'stage-manifest.json'), 'utf8'));
  assert.deepEqual(onDisk, manifest);
  assert.equal((await verifyStage(f.out)).ok, true);
});

test('stage verification rejects a missing sidecar import dependency', async (t) => {
  const f = fixture(t);
  await stageServer(opts(f));
  fs.rmSync(path.join(f.out, 'sidecar/db-template-seed.mjs'));
  const result = await verifyStage(f.out);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /sidecar database-template seed module/);
});

test('prunes production declarations and maps only, records stable counts, and keeps workspace/server files', async (t) => {
  const f = fixture(t);
  const expectedBytes = PRUNED_PROD_FILES.reduce((sum, relative) => sum + fs.statSync(path.join(f.prodModules, relative)).size, 0);
  const manifest = await stageServer(opts(f));
  assert.deepEqual(manifest.pruned, { enabled: true, files: PRUNED_PROD_FILES.length, bytes: expectedBytes });
  for (const relative of PRUNED_PROD_FILES) assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules', relative)), false, relative);
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/pkg/runtime.ts'), 'utf8'), 'typescript runtime source');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/pkg/runtime.mts'), 'utf8'), 'module typescript runtime source');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/pkg/dir.map/directory-content.js'), 'utf8'), 'directory names are not pruned');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/src/types.d.ts'), 'utf8'), 'workspace declaration stays');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/dist/index.js.map'), 'utf8'), 'workspace map stays');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/server/dist/types.d.ts'), 'utf8'), 'server declaration stays');
  assert.equal(fs.readFileSync(path.join(f.out, 'app/server/dist/index.js.map'), 'utf8'), 'server map stays');
  assert.equal((await verifyStage(f.out)).ok, true);

  const firstManifest = fs.readFileSync(path.join(f.out, 'stage-manifest.json'));
  await stageServer(opts(f, { force: true }));
  assert.deepEqual(fs.readFileSync(path.join(f.out, 'stage-manifest.json')), firstManifest);
});

test('--no-prune behavior (pruneTypes:false) keeps production declarations and maps', async (t) => {
  const f = fixture(t);
  const manifest = await stageServer(opts(f, { pruneTypes: false }));
  assert.deepEqual(manifest.pruned, { enabled: false, files: 0, bytes: 0 });
  for (const relative of PRUNED_PROD_FILES) assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules', relative)), true, relative);
  assert.equal((await verifyStage(f.out)).ok, true);
});

test('uses ui/dist when server/ui-dist is absent', async (t) => {
  const f = fixture(t, { serverUi: false });
  await stageServer(opts(f));
  assert.equal(fs.readFileSync(path.join(f.out, 'app/server/ui-dist/index.html'), 'utf8'), '<main>ui fallback</main>');
});

test('fails clearly for missing required build inputs', async (t) => {
  const f1 = fixture(t);
  fs.rmSync(path.join(f1.repo, 'server/dist/index.js'));
  const f1Before = { repo: snapshotTree(f1.repo), modules: snapshotTree(f1.prodModules) };
  await assert.rejects(stageServer(opts(f1)), /Missing built server entry/);
  assert.deepEqual(snapshotTree(f1.repo), f1Before.repo);
  assert.deepEqual(snapshotTree(f1.prodModules), f1Before.modules);
  assert.equal(fs.existsSync(f1.out), false);

  const f2 = fixture(t);
  fs.rmSync(path.join(f2.prodModules, 'tsx/dist/loader.mjs'));
  const f2Before = { repo: snapshotTree(f2.repo), modules: snapshotTree(f2.prodModules) };
  await assert.rejects(stageServer(opts(f2)), /Missing production tsx loader/);
  assert.deepEqual(snapshotTree(f2.repo), f2Before.repo);
  assert.deepEqual(snapshotTree(f2.prodModules), f2Before.modules);
  assert.equal(fs.existsSync(f2.out), false);

  const f3 = fixture(t);
  fs.rmSync(path.join(f3.repo, 'server/ui-dist'), { recursive: true });
  fs.rmSync(path.join(f3.repo, 'ui'), { recursive: true, force: true });
  const f3Before = { repo: snapshotTree(f3.repo), modules: snapshotTree(f3.prodModules) };
  await assert.rejects(stageServer(opts(f3)), /Missing UI output/);
  assert.deepEqual(snapshotTree(f3.repo), f3Before.repo);
  assert.deepEqual(snapshotTree(f3.prodModules), f3Before.modules);
  assert.equal(fs.existsSync(f3.out), false);
});

test('rejects arbitrary non-empty output with force and replaces a prior stage only', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.out);
  write(f.temp, 'stage/old.txt', 'old');
  await assert.rejects(stageServer(opts(f)), /not empty; pass --force/);
  const sourceBefore = snapshotTree(f.repo);
  const modulesBefore = snapshotTree(f.prodModules);
  await assert.rejects(stageServer(opts(f, { force: true })), /stage-manifest\.json.*schemaVersion 1/);
  assert.deepEqual(snapshotTree(f.repo), sourceBefore);
  assert.deepEqual(snapshotTree(f.prodModules), modulesBefore);
  fs.rmSync(f.out, { recursive: true });

  await stageServer(opts(f));
  write(f.out, 'old-stage-marker.txt', 'replace me');
  const outside = path.join(f.temp, 'keep.txt');
  fs.writeFileSync(outside, 'preserve');
  await stageServer(opts(f, { force: true }));
  assert.equal(fs.existsSync(path.join(f.out, 'old-stage-marker.txt')), false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
});

test('refuses output directory that contains the repo', async (t) => {
  const f = fixture(t);
  const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules) };
  await assert.rejects(stageServer({ ...opts(f), out: f.temp }), /overlaps source tree/);
  await assert.rejects(stageServer({ ...opts(f), out: path.parse(f.out).root }), /filesystem root/);
  assert.deepEqual(snapshotTree(f.repo), before.repo);
  assert.deepEqual(snapshotTree(f.prodModules), before.modules);
});

test('rejects unsafe workspace names before writing and leaves a sibling canary untouched', async (t) => {
  const f = fixture(t);
  const canary = path.join(f.temp, 'sibling-canary');
  write(canary, 'keep.txt', 'canary bytes');
  const names = [
    '@paperclipai/..\\..\\evil',
    '@paperclipai/..',
    '@paperclipai/.',
    '@paperclipai/',
    '@paperclipai//evil',
    '../evil',
    path.resolve(f.temp, 'absolute-package'),
    '@paperclipai/Uppercase',
  ];
  for (const name of names) {
    const packageJson = path.join(f.repo, 'packages', 'alpha', 'package.json');
    const original = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    original.name = name;
    fs.writeFileSync(packageJson, JSON.stringify(original, null, 2));
    const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules), canary: snapshotTree(canary) };
    await assert.rejects(stageServer(opts(f)), /Invalid workspace package name/);
    assert.deepEqual(snapshotTree(f.repo), before.repo);
    assert.deepEqual(snapshotTree(f.prodModules), before.modules);
    assert.deepEqual(snapshotTree(canary), before.canary);
    assert.equal(fs.existsSync(f.out), false);
    assert.deepEqual(partialEntries(f.temp, path.basename(f.out)), []);
    original.name = '@paperclipai/alpha';
    fs.writeFileSync(packageJson, JSON.stringify(original, null, 2));
  }
});

test('refuses output paths overlapping repo source trees without changing sources', async (t) => {
  const f = fixture(t);
  for (const relative of ['server', 'packages/alpha', 'ui']) {
    const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules) };
    await assert.rejects(stageServer({ ...opts(f), out: path.join(f.repo, relative), force: true }), /overlaps source tree/);
    assert.deepEqual(snapshotTree(f.repo), before.repo);
    assert.deepEqual(snapshotTree(f.prodModules), before.modules);
  }
  const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules) };
  await assert.rejects(stageServer({ ...opts(f), out: f.temp, force: true }), /overlaps source tree/);
  assert.deepEqual(snapshotTree(f.repo), before.repo);
  assert.deepEqual(snapshotTree(f.prodModules), before.modules);
});

test('refuses output inside production modules, sidecar, or node runtime sources', async (t) => {
  const f = fixture(t);
  const nodeDir = path.join(f.temp, 'runtime-source');
  write(nodeDir, 'node', 'runtime bytes');
  const sources = [
    { out: path.join(f.prodModules, 'nested-stage'), options: {} },
    { out: path.join(f.repo, 'desktop', 'sidecar', 'nested-stage'), options: {} },
    { out: path.join(nodeDir, 'nested-stage'), options: { nodeDir } },
  ];
  for (const { out, options } of sources) {
    const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules), node: snapshotTree(nodeDir) };
    await assert.rejects(stageServer({ ...opts(f, options), out, force: true }), /overlaps source tree/);
    assert.deepEqual(snapshotTree(f.repo), before.repo);
    assert.deepEqual(snapshotTree(f.prodModules), before.modules);
    assert.deepEqual(snapshotTree(nodeDir), before.node);
    assert.deepEqual(partialEntries(path.dirname(out), path.basename(out)), []);
  }
});

test('refuses symlink output paths inside the repo without touching sources', async (t) => {
  const f = fixture(t);
  const external = path.join(f.temp, 'external-target');
  fs.mkdirSync(external);
  const link = path.join(f.repo, 'desktop', 'stage-link');
  try { fs.symlinkSync(external, link, 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) { t.skip(`platform refuses symlink creation: ${error.code}`); return; }
    throw error;
  }
  const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules), external: snapshotTree(external) };
  await assert.rejects(stageServer({ ...opts(f), out: path.join(link, 'stage'), force: true }), /symlink in output path/);
  assert.deepEqual(snapshotTree(f.repo), before.repo);
  assert.deepEqual(snapshotTree(f.prodModules), before.modules);
  assert.deepEqual(snapshotTree(external), before.external);
});

test('allows the designated repo desktop stage directory', async (t) => {
  const f = fixture(t);
  const out = path.join(f.repo, 'desktop', 'stage');
  const manifest = await stageServer({ ...opts(f), out });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal((await verifyStage(out)).ok, true);
});

test('fails when a scanned package.json exists but is not a regular file', async (t) => {
  const f = fixture(t);
  const packageJson = path.join(f.repo, 'packages', 'invalid-package-json', 'package.json');
  fs.mkdirSync(packageJson, { recursive: true });
  const before = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules) };
  await assert.rejects(stageServer(opts(f)), /Workspace package\.json must be a regular file: packages[\\/]invalid-package-json[\\/]package\.json/);
  assert.deepEqual(snapshotTree(f.repo), before.repo);
  assert.deepEqual(snapshotTree(f.prodModules), before.modules);
  assert.equal(fs.existsSync(f.out), false);
});

test('reports symlinks skipped inside copied workspace packages with stage-relative paths', async (t) => {
  const f = fixture(t);
  try {
    fs.symlinkSync(f.prodModules, path.join(f.repo, 'packages', 'alpha', 'linked-modules'), 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) { t.skip(`platform refuses symlink creation: ${error.code}`); return; }
    throw error;
  }
  const manifest = await stageServer(opts(f));
  assert.deepEqual(manifest.skippedSymlinks, ['app/node_modules/@paperclipai/alpha/linked-modules']);
  assert.equal(manifest.skippedSymlinks.some((entry) => path.isAbsolute(entry)), false);
});

test('stages from a repo reached through a symlinked parent', async (t) => {
  const f = fixture(t);
  const realParent = path.join(f.temp, 'real-parent');
  const realRepo = path.join(realParent, 'repo');
  const aliasParent = path.join(f.temp, 'alias-parent');
  fs.mkdirSync(realParent);
  fs.renameSync(f.repo, realRepo);
  try { fs.symlinkSync(realParent, aliasParent, 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) { t.skip(`platform refuses symlink creation: ${error.code}`); return; }
    throw error;
  }
  f.repo = path.join(aliasParent, 'repo');
  const manifest = await stageServer(opts(f));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal((await verifyStage(f.out)).ok, true);
});

test('validates platform and node-dir before creating output or partial directories', async (t) => {
  const f = fixture(t);
  const nodeDir = path.join(f.temp, 'runtime');
  fs.mkdirSync(nodeDir);
  await assert.rejects(stageServer(opts(f, { platform: 'win32-arm64' })), /Unsupported platform/);
  await assert.rejects(stageServer(opts(f, { platform: 'win32-x64', nodeDir })), /Missing bundled runtime/);
  assert.equal(fs.existsSync(f.out), false);
  assert.deepEqual(partialEntries(f.temp, path.basename(f.out)), []);
});

test('verifyStage can require the platform runtime', async (t) => {
  const f = fixture(t);
  const absent = await stageServer(opts(f));
  assert.equal(absent.schemaVersion, 1);
  const missing = await verifyStage(f.out, { requireRuntime: true, platform: 'linux-x64' });
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join('\n'), /Missing bundled runtime: runtime\/node/);

  const f2 = fixture(t);
  const nodeDir = path.join(f2.temp, 'runtime');
  write(nodeDir, 'node', 'node runtime');
  await stageServer(opts(f2, { nodeDir, platform: 'linux-x64', requireRuntime: true }));
  assert.equal((await verifyStage(f2.out, { requireRuntime: true })).ok, true);
});

test('late verification failure removes only its partial stage and preserves existing output', async (t) => {
  const f = fixture(t);
  await stageServer(opts(f));
  write(f.out, 'keep.txt', 'old output');
  const oldOutput = snapshotTree(f.out);
  write(f.repo, 'packages/alpha/.bin/shim', 'forbidden by verifyStage');
  const sources = { repo: snapshotTree(f.repo), modules: snapshotTree(f.prodModules) };
  await assert.rejects(stageServer(opts(f, { force: true })), /Forbidden \.bin directories/);
  assert.deepEqual(snapshotTree(f.out), oldOutput);
  assert.deepEqual(snapshotTree(f.repo), sources.repo);
  assert.deepEqual(snapshotTree(f.prodModules), sources.modules);
  assert.deepEqual(partialEntries(f.temp, path.basename(f.out)), []);
  assert.deepEqual(fs.readdirSync(f.temp).filter((name) => name.startsWith(`${path.basename(f.out)}.backup-`)), []);
});

test('skips and reports production module symlinks (when supported)', async (t) => {
  const f = fixture(t);
  const link = path.join(f.prodModules, 'linked-package');
  try { fs.symlinkSync(path.join(f.prodModules, 'lodash'), link, 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) { t.skip(`platform refuses symlink creation: ${error.code}`); return; }
    throw error;
  }
  const manifest = await stageServer(opts(f));
  assert.deepEqual(manifest.skippedSymlinks, ['app/node_modules/linked-package']);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/linked-package')), false);
});

test('verifyStage reports symlinks, .bin directories, and missing workspace packages', async (t) => {
  const f = fixture(t);
  const manifest = await stageServer(opts(f));
  fs.rmSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha'), { recursive: true });
  fs.mkdirSync(path.join(f.out, 'app/node_modules/new-package/.bin'), { recursive: true });
  try { fs.symlinkSync(path.join(f.out, 'app/server/dist/index.js'), path.join(f.out, 'planted-link')); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) { t.skip(`platform refuses symlink creation: ${error.code}`); return; }
    throw error;
  }
  const result = await verifyStage(f.out);
  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /Symlinks or junctions found/);
  assert.match(result.problems.join('\n'), /Forbidden \.bin directories/);
  assert.match(result.problems.join('\n'), /Missing workspace package: @paperclipai\/alpha/);
  assert.equal(manifest.closure.includes('@paperclipai/alpha'), true);
  const tamperedManifest = JSON.parse(fs.readFileSync(path.join(f.out, 'stage-manifest.json'), 'utf8'));
  tamperedManifest.closure.push('@paperclipai/..\\..\\evil');
  fs.writeFileSync(path.join(f.out, 'stage-manifest.json'), JSON.stringify(tamperedManifest));
  const invalid = await verifyStage(f.out);
  assert.match(invalid.problems.join('\n'), /Invalid workspace package name in manifest/);
});

test('path budget is a warning by default and a failure when requested', async (t) => {
  const f = fixture(t);
  await stageServer(opts(f));
  const warning = await verifyStage(f.out, { maxPathBudget: 10, installPrefixLength: 10 });
  assert.equal(warning.ok, true);
  assert.equal(warning.stats.warnings.length, 1);
  const failure = await verifyStage(f.out, { maxPathBudget: 10, installPrefixLength: 10, failOnPathBudget: true });
  assert.equal(failure.ok, false);
  assert.match(failure.problems.join('\n'), /exceeds budget/);
});

test('manifest bytes are identical on repeated runs with fixed inputs and time', async (t) => {
  const f = fixture(t);
  await stageServer(opts(f));
  const first = fs.readFileSync(path.join(f.out, 'stage-manifest.json'));
  await stageServer(opts(f, { force: true }));
  const second = fs.readFileSync(path.join(f.out, 'stage-manifest.json'));
  assert.deepEqual(second, first);
});

test('loader none is the default and stages materialized publish files only', async (t) => {
  const f = fixture(t);
  const manifest = await stageServer({ ...opts(f), loader: undefined });
  assert.equal(manifest.loader, 'none');
  const alpha = path.join(f.out, 'app/node_modules/@paperclipai/alpha');
  assert.equal(fs.existsSync(path.join(alpha, 'src')), false);
  assert.equal(fs.existsSync(path.join(alpha, 'dist/index.js')), true);
  const alphaManifest = JSON.parse(fs.readFileSync(path.join(alpha, 'package.json'), 'utf8'));
  assert.equal('publishConfig' in alphaManifest, false);
  assert.deepEqual(alphaManifest.exports, { '.': './dist/index.js' });
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/tsx')), false);
  assert.equal((await verifyStage(f.out)).ok, true);
});

test('loader none tolerates missing optional files-list entries', async (t) => {
  const f = fixture(t);
  const alphaPackage = path.join(f.repo, 'packages/alpha/package.json');
  const pkg = JSON.parse(fs.readFileSync(alphaPackage, 'utf8'));
  pkg.publishConfig.files = ['dist', 'skills'];
  fs.writeFileSync(alphaPackage, JSON.stringify(pkg));

  const manifest = await stageServer({ ...opts(f), loader: 'none' });
  const alpha = path.join(f.out, 'app/node_modules/@paperclipai/alpha');
  assert.equal(manifest.loader, 'none');
  assert.equal(fs.existsSync(path.join(alpha, 'dist/index.js')), true);
  assert.equal(fs.existsSync(path.join(alpha, 'skills')), false);
  assert.equal((await verifyStage(f.out)).ok, true);
});

test('loader none rejects TypeScript and missing materialized export targets', async (t) => {
  const f = fixture(t);
  const alphaPackage = path.join(f.repo, 'packages/alpha/package.json');
  let pkg = JSON.parse(fs.readFileSync(alphaPackage, 'utf8'));
  pkg.publishConfig.exports = { '.': './dist/index.ts' };
  fs.writeFileSync(alphaPackage, JSON.stringify(pkg));
  await assert.rejects(stageServer({ ...opts(f), loader: 'none' }), /TypeScript export target.*\.ts/);
  fs.rmSync(f.out, { recursive: true, force: true });
  pkg.publishConfig.exports = { '.': './dist/missing.js' };
  fs.writeFileSync(alphaPackage, JSON.stringify(pkg));
  await assert.rejects(stageServer({ ...opts(f), loader: 'none' }), /Missing export target.*dist\/missing\.js/);

  fs.rmSync(f.out, { recursive: true, force: true });
  delete pkg.publishConfig.exports;
  pkg.publishConfig.main = './dist/missing-main.js';
  fs.writeFileSync(alphaPackage, JSON.stringify(pkg));
  await assert.rejects(stageServer({ ...opts(f), loader: 'none' }), /Missing export target.*dist\/missing-main\.js/);

  fs.rmSync(f.out, { recursive: true, force: true });
  delete pkg.publishConfig.main;
  pkg.publishConfig.bin = { alpha: './dist/missing-bin.ts' };
  fs.writeFileSync(alphaPackage, JSON.stringify(pkg));
  await assert.rejects(stageServer({ ...opts(f), loader: 'none' }), /TypeScript export target.*missing-bin\.ts/);
});

test('loader none resolves workspace imports throughout staged dist trees without a loader', async (t) => {
  const f = fixture(t);
  write(f.repo, 'packages/alpha/dist/index.js', "import '@paperclipai/beta/missing';\n");
  await assert.rejects(stageServer({ ...opts(f), loader: 'none' }), /Staged workspace import resolution failed without a loader/);
});

test('tsx fallback retains source staging and requires its loader', async (t) => {
  const f = fixture(t);
  const manifest = await stageServer({ ...opts(f), loader: 'tsx' });
  assert.equal(manifest.loader, 'tsx');
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/@paperclipai/alpha/src/index.ts')), true);
  assert.equal(fs.existsSync(path.join(f.out, 'app/node_modules/tsx/dist/loader.mjs')), true);
  fs.rmSync(path.join(f.prodModules, 'tsx/dist/loader.mjs'));
  await assert.rejects(stageServer({ ...opts(f), loader: 'tsx', force: true }), /Missing production tsx loader/);
});

test('pins the requested Node runtime artifacts', () => {
  const runtime = JSON.parse(fs.readFileSync(new URL('./node-runtime.json', import.meta.url), 'utf8'));
  assert.equal(runtime.schemaVersion, 1);
  assert.equal(runtime.node.version, '24.21.0');
  assert.deepEqual(runtime.node['win32-x64'], {
    url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip',
    sha256: '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541',
  });
  assert.deepEqual(runtime.node['linux-x64'], {
    url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz',
    sha256: 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6',
  });
});
