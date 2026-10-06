import {infrastructureReadiness} from '../src/operations/readiness';
import {client} from '../src/db';
try{const result=await infrastructureReadiness();console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;}
finally{await client.end();}
