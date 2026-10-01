import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { materializePublishManifest } from '../prepare-bundled-package.mjs';

const EXCLUDED_PACKAGE_DIRS = new Set(['node_modules', '.turbo', 'coverage', '.git']);
const DEFAULT_PATH_BUDGET = 259;
const DEFAULT_INSTALL_PREFIX_LENGTH = 60;
const compareStrings = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const WORKSPACE_NAME = /^@paperclipai\/[a-z0-9][a-z0-9._-]*$/;

function absolute(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  return path.resolve(value);
}

function insideOrSame(parent, child, pathApi = path) {
  const relative = pathApi.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative));
}

function validateWorkspaceName(name) {
  if (typeof name !== 'string' || !WORKSPACE_NAME.test(name)) {
    throw new Error(`Invalid workspace package name (expected @paperclipai/<lowercase-name>): ${String(name)}`);
  }
  const segment = name.slice('@paperclipai/'.length);
  if (segment.includes('..')) throw new Error(`Invalid workspace package name containing '..': ${name}`);
  return name;
}

function destinationIsInside(scope, target) {
  const nativeRelative = path.relative(scope, target);
  const winScope = path.win32.normalize(scope.replaceAll('/', '\\'));
  const winTarget = path.win32.normalize(target.replaceAll('/', '\\'));
  const windowsRelative = path.win32.relative(winScope, winTarget);
  return insideOrSame(scope, target, path) && insideOrSame(winScope, winTarget, path.win32)
    && nativeRelative !== '..' && windowsRelative !== '..';
}

