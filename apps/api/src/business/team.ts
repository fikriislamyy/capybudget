import { beginInvitation, invitationStatus, invitationFromHeaders, clearInvitation, flowCookie, invitationCookie, invitationNeedsOnboarding } from './invitation-flow';
import {Elysia} from 'elysia';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {scope} from './routes';
import {q,owner,reject,text,uuid,recordAudit,csvCell} from './shared';
import {protectedText} from '../security/business-fields';
import {auth} from '../auth';
import {client} from '../db';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const roles=['accountant','staff','viewer'];
export const businessTeamRoutes=new Elysia({name:'business-team'})
.get('/api/workspaces/:workspaceId/business-access',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const [member]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[params.workspaceId,actor.id]);return {role:member.role};
}))
.get('/api/workspaces/:workspaceId/members',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);return {items:await q(tx,'select m.user_id as "userId",m.role,u.name,m.created_at as "createdAt" from workspace_memberships m join "user" u on u.id=m.user_id where m.workspace_id=$1 order by m.role,m.created_at',[params.workspaceId])};
}))
.patch('/api/workspaces/:workspaceId/members/:userId',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const ws=params.workspaceId;await owner(tx,ws,actor.id);const b=await request.json() as any;if(!roles.includes(b.role))reject('Choose accountant, staff, or viewer. Use ownership transfer to change the owner.');
 await q(tx,'select id from workspaces where id=$1 for update',[ws]);const [m]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2 for update',[ws,params.userId]);if(!m)reject('Member not found.',404);if(m.role==='owner')reject('Use ownership transfer before changing the owner role.',409);
 await q(tx,'update workspace_memberships set role=$3 where workspace_id=$1 and user_id=$2',[ws,params.userId,b.role]);await recordAudit(tx,ws,actor.id,ws,'membership','role_changed',{userId:params.userId,from:m.role,to:b.role});return {updated:true};
}))
.delete('/api/workspaces/:workspaceId/members/:userId',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const ws=params.workspaceId;await owner(tx,ws,actor.id);await q(tx,'select id from workspaces where id=$1 for update',[ws]);const [m]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2 for update',[ws,params.userId]);if(!m)reject('Member not found.',404);if(m.role==='owner')reject('Transfer ownership before removing this owner.',409);
 await q(tx,'delete from workspace_memberships where workspace_id=$1 and user_id=$2',[ws,params.userId]);await recordAudit(tx,ws,actor.id,ws,'membership','member_removed',{userId:params.userId});return {removed:true};
}))
.post('/api/workspaces/:workspaceId/members/transfer-owner',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const ws=params.workspaceId;await owner(tx,ws,actor.id);const b=await request.json() as any;if(b.confirm!==true||typeof b.userId!=='string'||b.userId===actor.id)reject('Confirm transfer to a different existing member.');
 const [w]=await q(tx,'select owner_user_id from workspaces where id=$1 for update',[ws]);if(w.owner_user_id!==actor.id)reject('Only the current primary owner can transfer ownership.',403);
 const [next]=await q(tx,'select m.user_id from workspace_memberships m join "user" u on u.id=m.user_id where m.workspace_id=$1 and m.user_id=$2 and u.account_status=\'active\' and u.email_verified for update of m',[ws,b.userId]);if(!next)reject('Choose an active verified member.');
 await q(tx,"update workspace_memberships set role='owner' where workspace_id=$1 and user_id=$2",[ws,b.userId]);await q(tx,'update workspaces set owner_user_id=$2,updated_at=now() where id=$1',[ws,b.userId]);await q(tx,"update workspace_memberships set role='accountant' where workspace_id=$1 and user_id=$2",[ws,actor.id]);await recordAudit(tx,ws,actor.id,ws,'membership','owner_transferred',{from:actor.id,to:b.userId});return {transferred:true};
}))
.get('/api/workspaces/:workspaceId/invitations',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);return {items:await q(tx,'select id,workspace_id,email_snapshot,role,email_state as "emailState",expires_at as "expiresAt",accepted_at as "acceptedAt",revoked_at as "revokedAt" from business_invitations where workspace_id=$1 order by created_at desc limit 100',[params.workspaceId])};
}))
.post('/api/workspaces/:workspaceId/invitations',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const ws=params.workspaceId;await owner(tx,ws,actor.id);const b=await request.json() as any,email=text(b.email,320,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!roles.includes(b.role))reject('Choose a valid email and role.');
 await q(tx,'select id from workspaces where id=$1 for update',[ws]);const [member]=await q(tx,'select 1 from workspace_memberships m join "user" u on u.id=m.user_id where m.workspace_id=$1 and lower(u.email)=$2',[ws,email]);if(member)reject('This person is already a member.',409);
 const token=randomBytes(32).toString('base64url'),id=randomUUID();await q(tx,'update business_invitations set revoked_at=now() where workspace_id=$1 and email_hash=$2 and accepted_at is null and revoked_at is null',[ws,digest(email)]);
 await q(tx,"insert into business_invitations(id,workspace_id,email_hash,email_snapshot,role,token_hash,expires_at,created_by,token_snapshot,email_locale,email_state) values($1,$2,$3,$4,$5,$6,now()+interval '7 days',$7,$8,$9,'pending')",[id,ws,digest(email),protectedText(email,ws,id,'email_snapshot'),b.role,digest(token),actor.id,protectedText(token,ws,id,'token_snapshot'),b.locale==='id'?'id':'en']);await recordAudit(tx,ws,actor.id,id,'invitation','invited',{role:b.role});
 return {id,url:(process.env.PUBLIC_APP_URL??process.env.WEB_ORIGIN??'http://localhost:5173')+'/join#'+token};
}))
.delete('/api/workspaces/:workspaceId/invitations/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 await owner(tx,params.workspaceId,actor.id);const [saved]=await q(tx,'update business_invitations set revoked_at=now() where workspace_id=$1 and id=$2 and accepted_at is null and revoked_at is null returning id',[params.workspaceId,uuid(params.id)]);if(!saved)reject('Pending invitation not found.',404);await recordAudit(tx,params.workspaceId,actor.id,params.id,'invitation','revoked',{});return {revoked:true};
}))
.post('/api/business/invitations/flow/start',async({request})=>{
 try {
  const body=await request.json() as {token?:unknown};const flow=await beginInvitation(body.token,request.headers);
  if(!flow)return Response.json({message:'This invitation has expired, was revoked, or has already been accepted.'},{status:410});
  return Response.json({started:true},{headers:{'Set-Cookie':flowCookie(flow.id,flow.ttl),'Cache-Control':'no-store'}});
 }catch{return Response.json({message:'Invitation service is temporarily unavailable. Please try again.'},{status:503});}
})
.get('/api/business/invitations/flow',async({request})=>{
 try {const session=await auth.api.getSession({headers:request.headers});return await invitationStatus(request.headers,session?.user);}
 catch{return Response.json({message:'Invitation service is temporarily unavailable. Please try again.'},{status:503});}
})
.post('/api/business/invitations/flow/cancel',async({request})=>{
 try {await clearInvitation(request.headers);return Response.json({cancelled:true},{headers:{'Set-Cookie':flowCookie('',0)}});}
 catch{return Response.json({message:'Invitation service is temporarily unavailable. Please try again.'},{status:503});}
})
.post('/api/business/invitations/flow/finish',async({request})=>{
 const session=await auth.api.getSession({headers:request.headers});if(!session?.user.emailVerified)return Response.json({message:'Sign in with the verified invited email.'},{status:403});
 try {
  const invite=await invitationFromHeaders(request.headers);
  if(!invite||invite.accepted_by!==session.user.id||await invitationNeedsOnboarding(session.user.id))return Response.json({message:'Accept the invitation and complete onboarding first.'},{status:409});
  await clearInvitation(request.headers);
  return Response.json({workspaceId:invite.workspace_id,userId:session.user.id},{headers:{'Set-Cookie':flowCookie('',0)}});
 }catch{return Response.json({message:'Invitation service is temporarily unavailable.'},{status:503});}
})
.post('/api/business/invitations/accept',async({request})=>{
 const session=await auth.api.getSession({headers:request.headers});if(!session?.user.emailVerified)return Response.json({message:'Sign in with the verified invited email.'},{status:403});
 let tokenHash:string;
 try {
  if(invitationCookie(request.headers)){
   const invite=await invitationFromHeaders(request.headers);
   if(!invite||String(invite.email_snapshot).toLowerCase()!==session.user.email.toLowerCase())return Response.json({message:'Open a valid invitation and sign in with its invited email.'},{status:403});
   tokenHash=invite.tokenHash;
  }else{
   const b=await request.json() as any;if(typeof b.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.token))return Response.json({message:'Invitation unavailable.'},{status:422});tokenHash=digest(b.token);
  }
 }catch{return Response.json({message:'Invitation service is temporarily unavailable.'},{status:503});}
 try{
  const result=await client.begin(async tx=>{await tx.unsafe("select set_config('app.user_id',$1,true)",[session.user.id]);const [result]=await tx.unsafe('select capybudget_accept_business_invite($1) as id',[tokenHash]);await tx.unsafe("select set_config('app.workspace_id',$1,true)",[result.id]);const [business]=await tx.unsafe('select owner_user_id from workspaces where id=$1',[result.id]);await tx.unsafe("select set_config('app.user_id',$1,true)",[business.owner_user_id]);await recordAudit(tx,result.id,session.user.id,result.id,'membership','invitation_accepted',{});await tx.unsafe("select set_config('app.user_id',$1,true)",[session.user.id]);return {workspaceId:result.id,userId:session.user.id};});
  // Membership is committed first; repeated acceptance by the same user is safe.
  const needsOnboarding=await invitationNeedsOnboarding(session.user.id);
  if(!needsOnboarding)await clearInvitation(request.headers);
  return Response.json({...result,needsOnboarding},{headers:needsOnboarding?{}:{'Set-Cookie':flowCookie('',0)}});
 }catch{return Response.json({message:'Invitation unavailable. Check your invited email and retry.'},{status:409});}
})
.get('/api/workspaces/:workspaceId/business-audit',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const [m]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[params.workspaceId,actor.id]);if(!['owner','accountant'].includes(m.role))reject('Only owners and accountants can view the audit trail.',403);
 const query=new URL(request.url).searchParams,page=Math.max(1,Math.floor(Number(query.get('page'))||1)),entity=(query.get('entity')??'').slice(0,80);
 const items=await q(tx,'select a.id,a.workspace_id,a.actor_user_id,a.entity_type,a.entity_id,a.action,a.created_at,u.name as actor from audit_logs a left join "user" u on u.id=a.actor_user_id where a.workspace_id=$1 and ($2=\'\' or a.entity_type=$2) order by a.created_at desc,a.id desc limit 100 offset $3',[params.workspaceId,entity,(page-1)*100]);
 if(query.get('format')==='csv')return new Response(['timestamp,actor,entity,entity_id,action',...items.map(r=>[r.created_at,r.actor,r.entity_type,r.entity_id,r.action].map(csvCell).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="capybudget-audit.csv"'}});return {items,page};
}))
.get('/api/workspaces/:workspaceId/business-audit/:id',({request,params})=>scope(request,params.workspaceId,async(tx,actor)=>{
 const [m]=await q(tx,'select role from workspace_memberships where workspace_id=$1 and user_id=$2',[params.workspaceId,actor.id]);if(!['owner','accountant'].includes(m.role))reject('Only owners and accountants can view the audit trail.',403);
 const [row]=await q(tx,'select * from audit_logs where workspace_id=$1 and id=$2',[params.workspaceId,uuid(params.id)]);if(!row)reject('Audit entry not found.',404);
 const clean=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(secret|token|password|email|phone|address|tax.?id|recipient|object.?key|otp|notes|reference)/i.test(key)).map(([k,v])=>[k,clean(v)]));return value;};return {entry:{...row,before:clean(row.before),after:clean(row.after)}};
}));
