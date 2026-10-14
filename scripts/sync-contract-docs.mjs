import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDocsRoot = path.resolve(scriptDir, '..');
const defaultContractsRoot = path.resolve(defaultDocsRoot, '..', 'deepx-api-contracts');
const errorCodesOutput = 'content/docs/api/error-codes.mdx';

// Shared-schema links in contract Markdown (e.g. ../../schemas/PerpPosition.yaml)
// are rewritten to the REST page documenting the same schema. Schemas without a
// REST endpoint (e.g. Ticker, WebSocket-only) degrade to plain text.
const schemaRestPages = {
  PerpPosition: '/api/rest/account/getPerpPositions',
  PerpOrder: '/api/rest/account/getPerpOrders',
  SpotOrder: '/api/rest/account/getSpotOrders',
  AccountPerpTrade: '/api/rest/account/getPerpTrades',
  AccountSpotTrade: '/api/rest/account/getSpotTrades',
  AccountTransferLimit: '/api/rest/account/getSubaccountTransferLimit',
};

const pages = [
  {
    source: 'v1/overview.md',
    output: 'content/docs/api/overview.mdx',
    title: 'API Overview',
    description: 'Current public API version and changelog.',
  },
  {
    source: 'v1/rest-api/guides.md',
    output: 'content/docs/api/rest/guides.mdx',
    title: 'REST API Guide',
    description: 'General API behavior, timestamps, ordering, and pagination.',
  },
  {
    source: 'v1/websocket/01-general-info.md',
    output: 'content/docs/api/websocket/01-general-info.mdx',
    title: 'WebSocket General Information',
    description: 'Connection details, frame envelopes, heartbeat behavior, and data guarantees.',
  },
  {
    source: 'v1/websocket/02-subscribe-logic.md',
    output: 'content/docs/api/websocket/02-subscribe-logic.mdx',
    title: 'Subscription Management',
    description: 'Subscribe, unsubscribe, heartbeat, active subscription listing, and error frames.',
  },
  {
    source: 'v1/websocket/streams/account-data.md',
    output: 'content/docs/api/websocket/streams/account-data.mdx',
    title: 'Transparent Account Data Streams',
    description: 'Real-time subaccount positions, orders, trades, balances, and portfolio streams.',
  },
  {
    source: 'v1/websocket/streams/market-data.md',
    output: 'content/docs/api/websocket/streams/market-data.mdx',
    title: 'Market Data Streams',
    description: 'Real-time orderbook, trade, ticker, price, funding, open interest, candle, and lending market streams.',
  },
];

