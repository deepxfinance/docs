import type { SchemaUIOptions } from '@fumadocs/api-docs/components/schema';

type Schema = SchemaUIOptions['root'];

// Fumadocs spreads parent schemas into union members. Give every member its own
// description (including undefined), so that spread cannot inherit the parent's.
export function withOwnSchemaDescriptions(root: Schema, resolver: SchemaUIOptions['resolver']) {
  const copies = new WeakMap<object, Schema>();
  const originals = new WeakMap<object, Schema>();

  function visit(schema: Schema): Schema {
    if (typeof schema === 'boolean') return schema;
    const cached = copies.get(schema);
    if (cached !== undefined) return cached;

    const copy = { ...schema, description: schema.description };
    copies.set(schema, copy);
    originals.set(copy, schema);

    // Expand shorthand unions ourselves: their synthetic members have no own
    // description. Keep the parent description and all validation metadata.
    if (Array.isArray(schema.type)) {
      copy.type = undefined;
      copy.anyOf = undefined;
      copy.oneOf = schema.type.map((type: Exclude<typeof schema.type, unknown[]>) => (
        visit({ ...schema, type, description: undefined })
      ));
      return copy;
    }

    for (const key of ['oneOf', 'anyOf', 'allOf', 'prefixItems'] as const) {
      const members = schema[key];
      if (members) copy[key] = members.map(visit);
    }
    for (const key of ['properties', 'patternProperties', '$defs', 'dependentSchemas'] as const) {
      const members = schema[key];
      if (members) copy[key] = Object.fromEntries(Object.entries(members).map(([name, child]) => [name, visit(child)]));
    }
    for (const key of ['items', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties'] as const) {
      const child = schema[key];
      if (child !== undefined) copy[key] = visit(child);
    }
    return copy;
  }

  return {
    root: visit(root),
    resolver: ((schema) => {
      const resolved = resolver(typeof schema === 'object' ? originals.get(schema) ?? schema : schema);
      return { ...resolved, dereferenced: visit(resolved.dereferenced) };
    }) satisfies SchemaUIOptions['resolver'],
  };
}
