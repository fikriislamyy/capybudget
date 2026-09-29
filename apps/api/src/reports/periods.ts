import { workspaceToday } from '../tracking/recurrence';

export type ReportPreset='this_week'|'last_week'|'this_month'|'last_month'|'year_to_date';
const presets:ReportPreset[]=['this_week','last_week','this_month','last_month','year_to_date'];
function iso(date:Date){return date.toISOString().slice(0,10);}
function shift(date:Date,days:number){const value=new Date(date);value.setUTCDate(value.getUTCDate()+days);return value;}

export function resolveReportPeriod(preset:unknown,timezone:string,now=new Date()){
  if(!presets.includes(preset as ReportPreset))throw Object.assign(new Error('Choose a supported report period.'),{status:422,code:'INVALID_PRESET'});
  const today=workspaceToday(timezone,now),[year,month,day]=today.split('-').map(Number),date=new Date(Date.UTC(year!,month!-1,day!));
  let from:Date,to:Date;
  if(preset==='this_week'){from=shift(date,-((date.getUTCDay()+6)%7));to=shift(date,1);}
  else if(preset==='last_week'){to=shift(date,-((date.getUTCDay()+6)%7));from=shift(to,-7);}
  else if(preset==='this_month'){from=new Date(Date.UTC(year!,month!-1,1));to=shift(date,1);}
  else if(preset==='last_month'){to=new Date(Date.UTC(year!,month!-1,1));from=new Date(Date.UTC(year!,month!-2,1));}
  else {from=new Date(Date.UTC(year!,0,1));to=shift(date,1);}
  return {preset:preset as ReportPreset,today,from:iso(from),toExclusive:iso(to),through:iso(shift(to,-1))};
}

export function dateRange(from:string,toExclusive:string){
  const rows:string[]=[];for(let d=new Date(from+'T00:00:00Z'),end=new Date(toExclusive+'T00:00:00Z');d<end;d=shift(d,1))rows.push(iso(d));return rows;
}
