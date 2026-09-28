export type DecisionDecimal = string; // Runtime canonical validation is mandatory.
export type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue };
export type Document = { json: string }; // Canonical frozen-ACAP JSON encoding of a structured object.
export declare function encodeDocument(value: { [key: string]: StructuredValue }): Document;
export declare function decodeDocument(document: Document): { [key: string]: StructuredValue };
export interface ChoiceOption { id: string; description: Document }
export interface ScoreLevel extends ChoiceOption { value: DecisionDecimal }
export type DecisionQuestion = { name: string; instructions: Document } & (
  { kind: 'boolean'; criteria?: { true?: Document; false?: Document } } |
  { kind: 'choice'; options: ChoiceOption[] } |
  { kind: 'score'; levels: ScoreLevel[] }
);
export interface DecisionRequest { state: Document; model?: string; questions: DecisionQuestion[] }
export interface Distribution { id: string; probability: DecisionDecimal }
export type DecisionAnswer = { name: string } & (
  { kind: 'boolean'; probability: DecisionDecimal } |
  { kind: 'choice'; selected: string; confidence: DecisionDecimal; distribution: Distribution[] } |
  { kind: 'score'; expectedScore: DecisionDecimal; confidence: DecisionDecimal; distribution: Distribution[]; legend: ScoreLevel[] }
);
export interface DecisionResponse { provider: string; model: string; answers: DecisionAnswer[]; usage: { inputTokens: number; outputTokens: number } }
export interface DecisionProvider {
  readonly id: string;
  evaluate(request: DecisionRequest, context: { signal: AbortSignal; deadlineMs: number }): Promise<DecisionResponse>;
  listModels?(): Promise<{ id: string; description: string }[]>;
}
export declare function validateRequest(request: unknown): DecisionRequest;
export declare function validateResponse(request: DecisionRequest, response: unknown): DecisionResponse;
export declare const ID: string;
export declare const URI: string;
export declare const requirement: { capabilityId: string; major: number; minMinor: number; operations: string[]; features: string[] };
