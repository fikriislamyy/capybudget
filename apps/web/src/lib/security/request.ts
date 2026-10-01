export async function securityRequest(path:string,body?:unknown,method='POST',grant?:string) {
  const response=await fetch('/api/security/'+path,{method,headers:{'Content-Type':'application/json',...(grant?{'x-security-grant':grant}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.message??'Security request failed.');
  return data;
}
