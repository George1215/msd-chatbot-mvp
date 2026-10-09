import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
const base='http://localhost:4300';
const request=async(path,method='GET',body,token)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
const login=async(email,password)=>request('/api/auth/login','POST',{email,password});
const admin=await login('admin@msd.local','LocalDemo!2026'),agent=await login('agent@msd.local','LocalAgent!2026');
const site=(await request('/api/admin/sites','GET',undefined,admin.token)).find(s=>s.status==='approved');
const c=await request('/api/conversations','POST',{siteKey:site.siteKey,text:'Socket isolation test',requestKey:crypto.randomUUID()});
const sockets=[];
const connect=auth=>{const socket=io(base,{auth,forceNew:true,reconnection:false});sockets.push(socket);return socket;};
const once=(s,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`Timed out waiting for ${event}`)),5000);s.once(event,data=>{clearTimeout(timer);resolve(data);});});
try{
 const forged=connect({role:'agent'});await once(forged,'connect_error');
 const visitor=connect({siteKey:site.siteKey,...c});await once(visitor,'connect');
 const stranger=connect({siteKey:site.siteKey});await once(stranger,'connect');
 let leaked=false;stranger.on('message:new',()=>{leaked=true;});stranger.emit('conversation:join',c.conversationId);
 await request(`/api/conversations/${c.conversationId}`,'PATCH',{assignedAgentId:agent.user.id},agent.token);
 const delivered=once(visitor,'message:new');await request(`/api/conversations/${c.conversationId}/messages`,'POST',{text:'Authorized real-time reply',requestKey:crypto.randomUUID()},agent.token);assert.equal((await delivered).text,'Authorized real-time reply');
 await new Promise(r=>setTimeout(r,250));assert.equal(leaked,false);
 const intruder=connect({siteKey:site.siteKey,conversationId:c.conversationId,visitorToken:'wrong'});await once(intruder,'connect_error');
 await request(`/api/conversations/${c.conversationId}`,'PATCH',{status:'closed'},agent.token);
 console.log('Socket authorization, room isolation and real-time delivery passed.');
}finally{sockets.forEach(s=>s.disconnect());}
