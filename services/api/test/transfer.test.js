import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../src/server.js';
import {reset} from '../src/store.js';
test('selected/all FAQ broadcasts, empty FAQs, transfer and ownership boundaries',async()=>{
 reset();const app=buildServer();const call=async(method,url,payload,token)=>{const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,data:r.json()};};
 try{
 const admin=(await call('POST','/api/auth/bootstrap-admin',{name:'Admin',email:'admin@transfer.test',password:'testpassword123'})).data;
 const one=(await call('POST','/api/sites/register',{name:'One',url:'https://one.test'})).data;
 const two=(await call('POST','/api/sites/register',{name:'Two',url:'https://two.test'})).data;
 const sites=(await call('GET','/api/admin/sites',undefined,admin.token)).data;
 for(const site of sites)await call('PATCH',`/api/admin/sites/${site.id}/status`,{status:'approved'},admin.token);
 assert.deepEqual((await call('GET',`/api/sites/${one.siteKey}/bootstrap`)).data.faqs,[]);
 const content={question:'Shared FAQ?',answer:'Central content'};
 assert.equal((await call('POST','/api/admin/faqs/broadcast',{...content,siteIds:[sites[0].id]},admin.token)).data.count,1);
 assert.equal((await call('GET',`/api/sites/${two.siteKey}/bootstrap`)).data.faqs.length,0);
 assert.equal((await call('POST','/api/admin/faqs/broadcast',content,admin.token)).data.count,2);
 const faqs=(await call('GET',`/api/sites/${one.siteKey}/bootstrap`)).data.faqs;
 assert.equal(faqs.length,2);
 await call('DELETE',`/api/admin/faqs/${faqs[0].id}`,undefined,admin.token);
 assert.equal((await call('GET',`/api/sites/${one.siteKey}/bootstrap`)).data.faqs.length,1);
 const agents=[];
 for(const name of ['First','Second']){await call('POST','/api/admin/agents',{name,email:`${name}@transfer.test`,password:'testpassword123',capacity:1},admin.token);agents.push((await call('POST','/api/auth/login',{email:`${name}@transfer.test`,password:'testpassword123'})).data);}
 const c=(await call('POST','/api/conversations',{siteKey:one.siteKey,text:'Transfer me',requestKey:'transfer-request-key-123456'})).data;
 const path=`/api/conversations/${c.conversationId}`;
 assert.equal((await call('PATCH',path,{assignedAgentId:agents[0].user.id},agents[0].token)).status,200);
 assert.equal((await call('PATCH',path,{assignedAgentId:agents[1].user.id},agents[1].token)).status,409);
 await call('PATCH','/api/agent/availability',{available:false},agents[1].token);
 assert.equal((await call('PATCH',path,{assignedAgentId:agents[1].user.id},agents[0].token)).status,409);
 await call('PATCH','/api/agent/availability',{available:true},agents[1].token);
 assert.equal((await call('PATCH',path,{assignedAgentId:agents[1].user.id},agents[0].token)).status,200);
 assert.equal((await call('POST',path+'/messages',{text:'Old owner reply',requestKey:'old-owner-request-123456'},agents[0].token)).status,409);
 assert.equal((await call('POST',path+'/messages',{text:'New owner reply',requestKey:'new-owner-request-123456'},agents[1].token)).status,200);
 }finally{await app.close();}
});
