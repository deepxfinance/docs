# API Documentation Release Workflow

`main` documents testnet and `devnet` documents devnet. Keep a separate `config/api-release-metadata.json` on each network branch; do not copy release dates between branches without checking that the API version became available on both networks on the same date.

In release metadata, `releaseDates` records when each API version first became available on that branch's network. It is not the contract edit date or the docs build date. `currentApiVersion` must match the version in the selected contracts revision, and `contractsRef` must be the full commit SHA used to generate the docs.

`content/docs/api`, including `overview.mdx`, REST and WebSocket pages, guides, and error codes, plus `sdk-api.json`, are generated. Do not edit those outputs manually. Before running `npm run generate:docs`, check out the revision in `contractsRef` in `deepx-api-contracts`, or set `DEEPX_API_CONTRACTS_DIR` to a checkout at that revision. The generator checks the network, API version, and contract commit before writing generated files.

Add a version and its network release date to metadata only after the API is available on that network and the feature is eligible for publication under the workspace release policy. Then run `npm run generate:docs` from this repository and commit the metadata and generated outputs together. Network branches omit unreleased contract versions. On a `feature/<name>` branch only, list preview versions in `draftVersions`; they appear with an `(Unreleased)` label and must not be carried into `main` or `devnet` before release.

