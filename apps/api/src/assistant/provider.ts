/** Provider boundary for optional assistant language tasks. Finance facts and writes
 * remain deterministic and server-owned; providers can only return allowlisted IDs
 * and bounded wording. MVP categorization and suggestions remain local; optional
 * V2 language tasks use the configured Groq or Meta Muse adapter.
 */
export type ProviderCategoryInput = {
  transactionType: 'income' | 'expense';
  merchant: string;
  allowedCategories: Array<{ id: string; name: string; type: 'income' | 'expense' }>;
};
export type ProviderCategoryResult = { categoryId: string; phraseId: 'category_match' } | null;
export type ProviderSuggestionInput = {
  locale: 'en' | 'id';
  candidates: Array<{ id: string; reasonCode: string; facts: Record<string, string> }>;
};
export type ProviderSuggestionResult = Array<{ candidateId: string; phraseId: string }> | null;

export interface AssistantProvider {
  categorize(input: ProviderCategoryInput, signal?: AbortSignal): Promise<ProviderCategoryResult>;
  phraseSuggestions(input: ProviderSuggestionInput, signal?: AbortSignal): Promise<ProviderSuggestionResult>;
}

export const disabledAssistantProvider: AssistantProvider = {
  async categorize() { return null; },
  async phraseSuggestions() { return null; }
};

export { languageProviderAvailable as assistantProviderAvailable } from "./v2/providers";
