import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

function parseDomainList(raw: string): string[] {
	return raw
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function extractCostUsd(response: IDataObject): number {
	const direct = response.cost_usd ?? response.charged_usd;
	if (typeof direct === 'number' && Number.isFinite(direct)) {
		return direct;
	}
	const meta = response.meta as IDataObject | undefined;
	if (meta && typeof meta.cost_usd === 'number' && Number.isFinite(meta.cost_usd)) {
		return meta.cost_usd;
	}
	const billing = response.billing as IDataObject | undefined;
	if (billing && typeof billing.charged_usd === 'number' && Number.isFinite(billing.charged_usd)) {
		return billing.charged_usd;
	}
	return 0;
}

function formatHttpError(err: unknown, operation: string): string {
	const e = err as {
		statusCode?: number;
		httpCode?: string;
		message?: string;
		response?: { status?: number; body?: unknown; data?: unknown };
	};
	const status = e?.statusCode ?? Number(e?.httpCode) ?? e?.response?.status;
	const body = e?.response?.body ?? e?.response?.data;
	const bodyText =
		typeof body === 'string'
			? body
			: body && typeof body === 'object'
				? JSON.stringify(body)
				: '';

	if (status === 401) {
		return `Helve authentication failed (HTTP 401) during ${operation}. Check your Helve API key (sk_live_...) or get $1.00 free credit at https://helve.dev/signup.`;
	}
	if (status === 402 || bodyText.includes('spend_limit_exceeded')) {
		return `Helve spend cap or balance limit reached (HTTP 402) during ${operation}. Top up or adjust your key spend_limit_usd at https://helve.dev/dashboard. ${bodyText}`.trim();
	}
	return e?.message || `Helve API request failed during ${operation}`;
}

export class Helve implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Helve',
		name: 'helve',
		icon: 'file:helve.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Access 330+ pay-per-call APIs (web search, page extract, audio transcription, SEC filings, LLMs) through one HELVE_API_KEY at 0% markup with spend_limit_usd caps.',
		defaults: {
			name: 'Helve',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'helveApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Web Search',
						value: 'webSearch',
						description:
							'Search the live web across 11 engines (Exa, Tavily, Brave, Serper, Firecrawl, Perplexity, etc.) or run multi-engine fusion',
						action: 'Search the web',
					},
					{
						name: 'Page Extract',
						value: 'webExtract',
						description:
							'Fetch and extract clean Markdown, summaries, or query-focused excerpts from up to 20 URLs',
						action: 'Extract web pages',
					},
					{
						name: 'Audio Transcribe',
						value: 'audioTranscribe',
						description:
							'Submit an audio or video URL for transcription via AssemblyAI, Deepgram, or ElevenLabs Scribe',
						action: 'Transcribe audio',
					},
					{
						name: 'Get Job Status',
						value: 'getJob',
						description: 'Poll an async Helve job (such as audio transcription) by job ID',
						action: 'Get job status',
					},
					{
						name: 'Call Any Tool (330+ APIs)',
						value: 'callTool',
						description:
							'Invoke any tool_id in the Helve catalog (e.g. exa.answer, sec_edgar.search_filings, openrouter.chat)',
						action: 'Call any Helve tool',
					},
					{
						name: 'Search Catalog (Free)',
						value: 'searchTools',
						description:
							'Search 330+ available APIs by intent or category to inspect tool_id, input schema, and upfront pricing',
						action: 'Search Helve catalog',
					},
				],
				default: 'webSearch',
			},

			// --- Web Search ---
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. n8n self-hosted deployment best practices 2026',
				displayOptions: {
					show: {
						operation: ['webSearch'],
					},
				},
				description: 'Natural-language or keyword search query.',
			},
			{
				displayName: 'Provider',
				name: 'searchProvider',
				type: 'options',
				default: 'auto',
				displayOptions: {
					show: {
						operation: ['webSearch'],
					},
				},
				options: [
					{ name: 'Auto (Best Available)', value: 'auto' },
					{ name: 'Fusion (Multi-Engine Consensus)', value: 'fusion' },
					{ name: 'Brave', value: 'brave' },
					{ name: 'Exa', value: 'exa' },
					{ name: 'Firecrawl', value: 'firecrawl' },
					{ name: 'Jina', value: 'jina' },
					{ name: 'Linkup', value: 'linkup' },
					{ name: 'Octen', value: 'octen' },
					{ name: 'Parallel', value: 'parallel' },
					{ name: 'Perplexity', value: 'perplexity' },
					{ name: 'Serper', value: 'serper' },
					{ name: 'Tavily', value: 'tavily' },
					{ name: 'Valyu', value: 'valyu' },
				],
				description: 'Search engine to serve the query.',
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 10,
				displayOptions: {
					show: {
						operation: ['webSearch'],
					},
				},
				description: 'Number of results to return (1–100).',
			},
			{
				displayName: 'Additional Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['webSearch'],
					},
				},
				options: [
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						default: '',
						options: [
							{ name: 'Provider Default', value: '' },
							{ name: 'Instant', value: 'instant' },
							{ name: 'Fast', value: 'fast' },
							{ name: 'Balanced', value: 'balanced' },
							{ name: 'Deep', value: 'deep' },
						],
					},
					{
						displayName: 'Include Domains',
						name: 'includeDomains',
						type: 'string',
						default: '',
						placeholder: 'docs.n8n.io, github.com',
						description: 'Comma- or newline-separated domains to restrict results to.',
					},
					{
						displayName: 'Exclude Domains',
						name: 'excludeDomains',
						type: 'string',
						default: '',
						placeholder: 'pinterest.com',
						description: 'Comma- or newline-separated domains to exclude.',
					},
					{
						displayName: 'Published After (YYYY-MM-DD)',
						name: 'publishedAfter',
						type: 'string',
						default: '',
						placeholder: '2026-01-01',
					},
				],
			},

			// --- Page Extract ---
			{
				displayName: 'URLs',
				name: 'urls',
				type: 'string',
				required: true,
				default: '',
				typeOptions: { rows: 3 },
				placeholder: 'https://example.com/article\nhttps://docs.n8n.io',
				displayOptions: {
					show: {
						operation: ['webExtract'],
					},
				},
				description: 'One to 20 URLs to extract (comma- or newline-separated).',
			},
			{
				displayName: 'Provider',
				name: 'extractProvider',
				type: 'options',
				default: 'auto',
				displayOptions: {
					show: {
						operation: ['webExtract'],
					},
				},
				options: [
					{ name: 'Auto (Best Available)', value: 'auto' },
					{ name: 'Exa', value: 'exa' },
					{ name: 'Firecrawl', value: 'firecrawl' },
					{ name: 'Jina', value: 'jina' },
					{ name: 'Linkup', value: 'linkup' },
					{ name: 'Octen', value: 'octen' },
					{ name: 'Parallel', value: 'parallel' },
					{ name: 'Serper', value: 'serper' },
					{ name: 'Tavily', value: 'tavily' },
					{ name: 'Valyu', value: 'valyu' },
				],
			},
			{
				displayName: 'Additional Options',
				name: 'extractOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['webExtract'],
					},
				},
				options: [
					{
						displayName: 'Focus Query',
						name: 'query',
						type: 'string',
						default: '',
						description: 'Optional topic to guide summaries and excerpts.',
					},
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						default: 'markdown',
						options: [
							{ name: 'Markdown', value: 'markdown' },
							{ name: 'Plain Text', value: 'text' },
						],
					},
					{
						displayName: 'Include Summary',
						name: 'summary',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Max Characters Per URL',
						name: 'maxChars',
						type: 'number',
						typeOptions: { minValue: 100, maxValue: 100000 },
						default: 20000,
					},
				],
			},

			// --- Audio Transcribe ---
			{
				displayName: 'Audio / Video URL',
				name: 'audioUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/podcast-episode.mp3',
				displayOptions: {
					show: {
						operation: ['audioTranscribe'],
					},
				},
				description: 'Publicly reachable HTTPS URL of the recording.',
			},
			{
				displayName: 'Provider',
				name: 'audioProvider',
				type: 'options',
				default: 'auto',
				displayOptions: {
					show: {
						operation: ['audioTranscribe'],
					},
				},
				options: [
					{ name: 'Auto (Best Available)', value: 'auto' },
					{ name: 'AssemblyAI', value: 'assemblyai' },
					{ name: 'Deepgram', value: 'deepgram' },
					{ name: 'ElevenLabs Scribe', value: 'elevenlabs' },
				],
			},
			{
				displayName: 'Additional Options',
				name: 'audioOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['audioTranscribe'],
					},
				},
				options: [
					{
						displayName: 'Language (BCP-47)',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: 'en',
					},
					{
						displayName: 'Speaker Diarization',
						name: 'diarize',
						type: 'boolean',
						default: false,
						description: 'Whether to label speakers as speaker_0, speaker_1, etc.',
					},
					{
						displayName: 'Timestamps',
						name: 'timestamps',
						type: 'options',
						default: 'word',
						options: [
							{ name: 'Word-Level', value: 'word' },
							{ name: 'None', value: 'none' },
						],
					},
					{
						displayName: 'Wait For Completion',
						name: 'waitForCompletion',
						type: 'boolean',
						default: false,
						description:
							'Whether to poll GET /v1/jobs/{id} until the transcription completes or fails.',
					},
					{
						displayName: 'Poll Timeout (Seconds)',
						name: 'pollTimeoutSeconds',
						type: 'number',
						typeOptions: { minValue: 10, maxValue: 600 },
						default: 180,
					},
				],
			},

			// --- Get Job Status ---
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'job_...',
				displayOptions: {
					show: {
						operation: ['getJob'],
					},
				},
				description: 'Async job ID returned by Audio Transcribe or another async Helve tool.',
			},

			// --- Call Any Tool ---
			{
				displayName: 'Tool ID',
				name: 'toolId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. exa.answer, sec_edgar.search_filings, openrouter.chat',
				displayOptions: {
					show: {
						operation: ['callTool'],
					},
				},
				description: 'Exact Helve catalog tool_id (use Search Catalog to discover 330+ tools).',
			},
			{
				displayName: 'Arguments (JSON)',
				name: 'argumentsJson',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['callTool'],
					},
				},
				description: 'JSON object matching the tool input_schema.',
			},

			// --- Search Catalog ---
			{
				displayName: 'Catalog Search Query',
				name: 'catalogQuery',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. sec 10-k filings, web search, audio transcription',
				displayOptions: {
					show: {
						operation: ['searchTools'],
					},
				},
			},
			{
				displayName: 'Category',
				name: 'catalogCategory',
				type: 'string',
				default: '',
				placeholder: 'Optional category filter (e.g. search, finance, audio)',
				displayOptions: {
					show: {
						operation: ['searchTools'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'catalogLimit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 30 },
				default: 10,
				displayOptions: {
					show: {
						operation: ['searchTools'],
					},
				},
			},

			// --- Budget Cap (applies to paid operations) ---
			{
				displayName: 'Execution Spend Limit (USD)',
				name: 'spendLimitUsd',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 4 },
				default: 0,
				displayOptions: {
					show: {
						operation: ['webSearch', 'webExtract', 'audioTranscribe', 'callTool'],
					},
				},
				description:
					'Optional per-execution client-side USD cap (0 = disabled, rely on your Helve API key server-side spend_limit_usd). Stops processing remaining items once cumulative cost reaches this cap.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('helveApi');
		const baseUrl = String(credentials.baseUrl || 'https://helve.dev').replace(/\/+$/, '');
		const apiKey = String(credentials.apiKey || '').trim();

		let cumulativeCostUsd = 0;

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const spendLimitUsd =
				operation === 'webSearch' ||
				operation === 'webExtract' ||
				operation === 'audioTranscribe' ||
				operation === 'callTool'
					? (this.getNodeParameter('spendLimitUsd', i, 0) as number)
					: 0;

			if (spendLimitUsd > 0 && cumulativeCostUsd >= spendLimitUsd) {
				const err = new NodeOperationError(
					this.getNode(),
					`Execution spend_limit_usd cap reached ($${cumulativeCostUsd.toFixed(4)} >= $${spendLimitUsd.toFixed(4)}) before item ${i}.`,
					{ itemIndex: i },
				);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: err.message, cumulative_cost_usd: cumulativeCostUsd },
						pairedItem: { item: i },
					});
					continue;
				}
				throw err;
			}

			try {
				let requestOptions: IHttpRequestOptions;

				if (operation === 'searchTools') {
					const body: IDataObject = {
						query: this.getNodeParameter('catalogQuery', i) as string,
						limit: this.getNodeParameter('catalogLimit', i, 10) as number,
					};
					const category = (this.getNodeParameter('catalogCategory', i, '') as string).trim();
					if (category) body.category = category;

					requestOptions = {
						method: 'POST',
						url: `${baseUrl}/v1/tools/search`,
						headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
						body,
						json: true,
					};
				} else if (operation === 'getJob') {
					const jobId = (this.getNodeParameter('jobId', i) as string).trim();
					requestOptions = {
						method: 'GET',
						url: `${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`,
						headers: { Authorization: `Bearer ${apiKey}` },
						json: true,
					};
				} else {
					let toolId = '';
					let args: IDataObject = {};

					if (operation === 'webSearch') {
						toolId = 'helve.web_search';
						const opts = this.getNodeParameter('searchOptions', i, {}) as IDataObject;
						args = {
							query: this.getNodeParameter('query', i) as string,
							provider: this.getNodeParameter('searchProvider', i, 'auto') as string,
							max_results: this.getNodeParameter('maxResults', i, 10) as number,
						};
						if (opts.mode) args.mode = opts.mode;
						if (opts.includeDomains) {
							const list = parseDomainList(String(opts.includeDomains));
							if (list.length > 0) args.include_domains = list;
						}
						if (opts.excludeDomains) {
							const list = parseDomainList(String(opts.excludeDomains));
							if (list.length > 0) args.exclude_domains = list;
						}
						if (opts.publishedAfter) args.published_after = String(opts.publishedAfter).trim();
					} else if (operation === 'webExtract') {
						toolId = 'helve.web_extract';
						const rawUrls = this.getNodeParameter('urls', i) as string;
						const urls = parseDomainList(rawUrls);
						if (urls.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one URL is required.', {
								itemIndex: i,
							});
						}
						const opts = this.getNodeParameter('extractOptions', i, {}) as IDataObject;
						args = {
							urls,
							provider: this.getNodeParameter('extractProvider', i, 'auto') as string,
						};
						if (opts.query) args.query = String(opts.query);
						const content: IDataObject = { full_text: true };
						if (opts.format) content.format = opts.format;
						if (opts.summary !== undefined) content.summary = Boolean(opts.summary);
						if (opts.maxChars) content.max_chars = Number(opts.maxChars);
						args.content = content;
					} else if (operation === 'audioTranscribe') {
						toolId = 'helve.audio_transcribe';
						const opts = this.getNodeParameter('audioOptions', i, {}) as IDataObject;
						args = {
							audio_url: (this.getNodeParameter('audioUrl', i) as string).trim(),
							provider: this.getNodeParameter('audioProvider', i, 'auto') as string,
						};
						if (opts.language) args.language = String(opts.language).trim();
						if (opts.diarize !== undefined) args.diarize = Boolean(opts.diarize);
						if (opts.timestamps) args.timestamps = String(opts.timestamps);
					} else if (operation === 'callTool') {
						toolId = (this.getNodeParameter('toolId', i) as string).trim();
						const rawArgs = this.getNodeParameter('argumentsJson', i, '{}');
						if (typeof rawArgs === 'string') {
							args = JSON.parse(rawArgs || '{}') as IDataObject;
						} else if (rawArgs && typeof rawArgs === 'object') {
							args = rawArgs as IDataObject;
						}
					}

					requestOptions = {
						method: 'POST',
						url: `${baseUrl}/v1/tools/call`,
						headers: { Authorization: `Bearer ${apiKey}` },
						body: {
							tool_id: toolId,
							arguments: args,
						},
						json: true,
					};
				}

				let response = (await this.helpers.httpRequest(requestOptions)) as IDataObject;

				// Optional polling for audioTranscribe when waitForCompletion is enabled
				if (operation === 'audioTranscribe') {
					const opts = this.getNodeParameter('audioOptions', i, {}) as IDataObject;
					const waitForCompletion = Boolean(opts.waitForCompletion);
					const jobId =
						(response.job_id as string | undefined) ||
						((response.result as IDataObject | undefined)?.job_id as string | undefined) ||
						((response.data as IDataObject | undefined)?.job_id as string | undefined) ||
						(response.id as string | undefined);

					if (waitForCompletion && jobId) {
						const timeoutMs = Number(opts.pollTimeoutSeconds || 180) * 1000;
						const deadline = Date.now() + timeoutMs;
						while (Date.now() < deadline) {
							const jobResp = (await this.helpers.httpRequest({
								method: 'GET',
								url: `${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`,
								headers: { Authorization: `Bearer ${apiKey}` },
								json: true,
							})) as IDataObject;
							const status = String(jobResp.status || '').toLowerCase();
							if (status === 'completed' || status === 'failed' || status === 'cancelled') {
								response = jobResp;
								break;
							}
							await new Promise((r) => setTimeout(r, 3000));
						}
					}
				}

				const callCost = extractCostUsd(response);
				cumulativeCostUsd += callCost;

				returnData.push({
					json: {
						...response,
						_helve_execution: {
							operation,
							cost_usd: callCost,
							cumulative_cost_usd: Number(cumulativeCostUsd.toFixed(6)),
							spend_limit_usd: spendLimitUsd > 0 ? spendLimitUsd : null,
						},
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				const message = formatHttpError(error, operation);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: message, cumulative_cost_usd: cumulativeCostUsd },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