async function lstatOrNull(target) {
  try { return await fs.lstat(target); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function canonicalRoot(target, label) {
  try {
    const real = await fs.realpath(target);
    const stat = await fs.lstat(real);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must resolve to a real directory`);
    return real;
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Missing ${label}: ${target}`);
    throw error;
  }
}

async function requireFileWithin(root, relative, message) {
  let cursor = root;
  for (const part of relative.split(/[\\/]+/).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = await lstatOrNull(cursor);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink source path component: ${path.relative(root, cursor)}`);
    if (!stat) throw new Error(message);
  }
  const stat = await lstatOrNull(cursor);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(message);
  return cursor;
}

async function readPackage(packageJson, label) {
  const stat = await lstatOrNull(packageJson);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`Missing or invalid ${label}: ${packageJson}`);
  try { return JSON.parse(await fs.readFile(packageJson, 'utf8')); }
  catch (error) { throw new Error(`Could not read ${label}: ${error.message}`); }
}

async function copyTree(source, destination, options = {}) {
  const { excludeDirs = new Set(), excludeTsBuildInfo = false, skippedSymlinks = [], stageRoot, pruneModuleFiles = false, pruned } = options;
  const stat = await lstatOrNull(source);
  if (!stat) throw new Error(`Missing source path: ${source}`);
  if (stat.isSymbolicLink()) {
    if (stageRoot) skippedSymlinks.push(path.relative(stageRoot, destination));
    return { files: 0, directories: 0, bytes: 0 };
  }
  if (stat.isFile()) {
    if (pruneModuleFiles && shouldPruneModuleFile(path.basename(source))) {
      pruned.files += 1;
      pruned.bytes += stat.size;
      return { files: 0, directories: 0, bytes: 0 };
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    return { files: 1, directories: 0, bytes: (await fs.stat(destination)).size };
  }
  if (!stat.isDirectory()) return { files: 0, directories: 0, bytes: 0 };

  await fs.mkdir(destination, { recursive: true });
  const totals = { files: 0, directories: 1, bytes: 0 };
  const entries = await fs.readdir(source, { withFileTypes: true });
  entries.sort((a, b) => compareStrings(a.name, b.name));
  for (const entry of entries) {
    if (entry.isDirectory() && excludeDirs.has(entry.name)) continue;
    if (excludeTsBuildInfo && entry.isFile() && entry.name.endsWith('.tsbuildinfo')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    const childStat = await fs.lstat(from);
    if (childStat.isSymbolicLink()) {
      skippedSymlinks.push(path.relative(stageRoot, to));
      continue;
    }
    const child = await copyTree(from, to, options);
    totals.files += child.files;
    totals.directories += child.directories;
    totals.bytes += child.bytes;
  }
  return totals;
}

function shouldPruneModuleFile(name) {
  return name.endsWith('.d.ts') || name.endsWith('.d.mts') || name.endsWith('.d.cts') || name.endsWith('.map');
}

async function discoverWorkspacePackages(repo) {
  const packageDirs = [path.join(repo, 'packages'), path.join(repo, 'packages', 'adapters'), path.join(repo, 'packages', 'plugins')];
  const candidates = [path.join(repo, 'server')];
  for (const parent of packageDirs) {
    const stat = await lstatOrNull(parent);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue;
    const entries = await fs.readdir(parent, { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) candidates.push(path.join(parent, entry.name));
  }
  const found = new Map();
  for (const dir of candidates) {
    const dirStat = await lstatOrNull(dir);
    if (!dirStat?.isDirectory() || dirStat.isSymbolicLink()) continue;
    const packageJson = path.join(dir, 'package.json');
    const jsonStat = await lstatOrNull(packageJson);
    if (!jsonStat) continue;
    const relative = path.relative(repo, packageJson);
    if (!jsonStat.isFile() || jsonStat.isSymbolicLink()) {
      throw new Error(`Workspace package.json must be a regular file: ${relative}`);
    }
    let pkg;
    try { pkg = JSON.parse(await fs.readFile(packageJson, 'utf8')); }
    catch (error) { throw new Error(`Could not read workspace package.json ${relative}: ${error.message}`); }
    if (typeof pkg.name !== 'string') {
      throw new Error(`Invalid workspace package name in ${relative}: ${String(pkg.name)}`);
    }
    validateWorkspaceName(pkg.name);
    found.set(pkg.name, { dir, pkg });
  }
  return found;
}

function dependencyNames(pkg) {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})];
}

async function workspaceClosure(serverPackage, packageMap) {
  const names = new Set();
  const pending = dependencyNames(serverPackage);
  while (pending.length) {
    const name = pending.pop();
    if (!packageMap.has(name) || names.has(name)) continue;
    validateWorkspaceName(name);
    names.add(name);
    pending.push(...dependencyNames(packageMap.get(name).pkg));
  }
  return [...names].sort(compareStrings);
}

async function pathMetrics(outDir) {
  let files = 0;
  let directories = 0;
  let bytes = 0;
  let maxRelativePathLength = 0;
  let maxRelativePath = '';
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(outDir, full);
      const stat = await fs.lstat(full);
      if (rel.length > maxRelativePathLength) { maxRelativePathLength = rel.length; maxRelativePath = rel; }
      if (stat.isDirectory() && !stat.isSymbolicLink()) { directories += 1; await walk(full); }
      else if (stat.isFile() && !stat.isSymbolicLink()) { files += 1; bytes += stat.size; }
    }
  };
  await walk(outDir);
  return { files, directories, bytes, maxRelativePathLength, maxRelativePath };
}

function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function exportTargets(exportsValue, key = '') {
  if (key.toLowerCase() === 'types') return [];
  if (typeof exportsValue === 'string') return [exportsValue];
  if (Array.isArray(exportsValue)) return exportsValue.flatMap((value) => exportTargets(value, key));
  if (exportsValue && typeof exportsValue === 'object') {
    return Object.entries(exportsValue).flatMap(([childKey, value]) => exportTargets(value, childKey));
  }
  return [];
}

const TS_EXTENSIONS = /\.(?:ts|mts|cts|tsx)$/i;

function manifestTargets(manifest) {
  const targets = exportTargets(manifest.exports).filter((target) => !target.includes('*'));
  if (typeof manifest.main === 'string') targets.push(manifest.main);
  if (typeof manifest.bin === 'string') targets.push(manifest.bin);
  else if (manifest.bin && typeof manifest.bin === 'object' && !Array.isArray(manifest.bin)) {
    targets.push(...Object.values(manifest.bin));
  }
  return targets;
}

async function validateManifestTargets(manifest, destination, packageName) {
  for (const target of manifestTargets(manifest)) {
    if (typeof target !== 'string') continue;
    if (TS_EXTENSIONS.test(target)) throw new Error(`TypeScript export target for ${packageName}: ${target}`);
    const relative = target.startsWith('./') ? target.slice(2) : target;
    const stat = await lstatOrNull(path.join(destination, relative));
    if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`Missing export target for ${packageName}: ${target}`);
  }
}

async function copyPublishFiles(source, destination, pkg, skippedSymlinks, stageRoot) {
  const manifest = materializePublishManifest(pkg);
  const files = pkg.publishConfig?.files ?? pkg.files;
  if (!Array.isArray(files) || files.some((entry) => typeof entry !== 'string' || path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..'))) {
    throw new Error(`Invalid publish files list for ${pkg.name}`);
  }
  const entries = new Set(['package.json', ...files, 'README', 'README.md', 'LICENSE', 'LICENSE.md', 'LICENCE', 'LICENCE.md']);
  for (const relative of entries) {
    const from = path.join(source, relative);
    if (!(await lstatOrNull(from))) {
      if (['README', 'README.md', 'LICENSE', 'LICENSE.md', 'LICENCE', 'LICENCE.md'].includes(relative)) continue;
      continue;
    }
    await copyTree(from, path.join(destination, relative), {
      skippedSymlinks, stageRoot, excludeDirs: EXCLUDED_PACKAGE_DIRS, excludeTsBuildInfo: true,
    });
  }
  await fs.writeFile(path.join(destination, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await validateManifestTargets(manifest, destination, pkg.name);
}

function stagedWorkspaceImports(stageRoot) {
  const found = new Set();
  const scanDist = (dir) => {
    for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanDist(full);
      else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) {
        const content = fsSync.readFileSync(full, 'utf8');
        for (const match of content.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](@paperclipai\/[^'"]+)['"]/g)) found.add(match[1]);
      }
    }
  };
  const packageRoot = path.join(stageRoot, 'app/node_modules/@paperclipai');
  const findDist = (dir) => {
    for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'dist') scanDist(full);
      else findDist(full);
    }
  };
  scanDist(path.join(stageRoot, 'app/server/dist'));
  if (fsSync.existsSync(packageRoot)) findDist(packageRoot);
  return [...found].sort(compareStrings);
}

function verifyWorkspaceResolution(stageRoot) {
  const specifiers = stagedWorkspaceImports(stageRoot);
  if (specifiers.length === 0) return;
  const source = `for (const specifier of ${JSON.stringify(specifiers)}) { try { import.meta.resolve(specifier); } catch { console.error(specifier); process.exitCode = 1; } }`;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: path.join(stageRoot, 'app/server/dist'), encoding: 'utf8', windowsHide: true, env,
  });
  if (result.error || result.status !== 0) {
    const unresolved = result.stderr?.trim() || result.stdout?.trim() || 'unknown resolver failure';
    throw new Error(`Staged workspace import resolution failed without a loader: ${unresolved}`);
  }
}

async function writeManifest(outDir, manifest) {
  const manifestPath = path.join(outDir, 'stage-manifest.json');
  let serialized;
  for (let i = 0; i < 8; i += 1) {
    const metrics = await pathMetrics(outDir);
    const size = Buffer.byteLength(stableJson(manifest));
    manifest.counts = { files: metrics.files + 1, directories: metrics.directories, bytes: metrics.bytes + size };
    serialized = stableJson(manifest);
    if (Buffer.byteLength(serialized) === size) break;
  }
  await fs.writeFile(manifestPath, serialized, 'utf8');
}

async function canonicalProspectivePath(target) {
  let cursor = target;
  const suffix = [];
  while (!(await lstatOrNull(cursor))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(await fs.realpath(cursor), ...suffix);
}

async function assertNoSymlinkBetween(root, target) {
  if (!insideOrSame(root, target)) return;
  let cursor = root;
  const relative = path.relative(root, target);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = await lstatOrNull(cursor);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink in output path: ${path.relative(root, cursor)}`);
  }
}

