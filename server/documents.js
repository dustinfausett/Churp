import {rateLimit} from 'express-rate-limit';
import {documentProof,parseDocument} from '../shared/documents.js';
import {digest,verify} from '../shared/encryption.js';

export function installDocuments({app,db,encryption,encryptionRequired,visibleCircle,joined,groupAdmin,transaction,refresh,testing}) {
  const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const message=id=>{const m=one(`SELECT m.*,COALESCE(kh.public_key,ei.public_key) AS signer_key FROM messages m LEFT JOIN e2ee_identities ei ON ei.user_id=m.encrypted_by LEFT JOIN e2ee_key_history kh ON kh.user_id=m.encrypted_by AND kh.fingerprint=m.signer_fingerprint WHERE m.id=?`,id);return m&&{...m,files:[]};};
  function access(req,write=false){
    const root=message(Number(req.params.id));
    if(!root||root.deleted||!['document','sheet'].includes(root.message_kind))fail(404,'Shared item not found.');
    const g=visibleCircle(req.user.id,root.group_id);
    if(!joined(req.user.id,g.id))fail(403,'Join this Nest to open its shared items.');
    if(encryptionRequired&&!encryption.canRead(req.user.id,root))fail(404,'This shared item is not available to this membership.');
    if(write&&g.admin_only&&!groupAdmin(req.user.id,g))fail(403,'Only admins can edit shared items in this Nest.');
    const state=one('SELECT * FROM shared_documents WHERE message_id=?',root.id)||fail(404,'Shared item not found.');
    return {root,g,state};
  }
  app.get('/api/messages/:id/document/roster',(req,res)=>{const {root}=access(req,true);encryption.device(req);res.json(encryption.editRoster(req,root));});
  app.get('/api/messages/:id/document',(req,res)=>{
    const {root,g,state}=access(req),latest=message(state.latest_id);
    if(encryptionRequired&&!encryption.canRead(req.user.id,latest))fail(404,'This version is not available to this membership.');
    res.json({message:latest,revision:state.revision,can_edit:!g.admin_only||!!groupAdmin(req.user.id,g)});
  });
  app.post('/api/messages/:id/document',rateLimit({windowMs:60000,limit:testing?1000:60,keyGenerator:req=>req.user.id}),async(req,res)=>{
    const {root,g,state}=access(req,true),expectedVersion=req.body.expectedVersion;
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)fail(400,'Choose a valid version.');
    if(req.body.reply_to!==root.id||req.body.files?.length||req.body.urgent)fail(400,'Save shared items without attachments or urgency.');
    if(encryptionRequired&&req.body.body!==undefined)fail(400,'Shared contents must be encrypted on your device.');
    const checked=encryptionRequired?await encryption.validateSend(req,g.id,null,root):null;
    if(checked){try{await verify(encryption.identity(req.user.id).public_key,'document-update',documentProof({id:root.id,expectedVersion,clientId:checked.clientId,cipherHash:await digest(checked.ciphertext)}),req.body.documentSignature);}catch{fail(403,'The shared item signature could not be verified.');}}
    if(checked){const existing=one('SELECT * FROM messages WHERE client_id=?',checked.clientId);if(existing){const saved=one('SELECT * FROM document_revisions WHERE update_id=?',existing.id);if(existing.user_id!==req.user.id||existing.reply_to!==root.id||existing.ciphertext!==checked.ciphertext||saved?.revision!==expectedVersion+1)fail(409,'That update ID is already in use.');return res.status(201).json({revision:saved.revision});}}
    const body=encryptionRequired?'':req.body.body;
    if(!encryptionRequired&&!parseDocument(body,root.message_kind))fail(400,'Add valid shared contents.');
    transaction(()=>{
      const current=access(req,true);if(current.state.revision!==expectedVersion)fail(409,'Someone saved changes while you were editing. Your draft is preserved. Copy it before loading the latest version.');
      if(checked)encryption.assertEditRoster(req,root,checked.rosterHash);
      const id=Number(run(`INSERT INTO messages(group_id,user_id,body,reply_to,message_kind,ciphertext,client_id,encrypted_by,e2ee_version,recipient_hash,signer_fingerprint,self_encrypted) VALUES (?,?,?,?,'document_update',?,?,?,?,?,?,?)`,g.id,req.user.id,body,root.id,checked?.ciphertext??null,checked?.clientId??null,checked?req.user.id:null,checked?1:0,checked?.rosterHash??null,checked?encryption.identity(req.user.id).fingerprint:null,checked?.rs.self_encrypted?1:0).lastInsertRowid);
      if(checked)encryption.recordRecipients(id,checked.rs);
      run('INSERT INTO document_revisions(update_id,document_id,revision) VALUES (?,?,?)',id,root.id,expectedVersion+1);
      run('UPDATE shared_documents SET latest_id=?,revision=revision+1 WHERE message_id=?',id,root.id);
    });refresh(g.community_id);res.status(201).json({revision:expectedVersion+1});
  });
}
