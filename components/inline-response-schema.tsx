'use client';

import { useContext, useId, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  generateSchemaUI,
  type SchemaData,
  type SchemaUIGeneratedData,
  type SchemaUIOptions,
} from '@fumadocs/api-docs/components/schema';
import { AutoExpandResponseContext } from './openapi-operation-layout';
import { withOwnSchemaDescriptions } from '../lib/schema-descriptions';

interface SchemaTraversal {
  generated: SchemaUIGeneratedData;
  expandAll: boolean;
  ancestors: string[];
}

export function InlineResponseSchema({ client, ...options }: SchemaUIOptions) {
  const expandAll = useContext(AutoExpandResponseContext);
  const { root, resolver, renderMarkdown, readOnly, writeOnly, showExample } = options;
  const generated = useMemo(() => generateSchemaUI({
    ...withOwnSchemaDescriptions(root, resolver),
    renderMarkdown, readOnly, writeOnly, showExample,
    labels: {
      default: 'Default', match: 'Match', format: 'Format', multipleOf: 'Multiple Of',
      range: 'Range', length: 'Length', properties: 'Properties', items: 'Items',
      valueIn: 'Value in', example: 'Example',
    },
  }), [root, resolver, renderMarkdown, readOnly, writeOnly, showExample]);
  const schema = generated.refs[generated.$root];
  const traversal = { generated, expandAll, ancestors: [generated.$root] };

  return (
    <div className="text-sm">
      {schema.type === 'primitive' ? (
        <SchemaRow name={client.name} type={generated.$root} {...traversal} />
      ) : (
        <>
          <Description schema={schema} />
          <SchemaBody schema={schema} {...traversal} />
        </>
      )}
    </div>
  );
}

function Description({ schema }: { schema: SchemaData }) {
  return (
    <div className="prose-no-margin py-2 empty:hidden">
      {schema.description}
      {schema.infoTags && schema.infoTags.length > 0 && (
        <div className="not-prose mt-2 flex flex-wrap gap-2">
          {schema.infoTags.map((tag, index) => (
            <span key={index} className="max-w-full rounded-lg border bg-fd-secondary p-1.5 text-xs">
              <span className="font-medium">{tag.label}: </span>
              <code className="whitespace-pre-wrap break-words text-fd-muted-foreground">{tag.value}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaRow({ name, type, required, generated, expandAll, ancestors }: SchemaTraversal & {
  name: string;
  type: string;
  required?: boolean;
}) {
  // Recursive references stay available to expand manually without rendering forever.
  const [open, setOpen] = useState(expandAll && !ancestors.includes(type));
  const contentId = useId();
  const schema = generated.refs[type];
  const expandable = schema.type === 'array'
    || (schema.type === 'object' && schema.props.length > 0)
    || ((schema.type === 'or' || schema.type === 'and') && schema.items.length > 0);
  const label = (
    <>
      <span className={`font-mono font-medium text-fd-primary ${schema.deprecated ? 'line-through opacity-80' : ''}`}>
        {name}<span className={required ? 'text-red-400' : 'text-fd-muted-foreground'}>{required ? '*' : '?'}</span>
      </span>
      <span className="min-w-0 break-words font-mono text-fd-muted-foreground">{schema.aliasName}</span>
      {schema.deprecated && <span className="text-xs text-yellow-600 dark:text-yellow-400">Deprecated</span>}
    </>
  );

  return (
    <div className="border-t py-3 first:border-t-0">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
          onClick={() => setOpen(!open)}
          className="not-prose flex w-full flex-wrap items-center gap-2 rounded-sm text-start focus-visible:outline-2 focus-visible:outline-fd-ring"
        >
          <ChevronRight aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          {label}
        </button>
      ) : (
        <div className="not-prose flex flex-wrap items-center gap-2 ps-6">{label}</div>
      )}
      <Description schema={schema} />
      {expandable && (
        <div id={contentId} hidden={!open} className="ms-2 mt-2 border-s ps-3">
          {/* Mount children only when expanded, including recursive schemas. */}
          {open && <SchemaBody schema={schema} generated={generated} expandAll={expandAll} ancestors={[...ancestors, type]} />}
        </div>
      )}
    </div>
  );
}

function SchemaBody({ schema, ...traversal }: SchemaTraversal & { schema: SchemaData }) {
  const { generated, ancestors } = traversal;
  if (schema.type === 'object') {
    return schema.props.map((prop) => (
      <SchemaRow key={prop.name} name={prop.name} type={prop.$type} required={prop.required} {...traversal} />
    ));
  }
  if (schema.type === 'array') {
    // Show object item fields immediately when the array's arrow is opened.
    const item = generated.refs[schema.item.$type];
    return item.type === 'object' ? (
      <>
        <Description schema={item} />
        <SchemaBody schema={item} {...traversal} ancestors={[...ancestors, schema.item.$type]} />
      </>
    ) : (
      <SchemaRow name="[index: integer]" type={schema.item.$type} {...traversal} />
    );
  }
  if (schema.type === 'or' || schema.type === 'and') {
    return (
      <>
        <p className="my-2 text-fd-muted-foreground">{schema.type === 'or' ? 'One of' : 'All of'}</p>
        {schema.items.map((item, index) => (
          <SchemaRow key={`${item.$type}:${index}`} name={item.name} type={item.$type} {...traversal} />
        ))}
      </>
    );
  }
  return null;
}