async function hasValidStageMarker(outDir) {
  const marker = path.join(outDir, 'stage-manifest.json');
  const stat = await lstatOrNull(marker);
  if (!stat?.isFile() || stat.isSymbolicLink()) return false;
  try { return JSON.parse(await fs.readFile(marker, 'utf8')).schemaVersion === 1; }
  catch { return false; }
}

async function ensureSafeOut(outValue, sources, force) {
  const rawOut = absolute(outValue, '--out');
  for (const root of sources.repoLexicalRoots ?? []) await assertNoSymlinkBetween(root, rawOut);
  const existingStat = await lstatOrNull(rawOut);
  if (existingStat?.isSymbolicLink()) throw new Error('Output directory must not be a symlink or junction');
  const outDir = await canonicalProspectivePath(rawOut);
  const root = path.parse(outDir).root;
  if (outDir === root) throw new Error('Refusing to use the filesystem root as the output directory');
  await assertNoSymlinkBetween(sources.repo, outDir);

  const allowedRepoStage = path.join(sources.repo, 'desktop', 'stage');
  const insideAllowedStage = insideOrSame(allowedRepoStage, outDir);
  for (const source of [sources.repo, sources.prodModules, sources.sidecar, sources.nodeDir].filter(Boolean)) {
    if (source === sources.repo && insideAllowedStage) continue;
    if (insideOrSame(outDir, source) || insideOrSame(source, outDir)) {
      throw new Error(`Output directory overlaps source tree: ${source}`);
    }
  }

  const stat = await lstatOrNull(outDir);
  if (stat?.isSymbolicLink()) throw new Error('Output directory must not be a symlink or junction');
  if (stat && !stat.isDirectory()) throw new Error('Output path exists and is not a directory');
  if (stat) {
    const entries = await fs.readdir(outDir);
    if (entries.length && !force) throw new Error('Output directory exists and is not empty; pass --force to replace it');
    if (entries.length && force && !(await hasValidStageMarker(outDir))) {
      throw new Error('Refusing --force: non-empty output lacks a valid stage-manifest.json with schemaVersion 1');
    }
  }
  return { outDir, exists: Boolean(stat) };
}

