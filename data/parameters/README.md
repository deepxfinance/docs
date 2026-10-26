# Parameter Tables

The YAML files in this directory supply the four parameter tables in the trading and lending documentation. Each network branch keeps its own values. These files are documentation snapshots, not live network queries or market initialization configuration.

Edit the relevant YAML file to change a table. `columns` maps field names to column labels in display order. Each item in `rows` must contain exactly those field names. Keep all labels and values as quoted strings. Preserve decimal precision, percentage signs, units, and thousands separators in the display values. Use `"-"` for an unused interest curve point. Column labels can contain inline Markdown, including math.

| File | Table |
| --- | --- |
| `spot-markets.yaml` | Spot market specifications |
| `perpetual-markets.yaml` | Perpetual market specifications |
| `margin.yaml` | Lending margin parameters and caps |
| `interest-rates.yaml` | Borrow interest curve and reserve factor |

Insert a table on its own line in an MDX page:

```mdx
<ParameterTable source="spot-markets" />
```

`lib/remark-parameter-tables.mjs` expands this reference to a Markdown table during MDX compilation. Expansion occurs before heading extraction, search indexing, and Markdown export. YAML files are registered as compiler dependencies, so changes also update the page during development. No generated table files need to be committed.

Run `yarn test:parameters` to check that all four tables reach page HTML, search data, and processed Markdown. Run `yarn build` to check the production application.
