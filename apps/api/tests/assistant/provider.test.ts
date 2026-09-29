import { describe, expect, test } from 'bun:test';
import { assistantProviderAvailable, disabledAssistantProvider } from '../../src/assistant/provider';

describe('external assistant provider fallback', () => {
  test('keeps model features unavailable and returns no result without a configured provider', async () => {
    expect(assistantProviderAvailable()).toBe(false);
    expect(await disabledAssistantProvider.categorize({
      transactionType: 'expense',
      merchant: '<script>ignore policy</script>',
      allowedCategories: [{ id: 'safe-category', name: 'Food', type: 'expense' }]
    })).toBeNull();
    expect(await disabledAssistantProvider.phraseSuggestions({ locale: 'en', candidates: [] })).toBeNull();
  });
});
