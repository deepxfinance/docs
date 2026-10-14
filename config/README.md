# API Documentation Release Workflow

`main` documents testnet and `devnet` documents devnet. Keep a separate `config/api-release-metadata.json` on each network branch; check API availability on that network before updating its `currentApiVersion`.

In release metadata, `currentApiVersion` is the latest API version available on that branch's network, and `contractsRef` is the full commit SHA used to generate the docs. `releaseDates` maps API versions to the publication dates shown beside their changelog headings. These dates are separate from contract authoring dates.

`content/docs/api`, including `overview.mdx`, REST and WebSocket pages, guides, and error codes, plus `sdk-api.json`, are generated. Do not edit those outputs manually. Before running `npm run generate:docs`, check out the revision in `contractsRef` in `deepx-api-contracts`, or set `DEEPX_API_CONTRACTS_DIR` to a checkout at that revision. The generator checks the network, API version, and contract commit before writing generated files.

The shared OpenAPI contract may list servers for both devnet and testnet. Generation keeps only the server for the current docs branch, and the WebSocket General Information page likewise keeps only that network's base endpoint.

When publishing a docs version, update `currentApiVersion` and add its date to `releaseDates`, preserving all previous entries. First commit the contract changes and set `contractsRef` to that full commit SHA; then run `npm run generate:docs` from this repository and commit the metadata and generated outputs together. Network branches omit unreleased contract versions. On a `feature/<name>` branch only, list preview versions in `draftVersions`; they appear with an `(Unreleased)` label and must not be carried into `main` or `devnet` before release.

