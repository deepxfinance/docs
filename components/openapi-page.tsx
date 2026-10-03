'use client';

import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { Schema, type SchemaUIOptions } from '@fumadocs/api-docs/components/schema';
import { InlineResponseSchema } from './inline-response-schema';
import { renderOperationLayout } from './openapi-operation-layout';

export const OpenAPIPage = createOpenAPIPage({
  content: { renderOperationLayout },
  schemaUI: {
    // Fumadocs passes client options at runtime but omits them from this hook's type.
    render(props: Omit<SchemaUIOptions, 'resolver' | 'renderMarkdown' | 'client'> & {
      client?: SchemaUIOptions['client'];
    }, ctx) {
      const options: SchemaUIOptions = {
        ...props,
        client: props.client ?? { name: 'body', as: 'body' },
        resolver: (schema) => ({
          dereferenced: schema,
          $ref: typeof schema === 'object' ? ctx.schema.getRawRef(schema) : undefined,
        }),
        renderMarkdown: ctx._default_processMarkdown,
      };

      return props.client?.name === 'response' && props.client.as === 'body'
        ? <InlineResponseSchema {...options} />
        : <Schema {...options} />;
    },
  },
});
