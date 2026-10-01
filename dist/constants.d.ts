export declare const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export declare const AUTHORIZE_URLS: {
    readonly console: "https://platform.claude.com/oauth/authorize";
    readonly max: "https://claude.ai/oauth/authorize";
};
export declare const CALLBACK_HOST: string;
export declare const CALLBACK_PORT = 53692;
export declare const CALLBACK_PATH = "/callback";
export declare const CODE_CALLBACK_URL = "http://localhost:53692/callback";
export declare const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export declare const OAUTH_SCOPES: string[];
export declare const REQUIRED_BETAS: string[];
export declare const CLAUDE_CODE_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
export declare const USER_AGENT = "claude-cli/2.1.280 (external, cli)";