async function createPartial(outDir) {
  const parent = path.dirname(outDir);
  await fs.mkdir(parent, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const partial = path.join(parent, `${path.basename(outDir)}.partial-${randomUUID()}`);
    try { await fs.mkdir(partial); return partial; }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  throw new Error('Could not create a unique partial staging directory');
}

async function publishStage(partial, outDir, hadExisting) {
  let backup;
  if (hadExisting) {
    backup = path.join(path.dirname(outDir), `${path.basename(outDir)}.backup-${randomUUID()}`);
    await fs.rename(outDir, backup);
  }
  try {
    await fs.rename(partial, outDir);
  } catch (error) {
    if (backup) await fs.rename(backup, outDir);
    throw error;
  }
  if (backup) {
    try { await fs.rm(backup, { recursive: true, force: true }); }
    catch (error) {
      await fs.rm(outDir, { recursive: true, force: true });
      await fs.rename(backup, outDir);
      throw error;
    }
  }
}

export async function stageServer(options = {}) {
  const loader = options.loader ?? 'none';
  if (!['none', 'tsx'].includes(loader)) throw new Error(`Unsupported loader: ${loader}`);
  const repoInput = absolute(options.repo, '--repo');
  const modulesInput = absolute(options.prodModules, '--prod-modules');
  const repo = await canonicalRoot(repoInput, 'repo');
  const prodModules = await canonicalRoot(modulesInput, 'production modules');
  const platform = options.platform ?? `${process.platform}-${process.arch}`;
  if (!['win32-x64', 'linux-x64'].includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
  for (const [label, value] of [['--max-path-budget', options.maxPathBudget], ['--install-prefix-length', options.installPrefixLength]]) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`${label} must be a non-negative integer`);
  }
  const nodeDir = options.nodeDir ? await canonicalRoot(absolute(options.nodeDir, '--node-dir'), 'node runtime directory') : undefined;
  const sidecarInput = absolute(options.sidecar ?? path.join(repo, 'desktop', 'sidecar'), '--sidecar');
  const sidecar = await canonicalRoot(sidecarInput, 'sidecar directory');
  const nodeName = platform === 'win32-x64' ? 'node.exe' : 'node';

  await requireFileWithin(repo, 'server/dist/index.js', `Missing built server entry: ${path.join(repo, 'server/dist/index.js')}`);
  const serverPackage = await readPackage(path.join(repo, 'server', 'package.json'), 'server package.json');
  if (loader === 'tsx') await requireFileWithin(prodModules, 'tsx/dist/loader.mjs', `Missing production tsx loader: ${path.join(prodModules, 'tsx/dist/loader.mjs')}`);
  await requireFileWithin(sidecar, 'entry.mjs', `Missing sidecar entry: ${path.join(sidecar, 'entry.mjs')}`);
  if (nodeDir) await requireFileWithin(nodeDir, nodeName, `Missing bundled runtime: ${path.join(nodeDir, nodeName)}`);
  const serverUi = path.join(repo, 'server', 'ui-dist');
  const uiDist = path.join(repo, 'ui', 'dist');
  const serverUiStat = await lstatOrNull(serverUi);
  const selectedUi = serverUiStat?.isDirectory() && !serverUiStat.isSymbolicLink() ? serverUi : uiDist;
  const selectedUiStat = await lstatOrNull(selectedUi);
  if (!selectedUiStat?.isDirectory() || selectedUiStat.isSymbolicLink()) {
    throw new Error(`Missing UI output: expected ${serverUi} or ${uiDist}`);
  }
  const packageMap = await discoverWorkspacePackages(repo);
  const closure = await workspaceClosure(serverPackage, packageMap);

  const safety = await ensureSafeOut(options.out, {
    repo,
    prodModules,
    sidecar,
    nodeDir,
    repoLexicalRoots: [repoInput],
  }, options.force === true);
  const { outDir, exists } = safety;
  let partial;
  let ownsPartial = false;
  try {
    partial = await createPartial(outDir);
    ownsPartial = true;
    const skippedSymlinks = [];
    await fs.mkdir(path.join(partial, 'app', 'server'), { recursive: true });
    await fs.mkdir(path.join(partial, 'app', 'node_modules'), { recursive: true });
    await copyTree(path.join(repo, 'server', 'dist'), path.join(partial, 'app', 'server', 'dist'), { skippedSymlinks, stageRoot: partial });
    if (loader === 'tsx') {
      await copyTree(path.join(repo, 'server', 'package.json'), path.join(partial, 'app', 'server', 'package.json'), { skippedSymlinks, stageRoot: partial });
    } else {
      await fs.writeFile(path.join(partial, 'app/server/package.json'), `${JSON.stringify(materializePublishManifest(serverPackage), null, 2)}\n`, 'utf8');
    }
    await copyTree(selectedUi, path.join(partial, 'app', 'server', 'ui-dist'), { skippedSymlinks, stageRoot: partial });
    const skills = path.join(repo, 'server', 'skills');
    if ((await lstatOrNull(skills))?.isDirectory()) {
      await copyTree(skills, path.join(partial, 'app', 'server', 'skills'), { skippedSymlinks, stageRoot: partial });
    }
    const pruneEnabled = options.pruneTypes !== false;
    const pruned = { files: 0, bytes: 0 };
    await copyTree(prodModules, path.join(partial, 'app', 'node_modules'), {
      skippedSymlinks, stageRoot: partial, excludeDirs: new Set(['.bin', '.cache']),
      pruneModuleFiles: pruneEnabled, pruned,
    });
    if (loader === 'none') await fs.rm(path.join(partial, 'app/node_modules/tsx'), { recursive: true, force: true });

    for (const name of closure) {
      validateWorkspaceName(name);
      const scope = path.join(partial, 'app', 'node_modules', '@paperclipai');
      const target = path.join(scope, name.slice('@paperclipai/'.length));
      if (!destinationIsInside(scope, target)) throw new Error(`Workspace package destination escapes @paperclipai scope: ${name}`);
      await fs.rm(target, { recursive: true, force: true });
      if (loader === 'tsx') {
        await copyTree(packageMap.get(name).dir, target, {
          skippedSymlinks, stageRoot: partial, excludeDirs: EXCLUDED_PACKAGE_DIRS, excludeTsBuildInfo: true,
        });
      } else {
        await copyPublishFiles(packageMap.get(name).dir, target, packageMap.get(name).pkg, skippedSymlinks, partial);
      }
    }

    if (loader === 'none') {
      await validateManifestTargets(materializePublishManifest(serverPackage), path.join(partial, 'app/server'), serverPackage.name);
    }

    await fs.mkdir(path.join(partial, 'sidecar'), { recursive: true });
    for (const name of ['entry.mjs', 'db-template-seed.mjs']) {
      await copyTree(path.join(sidecar, name), path.join(partial, 'sidecar', name), { skippedSymlinks, stageRoot: partial });
    }
    if (nodeDir) {
      await fs.mkdir(path.join(partial, 'runtime'), { recursive: true });
      await copyTree(path.join(nodeDir, nodeName), path.join(partial, 'runtime', nodeName), { skippedSymlinks, stageRoot: partial });
    }

    const installPrefixLength = options.installPrefixLength ?? DEFAULT_INSTALL_PREFIX_LENGTH;
    const limit = options.maxPathBudget ?? DEFAULT_PATH_BUDGET;
    const preManifestMetrics = await pathMetrics(partial);
    const manifest = {
      schemaVersion: 1,
      loader,
      platform,
      ...(options.now !== undefined ? { generatedAt: options.now } : {}),
      counts: { files: 0, directories: 0, bytes: 0 },
      pruned: { enabled: pruneEnabled, files: pruned.files, bytes: pruned.bytes },
      closure,
      skippedSymlinks: skippedSymlinks.sort(compareStrings),
      maxRelativePathLength: preManifestMetrics.maxRelativePathLength,
      maxRelativePath: preManifestMetrics.maxRelativePath,
      pathBudget: {
        installPrefixLength, limit,
        worstCaseLength: preManifestMetrics.maxRelativePathLength + installPrefixLength,
        exceeded: preManifestMetrics.maxRelativePathLength + installPrefixLength > limit,
      },
      entries: (await fs.readdir(partial)).sort(compareStrings).concat('stage-manifest.json').sort(compareStrings),
    };
    await writeManifest(partial, manifest);
    if (loader === 'none') verifyWorkspaceResolution(partial);
    const verified = await verifyStage(partial, {
      maxPathBudget: limit, installPrefixLength, requireRuntime: options.requireRuntime,
    });
    if (!verified.ok) throw new Error(`Staged server failed verification:\n${verified.problems.join('\n')}`);
    await publishStage(partial, outDir, exists);
    ownsPartial = false;
    return manifest;
  } catch (error) {
    if (ownsPartial && partial) await fs.rm(partial, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyStage(outDirValue, options = {}) {
  const outDir = absolute(outDirValue, 'outDir');
  const problems = [];
  const warnings = [];
  const symlinks = [];
  const binDirs = [];
  const walk = async (dir) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { problems.push(`Cannot read staged directory ${path.relative(outDir, dir) || '.'}: ${error.message}`); return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(outDir, full);
      let stat;
      try { stat = await fs.lstat(full); }
      catch (error) { problems.push(`Cannot inspect ${relative}: ${error.message}`); continue; }
      if (stat.isSymbolicLink()) { symlinks.push(relative); continue; }
      if (stat.isDirectory()) {
        if (entry.name === '.bin') binDirs.push(relative);
        await walk(full);
      }
    }
  };
  const rootStat = await lstatOrNull(outDir);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) problems.push('Stage output directory is missing or is not a real directory');
  else await walk(outDir);
  if (symlinks.length) problems.push(`Symlinks or junctions found: ${symlinks.sort(compareStrings).join(', ')}`);
  if (binDirs.length) problems.push(`Forbidden .bin directories found: ${binDirs.sort(compareStrings).join(', ')}`);

  for (const [relative, label] of [
    ['app/server/dist/index.js', 'server entry'],
    ['sidecar/entry.mjs', 'sidecar entry'],
    ['sidecar/db-template-seed.mjs', 'sidecar database-template seed module'],
  ]) {
    const stat = await lstatOrNull(path.join(outDir, relative));
    if (!stat?.isFile() || stat.isSymbolicLink()) problems.push(`Missing ${label}: ${relative}`);
  }
  let manifest;
  const manifestPath = path.join(outDir, 'stage-manifest.json');
  const manifestStat = await lstatOrNull(manifestPath);
  if (manifestStat?.isFile() && !manifestStat.isSymbolicLink()) {
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
    catch (error) { problems.push(`Invalid stage manifest: ${error.message}`); }
  } else problems.push('Missing stage-manifest.json');
  if (manifest?.loader !== undefined && !['none', 'tsx'].includes(manifest.loader)) problems.push(`Invalid stage loader: ${manifest.loader}`);
  if (manifest?.loader === 'tsx') {
    const loaderStat = await lstatOrNull(path.join(outDir, 'app/node_modules/tsx/dist/loader.mjs'));
    if (!loaderStat?.isFile() || loaderStat.isSymbolicLink()) problems.push('Missing tsx loader: app/node_modules/tsx/dist/loader.mjs');
  }
  for (const name of manifest?.closure ?? []) {
    try { validateWorkspaceName(name); }
    catch { problems.push(`Invalid workspace package name in manifest: ${String(name)}`); continue; }
    const scope = path.join(outDir, 'app', 'node_modules', '@paperclipai');
    const target = path.join(scope, name.slice('@paperclipai/'.length));
    if (!destinationIsInside(scope, target)) { problems.push(`Workspace package destination escapes @paperclipai scope: ${name}`); continue; }
    const packageJson = path.join(target, 'package.json');
    const stat = await lstatOrNull(packageJson);
    if (!stat?.isFile() || stat.isSymbolicLink()) problems.push(`Missing workspace package: ${name}`);
  }
  if (options.requireRuntime) {
    const runtimeName = (options.platform ?? manifest?.platform) === 'win32-x64' ? 'node.exe' : 'node';
    const runtime = await lstatOrNull(path.join(outDir, 'runtime', runtimeName));
    if (!runtime?.isFile() || runtime.isSymbolicLink()) problems.push(`Missing bundled runtime: runtime/${runtimeName}`);
  }
  const metrics = rootStat?.isDirectory()
    ? await pathMetrics(outDir)
    : { files: 0, directories: 0, bytes: 0, maxRelativePathLength: 0, maxRelativePath: '' };
  const installPrefixLength = options.installPrefixLength ?? manifest?.pathBudget?.installPrefixLength ?? DEFAULT_INSTALL_PREFIX_LENGTH;
  const limit = options.maxPathBudget ?? manifest?.pathBudget?.limit ?? DEFAULT_PATH_BUDGET;
  const worstCaseLength = metrics.maxRelativePathLength + installPrefixLength;
  if (worstCaseLength > limit) {
    const detail = `Worst-case path length ${worstCaseLength} exceeds budget ${limit} (${metrics.maxRelativePath})`;
    if (options.failOnPathBudget) problems.push(detail); else warnings.push(detail);
  }
  return { ok: problems.length === 0, problems, stats: { ...metrics, installPrefixLength, limit, worstCaseLength, warnings } };
}

function parseArgs(argv) {
  const options = {};
  const flags = new Set(['--force', '--require-runtime', '--no-prune']);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (flags.has(key)) {
      if (key === '--force') options.force = true;
      else if (key === '--require-runtime') options.requireRuntime = true;
      else options.pruneTypes = false;
      continue;
    }
    if (!key.startsWith('--') || i + 1 >= argv.length) throw new Error(`Invalid argument: ${key}`);
    const value = argv[++i];
    const optionName = ({ '--repo': 'repo', '--prod-modules': 'prodModules', '--out': 'out', '--node-dir': 'nodeDir', '--sidecar': 'sidecar', '--platform': 'platform', '--loader': 'loader', '--max-path-budget': 'maxPathBudget', '--install-prefix-length': 'installPrefixLength' })[key];
    if (!optionName) throw new Error(`Unknown option: ${key}`);
    options[optionName] = ['maxPathBudget', 'installPrefixLength'].includes(optionName) ? Number(value) : value;
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = await stageServer({ ...options, now: new Date().toISOString() });
    const sizeMb = (manifest.counts.bytes / (1024 * 1024)).toFixed(2);
    const report = await verifyStage(options.out, { requireRuntime: options.requireRuntime, platform: options.platform });
    console.log(`Staged ${manifest.counts.files} files (${sizeMb} MB); ${manifest.closure.length} workspace packages; max path ${manifest.maxRelativePathLength} chars.`);
    for (const warning of report.stats.warnings) console.log(`Warning: ${warning}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
