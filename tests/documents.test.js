import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import * as enc from '../shared/encryption.js';
import {documentProof,parseDocument,validateDocument} from '../shared/documents.js';
import {extractLinks} from '../shared/links.js';
test('encrypted shared documents enforce audience, collaboration, conflicts and deletion',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'churp-assignments-'));
  let runtime=createApp({dataDir:dir,testing:true,googleClientId:'',pushEnabled:false});
  const server=createServer((req,res)=>runtime.app(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api`;
  t.after(async()=>{runtime.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  async function req(path,a,method='GET',body){const r=await fetch(base+path,{method,headers:{...(a?{cookie:a.cookie,'x-churp-device':a.deviceId}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  async function ok(...args){const r=await req(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
  async function actor(name){const r=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({birth_date:'1990-01-01',username:name,name,password:'Assignments fixture password!'})});const a={...(await r.json()).user,cookie:r.headers.get('set-cookie').split(';')[0],deviceId:randomUUID()};const k=await ok('/e2ee/managed-device',a,'POST',{deviceId:a.deviceId,deviceName:'Assignments fixture'});a.privateKey=await enc.readPrivate(k.privateKey);return a;}
  const owner=await actor('assign_owner'),member=await actor('assign_member'),other=await actor('assign_other'),outsider=await actor('assign_outsider');
  const tree=(await ok('/communities',owner,'POST',{name:'Party Tree'})).community,invite=(await ok('/invitations',owner,'POST',{community_id:tree.id})).path.split('invite=')[1];
  for(const a of [member,other])await ok('/invitations/accept',a,'POST',{token:invite});
  const nest=(await ok(`/communities/${tree.id}/circles`,owner,'POST',{name:'Party Nest',admin_only:false})).group;for(const a of [member,other])await ok(`/groups/${nest.id}/join`,a,'POST');
  async function seal(a,body,kind,replyTo=null,rs=null){rs ||= await ok(`/groups/${nest.id}/e2ee/roster`,a);const clientId=randomUUID(),ciphertext=await enc.seal(a.privateKey,rs.readers.map(r=>r.public_key),{version:1,kind:'nest-message',groupId:nest.id,clientId,senderId:a.id,signerId:a.id,rosterHash:rs.roster_hash,replyTo,migrated:false,selfEncrypted:rs.self_encrypted,contentType:kind,body,attachments:[]});const payload=enc.sendPayload({groupId:nest.id,clientId,rosterHash:rs.roster_hash,cipherHash:await enc.digest(ciphertext),files:[],replyTo});return {ciphertext,clientId,rosterHash:rs.roster_hash,files:[],reply_to:replyTo,signature:await enc.sign(a.privateKey,'send',payload)};}

  const initial={kind:'document',title:'Trip plan',text:'Meet at noon'},created={...await seal(owner,JSON.stringify(initial),'document'),message_kind:'document'};
  const id=(await ok(`/groups/${nest.id}/messages`,owner,'POST',created)).id;
  assert.equal((await ok(`/messages/${id}/document`,member)).revision,0);
  assert.equal((await req(`/messages/${id}/document`,outsider)).status,403);
  async function update(a,text,version=0){const rs=await ok(`/messages/${id}/document/roster`,a),request=await seal(a,JSON.stringify({...initial,text}),'document_update',id,rs);return {...request,expectedVersion:version,documentSignature:await enc.sign(a.privateKey,'document-update',documentProof({id,expectedVersion:version,clientId:request.clientId,cipherHash:await enc.digest(request.ciphertext)}))};}
  const a=await update(member,'Bring lunch'),b=await update(other,'Bring dinner');
  assert.equal((await req(`/messages/${id}/document`,member,'POST',{...a,expectedVersion:1})).status,403);
  await ok(`/messages/${id}/document`,member,'POST',a);
  assert.equal((await ok(`/messages/${id}/document`,member,'POST',a)).revision,1);
  assert.equal((await req(`/messages/${id}/document`,other,'POST',b)).status,409);
  const saved=await ok(`/messages/${id}/document`,owner),opened=await enc.open(owner.privateKey,saved.message.signer_key,saved.message.ciphertext);
  assert.equal(JSON.parse(opened.body).text,'Bring lunch');assert.equal(saved.message.body,'');
  assert.equal((await ok(`/groups/${nest.id}/messages`,owner)).messages.some(m=>m.message_kind==='document_update'),false);
  assert.equal((await req(`/messages/${saved.message.id}`,member,'DELETE')).status,400);
  const late=await actor('document_late');await ok('/invitations/accept',late,'POST',{token:invite});await ok(`/groups/${nest.id}/join`,late,'POST');
  assert.equal((await req(`/messages/${id}/document`,late)).status,404);
  await ok(`/groups/${nest.id}`,owner,'PATCH',{admin_only:true});
  assert.equal((await req(`/messages/${id}/document`,member,'POST',b)).status,403);
  assert.equal((await ok(`/messages/${id}/document`,member)).can_edit,false);
  await ok(`/me`,owner,'PATCH',{pet_animations:false});assert.equal((await ok('/me',owner)).user.pet_animations,false);
  await ok('/me',owner,'PATCH',{name:'Still owner'});assert.equal((await ok('/me',owner)).user.pet_animations,false);
  assert.equal((await req('/me',owner,'PATCH',{pet_animations:'no'})).status,400);
  const linkMessage={...await seal(owner,'Read https://example.org/plan','chat'),message_kind:'chat'};
  const linkId=(await ok(`/groups/${nest.id}/messages`,owner,'POST',linkMessage)).id;
  assert.ok((await ok(`/groups/${nest.id}/shared`,owner)).messages.some(m=>m.id===linkId));
  await ok(`/messages/${id}`,owner,'DELETE');assert.equal((await req(`/messages/${id}/document`,member)).status,404);
  assert.equal(runtime.db.prepare('SELECT ciphertext FROM messages WHERE id=?').get(saved.message.id).ciphertext,null);
});
test('document and sheet limits and safe link collection',()=>{
  assert.deepEqual(extractLinks('https://example.org/a. (https://example.org/b) https://example.org/a javascript:alert(1) https://user:pass@example.org/'),['https://example.org/a','https://example.org/b']);
  assert.equal(parseDocument('{bad','sheet'),null);
  assert.throws(()=>validateDocument({kind:'sheet',title:'Test',cells:[['a'],['b','c']]}));
  assert.throws(()=>validateDocument({kind:'document',title:'Test',text:'a'.repeat(8001)}));
  assert.ok(parseDocument(JSON.stringify({kind:'sheet',title:'Test',cells:[['Name','Count'],['Food','3']]}),'sheet'));
});
