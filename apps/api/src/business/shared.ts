import type { TransactionSql } from 'postgres';
import { protectedJson, revealRow } from '../security/business-fields';
export const q=async(tx:TransactionSql,sql:string,values:unknown[]=[])=> (await tx.unsafe(sql,values as never[])).map(row=>revealRow(row,String(row.workspace_id??values[0]??'')));
export function reject(message:string,status=422,code='INVALID_INPUT'):never{throw Object.assign(new Error(message),{status,code});}
export function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))reject('Enter text within the allowed length.');return value.trim();}
export function uuid(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))reject('Choose a valid record.');return value;}
export async function owner(tx:TransactionSql,ws:string,actor:string){const [m]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[ws,actor]);if(m?.role!=='owner')reject('Only the business owner can do this.',403,'PERMISSION_DENIED');}
export async function recordAudit(tx:TransactionSql,ws:string,actor:string,id:string,entity:string,action:string,change:unknown){await q(tx,'insert into audit_logs(workspace_id,actor_user_id,entity_type,entity_id,action,after) values($1,$2,$3,$4,$5,$6::jsonb)',[ws,actor,entity,id,action,protectedJson(change,ws,id,'after')]);}
export function csvCell(value:unknown){let s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^\s*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
