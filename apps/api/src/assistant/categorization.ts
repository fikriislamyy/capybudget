export type CategoryRuleCandidate = {
  origin: 'explicit' | 'learned';
  supportCount: number | string;
  acceptedCount: number | string;
  [key: string]: unknown;
};

export function normalizeMerchant(value:unknown):string{
  return typeof value==='string'
    ?value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US').slice(0,200)
    :'';
}

/** Explicit actor-created rules win; learned rules require the documented support and agreement floor. */
export function chooseCategoryRule<T extends CategoryRuleCandidate>(rules:T[]):T|undefined{
  return rules.find((rule)=>rule.origin==='explicit')
    ??rules.find((rule)=>rule.origin==='learned'&&Number(rule.supportCount)>=3&&Number(rule.acceptedCount)/Number(rule.supportCount)>=0.9);
}
