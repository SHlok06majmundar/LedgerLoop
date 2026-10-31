# Organization scope comes from a header checked against membership

Routes such as `/customers` carry no organization in the path. The client sends `X-Organization-Id`; a guard loads the caller's active membership for that organization and rejects the request otherwise. Every repository query takes the organization id as a required argument, so a guessed record id from another Organization returns 404 rather than data. Path-scoped routes (`/organizations/:id/...`) were rejected because the spec's API surface is header-scoped and switching Organizations should not rewrite every URL.
