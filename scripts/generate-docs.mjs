import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { syncContractDocs } from './sync-contract-docs.mjs';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, '..');
const contractsRoot = path.resolve(
  process.env.DEEPX_API_CONTRACTS_DIR ??
    path.resolve(docsRoot, '../deepx-api-contracts'),
);
const sourceOpenApiPath = path.resolve(
  contractsRoot,
  'v1/rest-api/openapi.yaml',
);
const sourceSchemasDir = path.resolve(contractsRoot, 'v1/schemas');
const outputSpecPath = path.resolve(docsRoot, 'sdk-api.json');
const outputDocsDir = path.resolve(docsRoot, 'content/docs/api/rest');

async function main() {
  assertDirectory(contractsRoot);
  assertFile(sourceOpenApiPath);
  assertDirectory(sourceSchemasDir);

  const tempDir = await mkdtemp(path.join(tmpdir(), 'deepx-docs-openapi-'));
  const tempSpecPath = path.join(tempDir, 'sdk-api.json');

  try {
    await runRedoclyBundle(tempSpecPath);

    const document = JSON.parse(await readFile(tempSpecPath, 'utf8'));
    normalizeSchemaRefs(document);

    await writeFile(outputSpecPath, `${JSON.stringify(document, null, 2)}\n`);

    const openapi = createOpenAPI({
      input: ['./sdk-api.json'],
      disableCache: true,
    });

    await rm(outputDocsDir, { recursive: true, force: true });
    await generateFiles({
      input: openapi,
      output: outputDocsDir,
      groupBy: 'tag',
      includeDescription: true,
      meta: true,
      beforeWrite(files) {
        const meta = files.find((file) => file.path === 'meta.json');

        if (!meta) return;

        meta.content = JSON.stringify(
          {
            title: 'REST API',
            ...JSON.parse(meta.content),
          },
          null,
          2,
        );
      },
    });

    await syncContractDocs({ docsRoot, contractsRoot });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeSchemaRefs(document) {
  if (!isObject(document)) {
    throw new Error('Redocly output must be a JSON object.');
  }

  const components = getOrCreateObject(document, 'components');
  const schemas = getOrCreateObject(components, 'schemas');
  const loadingSchemas = new Set();

  function ensureSchemaComponent(name) {
    if (Object.hasOwn(schemas, name)) return;

    if (loadingSchemas.has(name)) return;
    loadingSchemas.add(name);

    const schemaPath = path.join(sourceSchemasDir, `${name}.yaml`);
    assertFile(schemaPath);

    const schema = load(readFileSync(schemaPath, 'utf8'));
    schemas[name] = schema;
    visit(schema);

    loadingSchemas.delete(name);
  }

  function visit(value) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    if (!isObject(value)) return;

    const ref = typeof value.$ref === 'string' ? value.$ref : undefined;
    const schemaRef = ref ? parseSchemaRef(ref) : undefined;

    if (schemaRef) {
      ensureSchemaComponent(schemaRef.name);
      value.$ref = `#/components/schemas/${schemaRef.name}${schemaRef.fragment}`;
    }

    for (const child of Object.values(value)) visit(child);
  }

  visit(document);
}

function parseSchemaRef(ref) {
  const hashIndex = ref.indexOf('#');
  const refPath = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : ref.slice(hashIndex);
  const normalized = refPath.replaceAll('\\', '/');
  const match =
    normalized.match(/(?:^|\/)schemas\/([^/]+)\.ya?ml$/) ??
    normalized.match(/^\.\/([^/]+)\.ya?ml$/);

  if (!match) return;

  return {
    name: match[1],
    fragment,
  };
}

async function runRedoclyBundle(outputPath) {
  const redoclyCli = findRedoclyCli();

  await runCommand(process.execPath, [
    redoclyCli,
    'bundle',
    sourceOpenApiPath,
    '--dereferenced',
    '--ext',
    'json',
    '--output',
    outputPath,
  ]);
}

function findRedoclyCli() {
  const candidates = [
    path.resolve(docsRoot, 'node_modules/@redocly/cli/bin/cli.js'),
    path.resolve(contractsRoot, 'node_modules/@redocly/cli/bin/cli.js'),
  ];

  const redoclyCli = candidates.find((candidate) => existsSync(candidate));

  if (!redoclyCli) {
    throw new Error(
      `Unable to find Redocly CLI. Install dependencies in ${contractsRoot} or add @redocly/cli to this docs project.`,
    );
  }

  return redoclyCli;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: docsRoot,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function getOrCreateObject(parent, key) {
  const value = parent[key];

  if (isObject(value)) return value;

  const next = {};
  parent[key] = next;
  return next;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

function assertDirectory(directoryPath) {
  if (!existsSync(directoryPath)) {
    throw new Error(`Directory not found: ${directoryPath}`);
  }
}

void main();
