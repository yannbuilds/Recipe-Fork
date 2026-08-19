import assert from 'node:assert/strict';
import {
  CLASSIFY_MAX_COMPLETION_TOKENS,
  CLASSIFY_MIN_COMPLETION_TOKENS,
  completionTokenBudget,
  groqFailureMessage,
} from '../supabase/functions/parse-recipe-text/groq.ts';

const typicalBudget = completionTokenBudget('x'.repeat(2_500), 'x'.repeat(3_000), CLASSIFY_MAX_COMPLETION_TOKENS);
assert.equal(typicalBudget, CLASSIFY_MAX_COMPLETION_TOKENS, 'typical recipes should receive the full completion budget');

const longBudget = completionTokenBudget('x'.repeat(2_500), 'x'.repeat(20_000), CLASSIFY_MAX_COMPLETION_TOKENS);
assert.ok(longBudget < CLASSIFY_MIN_COMPLETION_TOKENS, 'oversized pastes should be rejected before calling Groq');

assert.match(groqFailureMessage(413, 'Request too large on tokens per minute'), /too long to organise/i);
assert.match(groqFailureMessage(429, 'rate_limit_exceeded'), /try again shortly/i);
assert.equal(groqFailureMessage(400, 'invalid request'), 'The recipe could not be organised');

console.log('Paste recipe organiser token-budget checks passed.');
