export function currencyScale(currency:string):number{
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('Use a three-letter currency code.');
  if(['IDR','JPY','KRW','VND'].includes(currency))return 0;
  if(['BHD','KWD','OMR','JOD','TND'].includes(currency))return 3;
  return 2;
}
