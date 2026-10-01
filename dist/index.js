import { Credential, Integration, Plugin } from '@opencode/plugin/effect';
import { Effect } from 'effect';
import { authorize, exchange, startCallbackServer } from "./auth.js";
import { CLAUDE_CODE_IDENTITY, CLIENT_ID, REQUIRED_BETAS, TOKEN_URL, USER_AGENT, } from "./constants.js";
const integrationID = 'anthropic';
const methodID = Integration.MethodID.make('oauth');
export const AnthropicAuthPlugin = Plugin.define({
    id: 'anthropic-auth',
    effect: (ctx) => Effect.gen(function* () {
        yield* ctx.integration.transform((integrations) => {
            integrations.method.update({
                integrationID,
                method: {
                    id: methodID,
                    type: 'oauth',
                    label: 'Claude account (Pro/Max/Team/Enterprise)',
                },
                authorize: () => Effect.gen(function* () {
                    const result = yield* Effect.promise(() => authorize('max'));
                    const server = yield* Effect.promise(() => startCallbackServer(result.state));
                    yield* Effect.addFinalizer(() => Effect.promise(() => server.close()));
                    return {
                        mode: 'auto',
                        url: result.url,
                        instructions: 'Complete sign-in in your browser. OpenCode will connect automatically.',
                        callback: Effect.gen(function* () {
                            const callback = yield* Effect.promise(() => server.waitForCode());
                            const credentials = yield* Effect.promise(() => exchange(`${callback.code}#${callback.state}`, result.verifier, result.redirectUri, result.state));
                            if (credentials.type === 'failed') {
                                return yield* Effect.fail(new Error('Anthropic authorization code exchange failed'));
                            }
                            return oauthCredential(credentials);
                        }),
                    };
                }),
                refresh: (credential) => Effect.promise(() => sharedRefresh(credential.refresh)),
            });
        });
        const addClaudeIdentity = (event) => Effect.gen(function* () {
            if (event.model.providerID !== integrationID)
                return;
            const connection = yield* ctx.integration.connection.active(integrationID);
            if (!connection)
                return;
            const credential = yield* ctx.integration.connection
                .resolve(connection)
                .pipe(Effect.orDie);
            if (credential?.type !== 'oauth' || credential.methodID !== methodID)
                return;
            if (event.system.some((part) => part.type === 'text' && part.text === CLAUDE_CODE_IDENTITY))
                return;
            event.system.unshift({ type: 'text', text: CLAUDE_CODE_IDENTITY });
        });
        // Each request kind has its own hook. Anthropic answers OAuth requests
        // without the identity with HTTP 429, so auxiliary requests need it too.
        yield* ctx.session.hook('context', addClaudeIdentity);
        yield* ctx.session.hook('compaction', addClaudeIdentity);
        yield* ctx.session.hook('generate', addClaudeIdentity);
        yield* ctx.session.hook('title', addClaudeIdentity);
        yield* ctx.session.hook('model.request', (event) => Effect.gen(function* () {
            if (event.model.providerID !== integrationID)
                return;
            const connection = yield* ctx.integration.connection.active(integrationID);
            if (!connection)
                return;
            const credential = yield* ctx.integration.connection
                .resolve(connection)
                .pipe(Effect.orDie);
            if (credential?.type !== 'oauth' || credential.methodID !== methodID)
                return;
            setOAuthHeaders(event.headers, credential.access);
        }));
    }),
});
function setOAuthHeaders(headers, accessToken) {
    const existingBetas = [];
    for (const key of Object.keys(headers)) {
        const name = key.toLowerCase();
        if (name === 'anthropic-beta')
            existingBetas.push(headers[key] ?? '');
        if (name === 'authorization' ||
            name === 'anthropic-beta' ||
            name === 'user-agent' ||
            name === 'x-api-key') {
            delete headers[key];
        }
    }
    const betas = new Set([
        ...REQUIRED_BETAS,
        ...existingBetas
            .join(',')
            .split(',')
            .map((beta) => beta.trim())
            .filter(Boolean),
    ]);
    headers.authorization = `Bearer ${accessToken}`;
    headers['anthropic-beta'] = [...betas].join(',');
    headers['user-agent'] = USER_AGENT;
}
// Anthropic refresh tokens are single-use. OpenCode can refresh the same
// expired credential from several requests at once (for example a new
// session's reply and its title), so callers share one refresh per token.
// A successful result stays reusable briefly for callers that arrive just
// after it settles; a failure is dropped so the next request can retry.
const REFRESH_REUSE_MS = 60_000;
const refreshes = new Map();
function sharedRefresh(refreshToken) {
    const existing = refreshes.get(refreshToken);
    if (existing)
        return existing;
    const refresh = refreshTokens(refreshToken).then(oauthCredential);
    refreshes.set(refreshToken, refresh);
    refresh.then(() => {
        setTimeout(() => {
            if (refreshes.get(refreshToken) === refresh)
                refreshes.delete(refreshToken);
        }, REFRESH_REUSE_MS).unref?.();
    }, () => {
        if (refreshes.get(refreshToken) === refresh)
            refreshes.delete(refreshToken);
    });
    return refresh;
}
async function refreshTokens(refreshToken) {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
            'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Anthropic token refresh failed: ${response.status}${body ? ` - ${body}` : ''}`);
    }
    return response.json();
}
function oauthCredential(tokens) {
    if ('access_token' in tokens) {
        return Credential.OAuth.make({
            type: 'oauth',
            methodID,
            refresh: tokens.refresh_token,
            access: tokens.access_token,
            expires: Date.now() + tokens.expires_in * 1000,
        });
    }
    return Credential.OAuth.make({ ...tokens, type: 'oauth', methodID });
}
export default AnthropicAuthPlugin;
