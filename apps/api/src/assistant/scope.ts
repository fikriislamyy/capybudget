import type { TransactionSql } from 'postgres';
import { auth } from '../auth';
import { client } from '../db';

const q=(tx:TransactionSql,statement:string,values:unknown[]=[])=>(tx.unsafe(statement,values as never[]));

function reject(status:number,code:string,message:string):never{
  throw Object.assign(new Error(message),{status,code});
}

function failure(status:number,code:string,message:string){
  return Response.json({code,message},{status,headers:{'Cache-Control':'no-store'}});
}

function mapScopeError(error:unknown){
  const issue=error as Error&{status?:number;code?:string};
  if(issue.status)return failure(issue.status,issue.code??'REQUEST_FAILED',issue.message);
  if(['23503','23505','23514','22P02'].includes(issue.code??''))return failure(409,'DATA_CONFLICT','The request conflicts with current finance data.');
  console.error('Assistant request failed',{sqlState:issue.code??'unknown'});
  return failure(500,'INTERNAL_ERROR','The assistant request could not be completed.');
}

/** Resolve verified identity and workspace membership before any assistant data access. */
export async function withAssistantScope<T>(
  request:Request,
  workspaceId:string,
  run:(tx:TransactionSql,user:{id:string;email:string},workspace:{currency:string;timezone:string;kind:string})=>Promise<T>
):Promise<T|Response>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId))return failure(400,'INVALID_WORKSPACE_ID','Workspace ID is invalid.');
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return failure(401,'AUTH_REQUIRED','Sign in to continue.');
  if(!session.user.emailVerified)return failure(403,'EMAIL_VERIFICATION_REQUIRED','Verify your email to continue.');
  for(let attempt=0;attempt<3;attempt++){
    try{
      return await client.begin(async tx=>{
        await q(tx,'set transaction isolation level repeatable read');
        await q(tx,"select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",[session.user.id,workspaceId]);
        const [workspace]=await q(tx,'select w.currency,w.timezone,w.kind from workspaces w join workspace_memberships m on m.workspace_id=w.id and m.user_id=$2 where w.id=$1 and w.archived_at is null',[workspaceId,session.user.id]);
        if(!workspace)reject(404,'WORKSPACE_NOT_FOUND','Workspace not found.');
        return run(tx,{id:session.user.id,email:session.user.email},workspace as unknown as {currency:string;timezone:string;kind:string});
      }) as T|Response;
    }catch(error){
      const code=(error as {code?:string}).code;
      if(['40001','23505'].includes(code??'')&&attempt<2)continue;
      return mapScopeError(error);
    }
  }
  return failure(409,'CONCURRENT_UPDATE','The data changed during this request. Retry using the same request key.');
}
