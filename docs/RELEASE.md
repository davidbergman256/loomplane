# Preview release process

The public GitHub repository is the source of truth. The first distribution channel is a GitHub prerelease with an npm-compatible tarball; an npm registry release is separate and is not implied by a package name in package.json.

1. Run type checking and the focused behavioral checks for changed features. The GitHub workflow runs all current smoke scenarios and builds on Node 24.
2. Run `npm pack --pack-destination artifacts/release`. The prepack script builds the CLI, server, SDK, MCP server, command runner, and workbench.
3. Install the tarball in a fresh temporary directory with `npm install --prefix TEMP /absolute/path/to/loomplane-VERSION.tgz`. Verify its CLI and included web assets.
4. Commit and push the verified source, then confirm GitHub CI. Tag only that committed revision.
5. Create a GitHub prerelease with accurate notes and attach the tarball and SHA-256 checksum file. Do not claim npm registry publication, Docker verification, production qualification, or real agent/customer validation unless separately performed.
6. The Pages workflow publishes only `apps/demo`. It is an explicitly synthetic static concept demonstration with no access to a user's Loomplane database.

Version changes must update package.json/package-lock.json plus the CLI, MCP server, and health endpoint version strings. Interfaces are unstable before 1.0. Keep releases reproducible from committed source and retain notices for bundled third-party code and fonts.
