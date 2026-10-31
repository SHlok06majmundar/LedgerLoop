# Background jobs run from a MongoDB collection

The spec named Redis and BullMQ. We keep jobs in a `jobs` collection instead, so production needs one stateful service rather than two. A worker claims a job with an atomic `findOneAndUpdate` (status, `runAt` and lock fields), retries with exponential backoff, and reclaims jobs whose lock is older than the timeout. Job enqueueing can share the caller's transaction, so an Import Job and its processing job are created together or not at all. If throughput ever outgrows polling, the `JobQueue` interface is the seam for a Redis-backed adapter.
