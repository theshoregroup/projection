# All background work runs on trigger.dev

Email — and any future CRON, long-running, or workflow task — runs as trigger.dev tasks in `packages/tasks`, rendering react-email templates from `packages/templates`. Each template carries a zod key+schema and is registered in a typed registry, so task payloads are validated end-to-end.

Direct Resend calls from tRPC handlers were rejected: the queue provides retries, idempotency keys, and concurrency limits off the Vercel function clock, and gives one home for all non-request work as the product grows.
