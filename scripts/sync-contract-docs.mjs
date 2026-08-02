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

const pages = [
  {
    source: 'v1/rest-api/guides.md',
    output: 'content/docs/api/guides.mdx',
    title: 'Guide',
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
  await syncErrorCodes({ docsRoot, contractsRoot: resolvedContractsRoot });

  for (const page of pages) {
    const sourcePath = path.resolve(resolvedContractsRoot, page.source);
    const outputPath = path.resolve(docsRoot, page.output);

    assertFile(sourcePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    const source = await readFile(sourcePath, 'utf8');
    const { title, body } = extractTitle(source);
    const frontmatter = `---\ntitle: ${title ?? page.title}\ndescription: ${page.description}\n---\n\n`;
    await writeFile(outputPath, `${frontmatter}${body}`, 'utf8');
  }
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
