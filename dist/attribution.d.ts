type TextBlock = {
    type: string;
    text?: string;
    [key: string]: unknown;
};
type Message = {
    role: string;
    content: string | TextBlock[];
};
type Body = {
    system?: string | TextBlock[];
    messages?: Message[];
    [key: string]: unknown;
};
export declare function claudeCodeVersion(): string;
export declare function billingHeader(messages: Message[], version: string): string;
export declare function addBillingHeader(body: Body, version: string): boolean;
export declare function addBillingHeaderToRequest(original: Request, version: string): Promise<Request>;
export {};
