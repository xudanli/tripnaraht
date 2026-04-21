// Bootstrap worker to run TypeScript in worker_threads.
// We keep the actual worker logic in `scenario-eval.worker.ts` for type-safety.
require('ts-node/register');
require('./scenario-eval.worker.ts');

