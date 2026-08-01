import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDocsRoot = path.resolve(scriptDir, '..');
const defaultContractsRoot = path.resolve(defaultDocsRoot, '..', 'deepx-api-contracts');

const pages = [
  {
    source: 'v1/rest-api/guides.md',
    output: 'content/docs/developer/guides.mdx',
    title: 'Guide',
    description: 'General API behavior, timestamps, ordering, and pagination.',
  },
  {
    source: 'v1/websocket/01-general-info.md',
    output: 'content/docs/developer/websocket/01-general-info.mdx',
    title: 'WebSocket General Information',
    description: 'Connection details, frame envelopes, heartbeat behavior, and data guarantees.',
  },
  {
    source: 'v1/websocket/02-subscribe-logic.md',
    output: 'content/docs/developer/websocket/02-subscribe-logic.mdx',
    title: 'Subscription Management',
    description: 'Subscribe, unsubscribe, heartbeat, active subscription listing, and error frames.',
  },
  {
    source: 'v1/websocket/streams/account-data.md',
    output: 'content/docs/developer/websocket/streams/account-data.mdx',
    title: 'Transparent Account Data Streams',
    description: 'Real-time subaccount positions, orders, trades, balances, and portfolio streams.',
  },
  {
    source: 'v1/websocket/streams/market-data.md',
    output: 'content/docs/developer/websocket/streams/market-data.mdx',
    title: 'Market Data Streams',
    description: 'Real-time orderbook, trade, ticker, price, funding, open interest, candle, and lending market streams.',
  },
];

export async function syncContractDocs({ docsRoot = defaultDocsRoot, contractsRoot } = {}) {
  const resolvedContractsRoot = path.resolve(
    contractsRoot ?? process.env.DEEPX_API_CONTRACTS_DIR ?? defaultContractsRoot,
  );
  assertDirectory(resolvedContractsRoot);

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
