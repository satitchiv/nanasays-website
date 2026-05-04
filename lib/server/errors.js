/**
 * errors.js — shared error classes for the chat path.
 *
 * Extracted from nana-brain.js so llm-adapter.js can import the class
 * without creating a circular dependency (nana-brain.js imports
 * llm-adapter.js for the Gemini provider).
 *
 * The name "ClaudeError" is preserved for backward compatibility with the
 * many `e instanceof ClaudeError` checks scattered through nana-brain.js,
 * agentic-loop.js, prose-runner.js, and route handlers. Despite the name
 * it's the generic LLM-call error shape (Claude, MiniMax, Gemini, etc.).
 */

export class ClaudeError extends Error {
  constructor(msg, original) {
    super(msg);
    this.name     = 'ClaudeError';
    this.original = original;
  }
}
