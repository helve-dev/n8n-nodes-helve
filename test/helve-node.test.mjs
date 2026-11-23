import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Helve } = require('../dist/nodes/Helve/Helve.node.js');
const { HelveApi } = require('../dist/credentials/HelveApi.credentials.js');

function makeContext({ items = [{ json: {} }], params = {}, httpMock, continueOnFail = false }) {
  const requests = [];
  const ctx = {
    getInputData: () => items,
    getCredentials: async () => ({ apiKey: 'sk_live_test_123', baseUrl: 'https://helve.dev' }),
    getNodeParameter: (name, _idx, fallback) =>
      Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
    getNode: () => ({ name: 'Helve', type: 'n8n-nodes-helve.helve', typeVersion: 1 }),
    continueOnFail: () => continueOnFail,
    helpers: {
      httpRequestWithAuthentication: async function (credName, opts) {
        assert.equal(credName, 'helveApi');
        requests.push(opts);
        if (httpMock) return httpMock(opts, requests.length - 1);
        return { ok: true, cost_usd: 0.002 };
      },
    },
  };
  return { ctx, requests };
}

test('node & credential metadata conform to n8n community standards', () => {
  const node = new Helve();
  assert.equal(node.description.name, 'helve');
  assert.equal(node.description.usableAsTool, true);
  assert.deepEqual(node.description.icon, { light: 'file:helve.svg', dark: 'file:helve.dark.svg' });

  const cred = new HelveApi();
  assert.equal(cred.name, 'helveApi');
  assert.deepEqual(cred.icon, { light: 'file:helve.svg', dark: 'file:helve.dark.svg' });
  assert.equal(cred.authenticate.type, 'generic');
});

test('webSearch sends helve.web_search payload with domains and tracks cost', async () => {
  const node = new Helve();
  const { ctx, requests } = makeContext({
    params: {
      resource: 'web',
      operation: 'webSearch',
      query: 'n8n community nodes',
      searchProvider: 'fusion',
      maxResults: 5,
      searchOptions: { mode: 'fast', includeDomains: 'docs.n8n.io, github.com' },
      spendLimitUsd: 0.1,
    },
    httpMock: async () => ({ results: [{ title: 'n8n Docs' }], cost_usd: 0.004 }),
  });

  const out = await node.execute.call(ctx);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://helve.dev/v1/tools/call');
  assert.equal(requests[0].body.tool_id, 'helve.web_search');
  assert.deepEqual(requests[0].body.arguments.include_domains, ['docs.n8n.io', 'github.com']);
  assert.equal(out[0][0].json._helve_execution.cost_usd, 0.004);
});

test('webExtract splits newline/comma URLs and passes content options', async () => {
  const node = new Helve();
  const { ctx, requests } = makeContext({
    params: {
      resource: 'web',
      operation: 'webExtract',
      urls: 'https://example.com/a\nhttps://example.com/b',
      extractProvider: 'exa',
      extractOptions: { format: 'markdown', summary: true, maxChars: 5000 },
      spendLimitUsd: 0,
    },
  });

  await node.execute.call(ctx);
  assert.equal(requests[0].body.tool_id, 'helve.web_extract');
  assert.deepEqual(requests[0].body.arguments.urls, ['https://example.com/a', 'https://example.com/b']);
  assert.equal(requests[0].body.arguments.content.summary, true);
});

test('audioTranscribe polls GET /v1/jobs/{id} when waitForCompletion is true', async () => {
  const node = new Helve();
  const { ctx, requests } = makeContext({
    params: {
      resource: 'audio',
      operation: 'audioTranscribe',
      audioUrl: 'https://example.com/clip.mp3',
      audioProvider: 'deepgram',
      audioOptions: { diarize: true, waitForCompletion: true, pollTimeoutSeconds: 30 },
      spendLimitUsd: 0.5,
    },
    httpMock: async (opts) => {
      if (opts.method === 'POST') return { job_id: 'job_abc123', status: 'queued' };
      return { id: 'job_abc123', status: 'completed', result: { text: 'hello world' }, cost_usd: 0.03 };
    },
  });

  const out = await node.execute.call(ctx);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.tool_id, 'helve.audio_transcribe');
  assert.equal(requests[1].url, 'https://helve.dev/v1/jobs/job_abc123');
  assert.equal(out[0][0].json.status, 'completed');
});

test('spendLimitUsd halts multi-item batch before exceeding cap', async () => {
  const node = new Helve();
  const { ctx, requests } = makeContext({
    items: [{ json: { q: '1' } }, { json: { q: '2' } }],
    params: {
      resource: 'tool',
      operation: 'callTool',
      toolId: 'exa.answer',
      argumentsJson: '{"query":"test","text":true}',
      spendLimitUsd: 0.01,
    },
    httpMock: async () => ({ answer: 'ok', cost_usd: 0.015 }),
  });

  await assert.rejects(
    () => node.execute.call(ctx),
    /Execution spend_limit_usd cap reached/,
  );
  assert.equal(requests.length, 1);
});

test('402 spend_limit_exceeded and 401 errors produce clear actionable messages', async () => {
  const node = new Helve();
  const { ctx: ctx402 } = makeContext({
    params: { resource: 'tool', operation: 'callTool', toolId: 'exa.answer', argumentsJson: '{}', spendLimitUsd: 0 },
    httpMock: async () => {
      const err = new Error('Payment Required');
      err.statusCode = 402;
      err.response = { body: { error: 'spend_limit_exceeded' } };
      throw err;
    },
  });
  await assert.rejects(() => node.execute.call(ctx402), /helve\.dev\/dashboard/);

  const { ctx: ctx401 } = makeContext({
    params: { resource: 'tool', operation: 'callTool', toolId: 'exa.answer', argumentsJson: '{}', spendLimitUsd: 0 },
    httpMock: async () => {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    },
  });
  await assert.rejects(() => node.execute.call(ctx401), /helve\.dev\/signup/);
});

test('live searchTools works against https://helve.dev/v1/tools/search', async () => {
  const node = new Helve();
  const { ctx } = makeContext({
    params: { resource: 'tool', operation: 'searchTools', catalogQuery: 'web extract', catalogLimit: 3 },
    httpMock: async (opts) => {
      const resp = await fetch(opts.url, {
        method: opts.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opts.body),
      });
      assert.equal(resp.status, 200);
      return resp.json();
    },
  });
  const out = await node.execute.call(ctx);
  assert.ok(Array.isArray(out[0][0].json.tools));
  assert.ok(out[0][0].json.tools.length > 0);
});

test('all 3 self-hosted n8n workflow templates are valid JSON referencing n8n-nodes-helve.helve', () => {
  const files = [
    'templates/01-competitor-research-brief.json',
    'templates/02-podcast-meeting-audio-brief.json',
    'templates/03-sec-company-monitor.json',
  ];
  for (const file of files) {
    const wf = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(typeof wf.name === 'string' && wf.name.length > 5);
    assert.ok(Array.isArray(wf.nodes) && wf.nodes.length >= 4);
    assert.ok(wf.nodes.some((n) => n.type === 'n8n-nodes-helve.helve'), `${file} missing helve node`);
  }
});
