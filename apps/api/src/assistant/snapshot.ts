import {createHash} from 'node:crypto';
export const FORECAST_ENGINE_VERSION='cashflow-v2.1';
export function forecastInputHash(built:any,prefs:any,horizon:number){return createHash('sha256').update(JSON.stringify({engine:FORECAST_ENGINE_VERSION,accounts:built.accounts,history:built.history,events:built.events,uncertainReceivables:built.uncertainReceivables,settings:{version:prefs.version,consent:prefs.consent_version,permissions:built.allowed},today:built.today,horizon})).digest('hex');}
