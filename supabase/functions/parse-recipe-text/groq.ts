const GROQ_REQUEST_TOKEN_BUDGET = 7_600;
const APPROXIMATE_CHARACTERS_PER_TOKEN = 3;

export const CLASSIFY_MAX_COMPLETION_TOKENS = 4_000;
export const CLASSIFY_MIN_COMPLETION_TOKENS = 1_400;

/**
 * Groq applies the on-demand TPM limit to the input plus the maximum requested
 * completion, rather than the number of tokens the model ultimately uses.
 * Keep some headroom for chat formatting and tokenizer differences.
 */
export function completionTokenBudget(system: string, user: string, requestedMaximum: number): number {
  const estimatedInputTokens = Math.ceil((system.length + user.length) / APPROXIMATE_CHARACTERS_PER_TOKEN);
  return Math.max(0, Math.min(requestedMaximum, GROQ_REQUEST_TOKEN_BUDGET - estimatedInputTokens));
}

export function groqFailureMessage(status: number, details: string): string {
  const normalised = details.toLowerCase();
  if (status === 413 || normalised.includes("request too large")) {
    return "This recipe is too long to organise in one go. Try removing unrelated text or use Enter field by field.";
  }
  if (status === 429 || normalised.includes("rate_limit_exceeded")) {
    return "AI limit reached – try again shortly.";
  }
  return "The recipe could not be organised";
}
