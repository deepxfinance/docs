import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import yaml from 'js-yaml';
import { renderParameterTable } from '../lib/remark-parameter-tables.mjs';

register('fumadocs-mdx/node/loader', import.meta.url);

const tables = [
  ['spot-markets', 'trading/market-specs', 'spot-market-specifications', 0],
  ['perpetual-markets', 'trading/market-specs', 'perpetual-market-specifications', 1],
  ['margin', 'lend-and-borrow/lend-and-borrow', 'margin-parameters', 0],
  ['interest-rates', 'lend-and-borrow/interest-rate', 'deepx-lending-protocol-parameters', 0],
];

for (const [name, page, heading, tableIndex] of tables) {
  test(`${name}: page HTML, search data, and Markdown contain the YAML values`, async () => {
    const data = yaml.load(await readFile(new URL(`../data/parameters/${name}.yaml`, import.meta.url), 'utf8'));
    const keys = Object.keys(data.columns);
    const expected = data.rows.map((row) => keys.map((key) => row[key]));
    const compiled = await import(`../content/docs/${page}.mdx?collection=docs`);

    const html = renderToStaticMarkup(createElement(compiled.default));
    const htmlTable = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)][tableIndex]?.[1];
    assert.ok(htmlTable, 'the page must render a real table');
    const actualRows = [...htmlTable.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
      .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]));
    assert.deepEqual(actualRows, expected);
    assert.ok(!html.includes('ParameterTable'), 'no unresolved component can reach the page');

    const markdownTables = compiled._markdown.match(/(?:^\|.*\|\n)+/gm);
    assert.ok(markdownTables?.[tableIndex], 'Markdown export must contain a real table');
    const markdownRows = markdownTables[tableIndex].trim().split('\n').slice(2)
      .map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
    assert.deepEqual(markdownRows, expected);
    assert.ok(!compiled._markdown.includes('<ParameterTable'));

    const search = compiled.structuredData.contents.filter((item) => item.heading === heading);
    assert.ok(search.length > 0, 'search data must include the table section');
    for (const value of expected.flat()) {
      assert.ok(search.some((item) => item.content.includes(value)), `search data must include ${value}`);
    }
    assert.ok(compiled.toc.some((item) => item.url === `#${heading}`), 'section links must stay valid');
  });
}

test('invalid parameter data fails instead of publishing incomplete or coerced values', () => {
  const columns = { asset: 'Asset', cap: 'Supply Cap' };
  for (const row of [
    { asset: 'BTC' },
    { asset: 'BTC', cap: '100', extra: 'unexpected' },
    { asset: 'BTC', cap: 100 },
    { asset: 'BTC', cap: '' },
    { asset: 'BTC', cap: '100\n200' },
  ]) {
    assert.throws(() => renderParameterTable({ columns, rows: [row] }), /row 1/);
  }
});

test('funding values appear in page HTML, search data, and Markdown', async () => {
  const data = yaml.load(await readFile(new URL('../data/parameters/funding.yaml', import.meta.url), 'utf8'));
  const page = await import('../content/docs/trading/funding-rates.mdx?collection=docs');
  const html = renderToStaticMarkup(createElement(page.default, {
    components: { Callout: ({ children }) => createElement('div', null, children) },
  }));
  const search = page.structuredData.contents.map((item) => item.content).join(' ');
  for (const [key, value] of Object.entries(data)) {
    for (const [where, content] of [['HTML', html], ['Markdown', page._markdown], ['search', search]]) {
      assert.ok(content.includes(value), `${where} must include ${key}: ${value}`);
    }
  }
  assert.ok(!html.includes('ParameterValue'));
  assert.ok(!page._markdown.includes('ParameterValue'));
  const perp = await import('../content/docs/trading/perpetuals-trading.mdx?collection=docs');
  assert.ok(perp._markdown.includes(`every ${data.fundingInterval}`));
});