export async function syncContractDocs({ docsRoot = defaultDocsRoot, contractsRoot } = {}) {
  const resolvedContractsRoot = path.resolve(
    contractsRoot ?? process.env.DEEPX_API_CONTRACTS_DIR ?? defaultContractsRoot,
  );
  assertDirectory(resolvedContractsRoot);
  const releaseMetadata = await assertContractVersions(resolvedContractsRoot, docsRoot);
  await syncErrorCodes({ docsRoot, contractsRoot: resolvedContractsRoot });

  for (const page of pages) {
    const sourcePath = path.resolve(resolvedContractsRoot, page.source);
    const outputPath = path.resolve(docsRoot, page.output);

    assertFile(sourcePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    const source = await readFile(sourcePath, 'utf8');
    const { title, body } = extractTitle(source);
    const renderedBody =
      page.source === 'v1/overview.md'
        ? renderPublishedOverview(body, releaseMetadata)
        : page.source === 'v1/websocket/01-general-info.md'
          ? renderNetworkSpecificWebSocketInfo(body, releaseMetadata.network)
        : body;
    const frontmatter = `---\ntitle: ${title ?? page.title}\ndescription: ${page.description}\n---\n\n`;
    await writeFile(outputPath, `${frontmatter}${rewriteSchemaLinks(renderedBody)}`, 'utf8');
  }

  await ensureRestGuideNavigation(docsRoot);
}

function renderNetworkSpecificWebSocketInfo(body, network) {
  const selectedLabel = network === 'devnet' ? 'Devnet' : 'Testnet';
  const endpointRow = /^\| \*\*(Devnet|Testnet) Base Endpoint\*\* \| `([^`]+)` \|\r?\n?/gm;
  const rows = [...body.matchAll(endpointRow)];
  const selectedRows = rows.filter((match) => match[1] === selectedLabel);

  if (rows.length !== 2 || selectedRows.length !== 1) {
    throw new Error(
      `WebSocket General Information must define one Devnet and one Testnet base endpoint; found ${rows.length} endpoint rows`,
    );
  }

  return body.replace(endpointRow, (row, label) =>
    label === selectedLabel ? row.replace(`${label} Base Endpoint`, 'Base Endpoint') : '',
  );
}

async function ensureRestGuideNavigation(docsRoot) {
  const metaPath = path.resolve(docsRoot, 'content/docs/api/rest/meta.json');
  assertFile(metaPath);

  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const pages = Array.isArray(meta.pages) ? meta.pages : [];
  meta.pages = ['guides', ...pages.filter((page) => page !== 'guides')];

  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

export async function assertContractVersions(contractsRoot, docsRoot = defaultDocsRoot) {
  const overviewPath = path.resolve(contractsRoot, 'v1/overview.md');
  const openApiPath = path.resolve(contractsRoot, 'v1/rest-api/openapi.yaml');
  const websocketPath = path.resolve(
    contractsRoot,
    'v1/websocket/01-general-info.md',
  );
  assertFile(overviewPath);
  assertFile(openApiPath);
  assertFile(websocketPath);

  const [overview, openApiSource, websocket] = await Promise.all([
    readFile(overviewPath, 'utf8'),
    readFile(openApiPath, 'utf8'),
    readFile(websocketPath, 'utf8'),
  ]);
  const unreleasedVersions = [
    ...overview.matchAll(
      /^### v(\d+\.\d+\.\d+)[ \t]+\(unreleased\)[ \t]*$/gim,
    ),
  ].map((match) => `v${match[1]}`);
  if (unreleasedVersions.length > 0) {
    throw new Error(
      `API changelog headings ${unreleasedVersions.join(', ')} are marked (Unreleased) in ${overviewPath}. Remove each suffix manually before running "npm run generate:docs".`,
    );
  }

  const releaseMetadata = await readReleaseMetadata(docsRoot);
  const overviewVersion = matchVersion(
    overview,
    /\*\*Current API Version:\*\*\s+`([^`]+)`/,
    overviewPath,
  );
  const openApi = load(openApiSource);
  const openApiVersion = String(openApi?.info?.version ?? '');
  const websocketVersion = matchVersion(
    websocket,
    /\| \*\*API Version\*\* \| `([^`]+)` \|/,
    websocketPath,
  );

  if (
    openApiVersion !== overviewVersion ||
    websocketVersion !== overviewVersion
  ) {
    throw new Error(
      `API version mismatch: overview=${overviewVersion}, REST=${openApiVersion || 'missing'}, WebSocket=${websocketVersion}`,
    );
  }

  if (releaseMetadata.currentApiVersion !== overviewVersion) {
    throw new Error(
      `Network docs version mismatch: metadata=${releaseMetadata.currentApiVersion}, contracts=${overviewVersion}`,
    );
  }

  const contractVersions = new Set(
    [...overview.matchAll(/^### v(\d+\.\d+\.\d+)/gm)].map((match) => match[1]),
  );
  for (const version of Object.keys(releaseMetadata.releaseDates)) {
    if (!contractVersions.has(version)) {
      throw new Error(`Release metadata references missing contract version ${version}`);
    }
  }
  const contractHead = gitValue(contractsRoot, ['rev-parse', 'HEAD']);
  if (contractHead !== releaseMetadata.contractsRef) {
    throw new Error(
      `Contract revision mismatch: docs metadata expects ${releaseMetadata.contractsRef}, checkout is ${contractHead}`,
    );
  }

  const docsBranch = gitValue(docsRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const isFeatureBranch = docsBranch.startsWith('feature/');
  const expectedNetwork =
    docsBranch === 'main'
      ? 'testnet'
      : docsBranch === 'devnet'
        ? 'devnet'
        : undefined;
  if (expectedNetwork && releaseMetadata.network !== expectedNetwork) {
    throw new Error(
      `Docs network mismatch: branch ${docsBranch} requires ${expectedNetwork}, metadata says ${releaseMetadata.network}`,
    );
  }

  const draftVersions = releaseMetadata.draftVersions ?? [];
  for (const version of draftVersions) {
    if (!contractVersions.has(version)) {
      throw new Error(`Draft metadata references missing contract version ${version}`);
    }
    if (Object.hasOwn(releaseMetadata.releaseDates, version)) {
      throw new Error(`API version ${version} cannot be both released and draft`);
    }
  }
  if (!isFeatureBranch && draftVersions.length > 0) {
    throw new Error(`Draft API versions are allowed only on docs feature branches, not ${docsBranch}`);
  }
  const currentIsReleased = Object.hasOwn(
    releaseMetadata.releaseDates,
    releaseMetadata.currentApiVersion,
  );
  const currentIsDraft = draftVersions.includes(releaseMetadata.currentApiVersion);
  if (!currentIsReleased && !(isFeatureBranch && currentIsDraft)) {
    throw new Error(
      `Current API version ${releaseMetadata.currentApiVersion} must have a release date, or be listed as a draft on a feature branch`,
    );
  }

  return releaseMetadata;
}

async function readReleaseMetadata(docsRoot) {
  const metadataPath = path.resolve(docsRoot, 'config/api-release-metadata.json');
  assertFile(metadataPath);

  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse API release metadata at ${metadataPath}: ${error.message}`);
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`API release metadata must be an object in ${metadataPath}`);
  }
  if (!['devnet', 'testnet'].includes(metadata.network)) {
    throw new Error(`Invalid network in ${metadataPath}: ${metadata.network}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(metadata.currentApiVersion ?? '')) {
    throw new Error(`Invalid currentApiVersion in ${metadataPath}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(metadata.contractsRef ?? '')) {
    throw new Error(`contractsRef must be a full Git commit SHA in ${metadataPath}`);
  }
  if (
    !metadata.releaseDates ||
    typeof metadata.releaseDates !== 'object' ||
    Array.isArray(metadata.releaseDates)
  ) {
    throw new Error(`releaseDates must be an object in ${metadataPath}`);
  }
  if (
    metadata.draftVersions !== undefined &&
    (!Array.isArray(metadata.draftVersions) ||
      metadata.draftVersions.some((version) => !/^\d+\.\d+\.\d+$/.test(version)))
  ) {
    throw new Error(`draftVersions must be an array of API versions in ${metadataPath}`);
  }
  for (const [version, date] of Object.entries(metadata.releaseDates)) {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !isIsoDate(date)) {
      throw new Error(`Invalid release date for API version ${version} in ${metadataPath}`);
    }
  }

  return metadata;
}

