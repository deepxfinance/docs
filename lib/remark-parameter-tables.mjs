import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateTable(table, source) {
  const fail = (message) => {
    throw new Error(`Parameter table ${source}: ${message}`);
  };

  if (!isRecord(table) || !isRecord(table.columns) || !Array.isArray(table.rows)) {
    fail('expected a columns mapping and a rows array');
  }

  const columns = Object.entries(table.columns);
  if (columns.length === 0 || table.rows.length === 0) {
    fail('columns and rows must not be empty');
  }

  const isCell = (value) => typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value);
  if (columns.some(([, label]) => !isCell(label))) {
    fail('column labels must be non-empty, single-line strings');
  }

  for (const [index, row] of table.rows.entries()) {
    if (!isRecord(row) || Object.keys(row).length !== columns.length ||
        columns.some(([key]) => !Object.hasOwn(row, key) || !isCell(row[key]))) {
      fail(`row ${index + 1} must contain exactly the column keys, with quoted string values`);
    }
  }

  return table;
}

function escapeCell(value) {
  return value.replaceAll('|', '\\|');
}

export function renderParameterTable(table, source = 'inline') {
  validateTable(table, source);
  const columns = Object.entries(table.columns);
  const row = (cells) => `| ${cells.map(escapeCell).join(' | ')} |`;

  return [
    row(columns.map(([, label]) => label)),
    row(columns.map(() => '---')),
    ...table.rows.map((item) => row(columns.map(([key]) => item[key]))),
  ].join('\n');
}

/** Expand YAML before headings, search data, and processed Markdown are collected. */
export default function remarkParameterTables({ directory = path.resolve('data/parameters') } = {}) {
  return async (tree, file) => {
    const references = [];
    function collect(node) {
      if ((node.type === 'mdxJsxFlowElement' && node.name === 'ParameterTable') ||
          (node.type === 'mdxJsxTextElement' && node.name === 'ParameterValue')) {
        references.push(node);
        return;
      }
      for (const child of node.children ?? []) collect(child);
    }
    collect(tree);
    if (references.length === 0) return;

    const replacements = [];
    for (const node of references) {
      if (node.name === 'ParameterValue') {
        const attributes = Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value]));
        if (node.attributes.length !== 2 || node.attributes.some((a) => a.type !== 'mdxJsxAttribute') ||
            attributes.source !== 'funding' || !/^[A-Za-z][A-Za-z0-9]*$/.test(attributes.name ?? '') ||
            node.children.length !== 0) {
          file.fail('Use <ParameterValue source="funding" name="fieldName" />.', node);
        }
        const source = path.join(directory, 'funding.yaml');
        file.data._compiler?.addDependency(source);
        const values = yaml.load(await readFile(source, 'utf8'), { schema: yaml.JSON_SCHEMA });
        const value = values?.[attributes.name];
        if (typeof value !== 'string' || !/^[A-Za-z0-9+.% -]+$/.test(value) || !value.trim()) {
          file.fail(`Invalid or missing parameter ${attributes.name} in ${source}.`, node);
        }
        replacements.push({ start: node.position.start.offset, end: node.position.end.offset, markdown: value });
        continue;
      }
      const [attribute] = node.attributes;
      if (node.attributes.length !== 1 || attribute.type !== 'mdxJsxAttribute' ||
          attribute.name !== 'source' || typeof attribute.value !== 'string' ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(attribute.value) || node.children.length !== 0) {
        file.fail('Use <ParameterTable source="table-name" /> with a literal table name.', node);
      }

      const source = path.join(directory, `${attribute.value}.yaml`);
      file.data._compiler?.addDependency(source);
      const table = yaml.load(await readFile(source, 'utf8'), { schema: yaml.JSON_SCHEMA });
      replacements.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        markdown: renderParameterTable(table, source),
      });
    }

    let content = String(file);
    for (const { start, end, markdown } of replacements.sort((a, b) => b.start - a.start)) {
      content = content.slice(0, start) + markdown + content.slice(end);
    }
    file.value = content;

    // Reparse so Fumadocs sees source positions for generated cells in its search index.
    Object.assign(tree, this.parse(file));
  };
}
