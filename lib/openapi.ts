import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: ['./sdk-api.json'],
  // proxyUrl: '/api/proxy',
});