function renderPublishedOverview(body, releaseMetadata) {
  const marker = /^## Changelog\r?\n/m;
  const match = marker.exec(body);
  if (!match) throw new Error('API overview has no Changelog section');

  const changelogStart = match.index + match[0].length;
  const changelog = body.slice(changelogStart);
  const sections = changelog.split(/(?=^### )/m);
  const preamble = sections.shift() ?? '';
  const publishedSections = sections.flatMap((section) => {
    const heading = section.match(/^### v(\d+\.\d+\.\d+)(?:\s+\([^\r\n]*\))?(\r?\n)/);
    if (!heading) return [];

    const version = heading[1];
    const isReleased = Object.hasOwn(releaseMetadata.releaseDates, version);
    const isDraft = (releaseMetadata.draftVersions ?? []).includes(version);
    if (!isReleased && !isDraft) return [];

    const date = releaseMetadata.releaseDates[version];
    const suffix = date ? ` (${date})` : isDraft ? ' (Unreleased)' : '';
    const renderedHeading = `### v${version}${suffix}${heading[2]}`;
    return [section.replace(/^### v\d+\.\d+\.\d+(?:\s+\([^\r\n]*\))?\r?\n/, renderedHeading)];
  });

  return `${body.slice(0, changelogStart)}${preamble}${publishedSections.join('')}`;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function gitValue(directory, args) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`Unable to inspect Git state in ${directory}: ${error.message}`);
  }
}

function matchVersion(source, pattern, sourcePath) {
  const match = source.match(pattern);

  if (!match) {
    throw new Error(`API version not found in ${sourcePath}`);
  }

  return match[1];
}

async function syncErrorCodes({ docsRoot, contractsRoot }) {
  const apiCodesPath = path.resolve(contractsRoot, 'v1/schemas/ApiErrorCodes.yaml');
  const onChainCodesPath = path.resolve(contractsRoot, 'v1/schemas/ErrorCodes.yaml');
  assertFile(apiCodesPath);
  assertFile(onChainCodesPath);

  const [apiSource, onChainSource] = await Promise.all([
    readFile(apiCodesPath, 'utf8'),
    readFile(onChainCodesPath, 'utf8'),
  ]);
  const apiCodes = readRegistry(load(apiSource), 'api_error_codes', apiCodesPath);
  const onChainCodes = readRegistry(load(onChainSource), 'error_codes', onChainCodesPath);
  const outputPath = path.resolve(docsRoot, errorCodesOutput);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderErrorCodes(apiCodes, onChainCodes), 'utf8');
}

function readRegistry(document, key, sourcePath) {
  if (!document || !Array.isArray(document[key])) {
    throw new Error(`Expected '${key}' array in ${sourcePath}`);
  }

  return document[key];
}

function renderErrorCodes(apiCodes, onChainCodes) {
  return `---
title: Error Codes
description: API and on-chain error codes generated from the public API contracts.
---

This page is generated from the public API contracts. Do not edit it manually.

## API Errors

API errors are raised before a request reaches the trading chain.

| Code | Category | Message |
|---:|---|---|
${apiCodes.map((entry) => `| \`${tableCell(entry.code)}\` | ${tableCell(entry.category)} | ${tableCell(entry.msg)} |`).join('\n')}

## On-Chain Errors

On-chain errors identify a transaction that reached the trading chain and reverted. Batch results can report an on-chain error for an individual item.

| Code | Pallet | Message |
|---|---|---|
${onChainCodes.map((entry) => `| \`${tableCell(entry.code)}\` | ${tableCell(entry.pallet)} | ${tableCell(entry.msg)} |`).join('\n')}
`;
}

function tableCell(value) {
  return String(value ?? '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function rewriteSchemaLinks(body) {
  return body.replaceAll(
    /\[(`?)([A-Za-z]+)\1\]\([^)]*\/schemas\/\2\.ya?ml\)/g,
    (link, ticks, name) => {
      const restPage = schemaRestPages[name];
      if (!restPage) return `\`${name}\``;
      return `[\`${name}\`](${restPage})`;
    },
  );
}

function extractTitle(source) {
  const match = source.match(/^# ([^\r\n]+)\r?\n(?:\r?\n)?/);

  if (!match) return { body: source };

  return {
    title: match[1].trim(),
    body: source.slice(match[0].length),
  };
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncContractDocs().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
