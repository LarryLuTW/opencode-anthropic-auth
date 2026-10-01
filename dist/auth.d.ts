type CallbackParams = {
    code: string;
    state: string;
};
export type CallbackServer = {
    close: () => Promise<void>;
    waitForCode: () => Promise<CallbackParams>;
};
export type AuthorizationResult = {
    url: string;
    redirectUri: string;
    state: string;
    verifier: string;
};
export declare function startCallbackServer(expectedState: string): Promise<CallbackServer>;
export declare function authorize(mode: 'max' | 'console', redirectUri?: string): Promise<AuthorizationResult>;
export type ExchangeResult = {
    type: 'success';
    refresh: string;
    access: string;
    expires: number;
} | {
    type: 'failed';
};
export declare function exchange(input: string, verifier: string, redirectUri: string, expectedState?: string): Promise<ExchangeResult>;
export {};
