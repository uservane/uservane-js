# Changesets

Add a changeset for any change that should ship to npm: `pnpm changeset`.
On merge to `main`, the Release workflow opens a "Version Packages" PR; merging
that PR versions the changed packages, publishes them to npm, and cuts GitHub
releases. See https://github.com/changesets/changesets for details.
