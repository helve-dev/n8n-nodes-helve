import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class HelveApi implements ICredentialType {
	name = 'helveApi';
	displayName = 'Helve API';
	icon: Icon = { light: 'file:helve.svg', dark: 'file:helve.dark.svg' };
	documentationUrl = 'https://docs.helve.dev';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'sk_live_...',
			description:
				'Your Helve API key (get $1.00 free starter credit at https://helve.dev/signup — 0% per-call markup, spend_limit_usd caps, $0 failed-call escrow)',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://helve.dev',
			required: true,
			description: 'Base URL of the Helve API gateway',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/tools',
			method: 'GET',
		},
	};
}
