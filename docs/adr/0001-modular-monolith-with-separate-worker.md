# Modular monolith with a separately deployed worker

LedgerLoop is one NestJS codebase split into feature modules, deployed as three processes: the HTTP API, a BullMQ worker (CSV imports, reconciliation, emails) and a single scheduler. Microservices would add network seams between modules that share one Postgres transaction boundary (payments and allocations must commit together), so we keep one codebase and only split by runtime concern.
