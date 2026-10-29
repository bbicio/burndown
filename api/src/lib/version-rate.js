// The exchange rate a cost-grid version gets for `currency`: EUR is always 1, an active currency
// takes its current rate, an inactive or unknown one is refused.

const CURRENCY_RULE_CODE = 'CURRENCY_RULE';

function versionRate(currency, currencyRow) {
  if (currency === 'EUR') return { rate: 1 };
  if (!currencyRow || !currencyRow.active) return { error: `Currency ${currency} is not active` };
  return { rate: parseFloat(currencyRow.current_rate) };
}

module.exports = { versionRate, CURRENCY_RULE_CODE };
