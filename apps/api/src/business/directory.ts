import {Elysia} from 'elysia';import {randomUUID} from 'node:crypto';
import {scope,recipient} from './routes';import {q,reject,text,uuid,recordAudit} from './shared';import {protectedJson} from '../security/business-fields';import {currencyScale,addMoney} from './money';
function query(request:Request){const p=new URL(request.url).searchParams;return {search:(p.get('q')??'').slice(0,100),page:Math.min(10000,Math.max(1,Math.floor(Number(p.get('page'))||1))),archived:p.get('archived')==='true'};}
export const businessDirectoryRoutes=new Elysia({name:'business-directory'})
.get('/api/workspaces/:workspaceId/contacts',({request,params})=>scope(request,params.workspaceId,async(tx)=>{
 const p=query(request),kind=new URL(request.url).searchParams.get('kind')??'';if(kind&&!['customer','vendor','both'].includes(kind))reject('Choose customer or vendor.');
 return {items:await q(tx,"select * from business_contacts where workspace_id=$1 and ($2 or archived_at is null) and ($3='' or name ilike '%'||$3||'%') and ($4='' or kind=$4 or kind='both') order by lower(name),id limit 50 offset $5",[params.workspaceId,p.archived,p.search,kind,(p.page-1)*50]),page:p.page};
}))
.get('/api/workspaces/:workspaceId/contacts/:id',({request,params})=>scope(request,params.workspaceId,async(tx)=>{const [contact]=await q(tx,'select * from business_contacts where workspace_id=$1 and id=$2',[params.workspaceId,uuid(params.id)]);if(!contact)reject('Contact not found.',404);return {contact};}))
.post('/api/workspaces/:workspaceId/contacts',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json() as any,name=text(b.name,200,true),kind=b.kind??'customer';if(!['customer','vendor','both'].includes(kind))reject('Choose a contact type.');
 const details=recipient({...b.details,name}),id=randomUUID();const duplicates=await q(tx,'select id,name from business_contacts where workspace_id=$1 and lower(name)=lower($2) and archived_at is null limit 10',[params.workspaceId,name]);
 await q(tx,'insert into business_contacts(id,workspace_id,name,kind,details) values($1,$2,$3,$4,$5::jsonb)',[id,params.workspaceId,name,kind,protectedJson(details,params.workspaceId,id,'details')]);await recordAudit(tx,params.workspaceId,actor.id,id,'contact','created',{kind});return Response.json({contact:(await q(tx,'select * from business_contacts where workspace_id=$1 and id=$2',[params.workspaceId,id]))[0],duplicates},{status:201});
}))
.patch('/api/workspaces/:workspaceId/contacts/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const b=await request.json() as any,name=text(b.name,200,true),kind=b.kind;if(!['customer','vendor','both'].includes(kind)||!Number.isInteger(b.version))reject('Choose a type and current version.');const details=recipient({...b.details,name});
 const [saved]=await q(tx,'update business_contacts set name=$3,kind=$4,details=$5::jsonb,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$6 and archived_at is null returning *',[params.workspaceId,uuid(params.id),name,kind,protectedJson(details,params.workspaceId,params.id,'details'),b.version]);if(!saved)reject('Contact changed or is archived. Reload before editing.',409);await recordAudit(tx,params.workspaceId,actor.id,saved.id,'contact','updated',{version:saved.version});return {contact:saved};
}))
.delete('/api/workspaces/:workspaceId/contacts/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const [saved]=await q(tx,'update business_contacts set archived_at=now(),version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,uuid(params.id)]);if(!saved)reject('Contact not found.',404);await recordAudit(tx,params.workspaceId,actor.id,saved.id,'contact','archived',{});return {archived:true};
}))
.get('/api/workspaces/:workspaceId/catalog',({request,params})=>scope(request,params.workspaceId,async(tx)=>{
 const p=query(request);return {items:await q(tx,"select * from catalog_items where workspace_id=$1 and ($2 or archived_at is null) and ($3='' or name ilike '%'||$3||'%' or sku ilike '%'||$3||'%') order by lower(name),id limit 50 offset $4",[params.workspaceId,p.archived,p.search,(p.page-1)*50]),page:p.page};
}))
.get('/api/workspaces/:workspaceId/catalog/:id',({request,params})=>scope(request,params.workspaceId,async(tx)=>{const [item]=await q(tx,'select * from catalog_items where workspace_id=$1 and id=$2',[params.workspaceId,uuid(params.id)]);if(!item)reject('Catalog item not found.',404);return {item};}))
.post('/api/workspaces/:workspaceId/catalog',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{return saveCatalog(tx,params.workspaceId,actor.id,await request.json());}))
.patch('/api/workspaces/:workspaceId/catalog/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{return saveCatalog(tx,params.workspaceId,actor.id,await request.json(),uuid(params.id));}))
.delete('/api/workspaces/:workspaceId/catalog/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{const [saved]=await q(tx,'update catalog_items set archived_at=now(),version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and archived_at is null returning id',[params.workspaceId,uuid(params.id)]);if(!saved)reject('Catalog item not found.',404);await recordAudit(tx,params.workspaceId,actor.id,saved.id,'catalog','archived',{});return {archived:true};}));
async function saveCatalog(tx:Parameters<typeof q>[0],ws:string,actor:string,b:any,id?:string){
 const sku=text(b.sku,80,true),name=text(b.name,200,true),unit=text(b.unit,80,true),description=text(b.description??name,500),currency=text(b.currency,3,true).toUpperCase();if(!['product','service'].includes(b.kind)||!/^[A-Z]{3}$/.test(currency))reject('Choose a product or service and a valid currency.');
 let price:string;try{price=addMoney(b.unitPrice,'0',currencyScale(currency));}catch{reject('Enter a non-negative price in the selected currency.');}if(price.startsWith('-'))reject('Price cannot be negative.');
 const tax=b.taxRateId?uuid(b.taxRateId):null;if(tax){const [rate]=await q(tx,'select id from business_tax_rates where workspace_id=$1 and id=$2 and archived_at is null',[ws,tax]);if(!rate)reject('Choose a saved active tax rate in this business.');}
 const key=id??randomUUID();let saved;
 if(id){if(!Number.isInteger(b.version))reject('Send the current version.');[saved]=await q(tx,'update catalog_items set sku=$3,name=$4,kind=$5,unit=$6,description=$7,unit_price=$8,currency=$9,tax_rate_id=$10,version=version+1,updated_at=now() where workspace_id=$1 and id=$2 and version=$11 and archived_at is null returning *',[ws,key,sku,name,b.kind,unit,description,price,currency,tax,b.version]);if(!saved)reject('Catalog item changed or is archived. Reload before editing.',409);}
 else [saved]=await q(tx,'insert into catalog_items(workspace_id,id,sku,name,kind,unit,description,unit_price,currency,tax_rate_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *',[ws,key,sku,name,b.kind,unit,description,price,currency,tax]);
 await recordAudit(tx,ws,actor,key,'catalog',id?'updated':'created',{sku,version:saved.version});return Response.json({item:saved},{status:id?200:201});
}
