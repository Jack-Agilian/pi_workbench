import { serveWorker } from './worker-runtime.ts';
import { modelServices } from './model-services.ts';
serveWorker({ model: async (options,selection,key,fetch) => {
  if (selection.mode !== 'live') throw new Error('explicit_live_model_required');
  return modelServices(options,selection,key,fetch);
} });
