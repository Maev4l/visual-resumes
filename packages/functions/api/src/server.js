import { serve } from '@hono/node-server';
import { app } from './app.js';

// PORT is set by Lambda env (matches AWS Lambda Web Adapter's forward target).
const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port });
