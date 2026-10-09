import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../src/server.js';
import {reset,read} from '../src/store.js';
import {migrateInstallCredentials,matchesInstallToken} from '../src/install-credentials.js';

test('legacy installation credentials migrate without invalidating existing installations',()=>{
 const data={sites:[{id:'existing',status:'approved',installToken:'legacy-secret'}]};
 assert.equal(migrateInstallCredentials(data),true);
 assert.equal(data.sites[0].installToken,undefined);
 assert.equal(data.sites[0].status,'approved');
 assert.equal(matchesInstallToken(data.sites[0],'legacy-secret'),true);
 assert.equal(matchesInstallToken(data.sites[0],'wrong'),false);
 assert.equal(matchesInstallToken(data.sites[0],undefined),false);
 assert.equal(migrateInstallCredentials(data),false);
});

test('installation recovery rotates credentials, preserves site content and never exposes stored hashes',async()=>{
 reset();const app=buildServer();
 const call=async(method,url,payload,headers={})=>{const r=await app.inject({method,url,payload,headers});return {status:r.statusCode,data:r.json(),headers:r.headers};};
 try{
 const admin=(await call('POST','/api/auth/bootstrap-admin',{name:'Admin',email:'admin@recovery.test',password:'password12345'})).data;
 const auth={authorization:`Bearer ${admin.token}`};
 const reg=(await call('POST','/api/sites/register',{name:'Recoverable',url:'https://recover.test'})).data;
 const site=read().sites[0];assert.equal(site.installToken,undefined);assert.ok(site.installTokenHash);
 const path=`/api/admin/sites/${site.id}/install-credentials`;
 assert.equal((await call('POST',path,{reason:'Lost credentials'})).status,401);
 assert.equal((await call('POST',path,{reason:' '},auth)).status,400);
 await call('POST',`/api/sites/${reg.siteKey}/faqs`,{installToken:reg.installToken,question:'Existing FAQ?',answer:'Preserve me'});
 const rotated=await call('POST',path,{reason:'Lost setup session'},auth);
 assert.equal(rotated.headers['cache-control'],'no-store');
 const replacement=rotated.data;
 assert.equal(replacement.siteKey,reg.siteKey);assert.notEqual(replacement.installToken,reg.installToken);
 const setup=`/api/sites/${reg.siteKey}/setup`;
 assert.equal((await call('GET',setup,undefined,{'x-install-token':reg.installToken})).status,401);
 assert.equal((await call('POST',`/api/sites/${reg.siteKey}/faqs`,{installToken:reg.installToken,question:'Forbidden?',answer:'Old token'})).status,401);
 const restored=(await call('GET',setup,undefined,{'x-install-token':replacement.installToken})).data;
 assert.equal(restored.faqs[0].answer,'Preserve me');assert.equal(restored.status,'pending');
 for(const data of [restored,(await call('GET','/api/admin/sites',undefined,auth)).data,(await call('GET',`/api/sites/${reg.siteKey}/bootstrap`)).data,(await call('GET','/api/admin/audit',undefined,auth)).data]){
 const json=JSON.stringify(data);assert.equal(json.includes(replacement.installToken),false);assert.equal(json.includes(read().sites[0].installTokenHash),false);
 }
 const audit=(await call('GET','/api/admin/audit',undefined,auth)).data.find(a=>a.action==='site.install_credentials.rotate');assert.equal(audit.meta.reason,'Lost setup session');
 await call('POST','/api/admin/agents',{name:'Agent',email:'agent@recovery.test',password:'password12345'},auth);
 const agent=(await call('POST','/api/auth/login',{email:'agent@recovery.test',password:'password12345'})).data;
 assert.equal((await call('POST',path,{reason:'Not allowed'},{authorization:`Bearer ${agent.token}`})).status,403);
 }finally{await app.close();}
});
