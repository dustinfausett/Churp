import React,{useEffect,useRef,useState} from 'react';
import {Modal} from './components';
import {api,post} from './api';
import {useEncryption} from './encryption/EncryptionGate';
import {decryptMessages,sealMessage,signDocumentUpdate} from './encryption/client';
import {parseDocument,validateDocument} from '../shared/documents';
import {activityArtwork} from './activityArtwork';
import './shared-documents.css';

export function DocumentCard({message,group,onOpen}) {
  const [open,setOpen]=useState(false),value=parseDocument(message.body,message.message_kind);
  if(!value)return <p>This shared item could not be read.</p>;
  return <><button type="button" className="document-card" onClick={()=>onOpen?onOpen(message):setOpen(true)}><img src={activityArtwork[value.kind]} alt=""/><span><strong>{value.title}</strong><small>Shared {value.kind} · Open</small></span></button>{open&&<DocumentEditor message={message} kind={value.kind} group={group} onClose={()=>setOpen(false)}/>}</>;
}
export function DocumentEditor({message,kind,group,onClose,onSaved=async()=>{}}) {
  const {enabled}=useEncryption(),[value,setValue]=useState(()=>({kind,title:'',...(kind==='sheet'?{cells:[['','',''],['','',''],['','','']]}:{text:''})}));
  const [revision,setRevision]=useState(0),[canEdit,setCanEdit]=useState(!message),[loading,setLoading]=useState(!!message),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
  const dirty=useRef(false),saving=useRef(false),prepared=useRef(null),alive=useRef(true);
  async function load(){
    setLoading(true);setError('');
    try{const result=await api(`/messages/${message.id}/document`),m=enabled?(await decryptMessages(group.id,[result.message]))[0]:result.message;
      if(m.decryptionError)throw new Error('This shared item could not be decrypted or verified.');
      const next=parseDocument(m.body,kind);if(!next)throw new Error('This shared item could not be read.');
      if(alive.current){setValue(next);setRevision(result.revision);setCanEdit(result.can_edit);setConflict(false);dirty.current=false;prepared.current=null;}
    }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;if(message)load();return()=>{alive.current=false;};},[message?.id]);
  function change(next){dirty.current=true;prepared.current=null;setNotice('');setValue(next);}
  function close(){if(saving.current)return;if(dirty.current&&!window.confirm('Discard your unsaved changes?'))return;onClose();}
  async function save(event){
    event.preventDefault();if(saving.current||loading||!canEdit)return;saving.current=true;setBusy(true);setError('');setNotice('');
    try {
      const body=JSON.stringify(validateDocument(value,kind));
      if(!prepared.current){
        if(message){const rs=enabled?await api(`/messages/${message.id}/document/roster`):null,request=enabled?await signDocumentUpdate(await sealMessage(group.id,body,[],message.id,null,'document_update',rs),message.id,revision):{body,reply_to:message.id,files:[],expectedVersion:revision};prepared.current=request;}
        else prepared.current={...(enabled?await sealMessage(group.id,body,[],null,null,kind):{body,files:[]}),message_kind:kind};
      }
      const result=await post(message?`/messages/${message.id}/document`:`/groups/${group.id}/messages`,prepared.current);
      dirty.current=false;prepared.current=null;setConflict(false);if(message){setRevision(result.revision);setNotice('Saved.');}else onClose();await onSaved();
    }catch(e){setError(e.message);if(e.status===409){prepared.current=null;setConflict(true);}}finally{saving.current=false;setBusy(false);}
  }
  const disabled=loading||busy||!canEdit;
  const removeRow=index=>{if(window.confirm(`Delete row ${index+1} and all its contents?`))change({...value,cells:value.cells.filter((_,i)=>i!==index)});};
  const removeColumn=index=>{if(window.confirm(`Delete column ${index+1} and all its contents?`))change({...value,cells:value.cells.map(row=>row.filter((_,i)=>i!==index))});};
  return <Modal title={`${message?'Shared':'New'} ${kind}`} onClose={close} wide><form className="shared-editor" onSubmit={save}>
    <p className="small-text muted">Members with access to this Nest’s shared item can edit it, subject to Nest posting permissions. Save to share your changes.</p>
    {loading&&<p role="status">Opening…</p>}{error&&<p role="alert" className="error-banner">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {conflict&&<button type="button" className="button secondary" onClick={()=>{if(window.confirm('Replace your draft with the latest saved version? Copy any changes you want to keep first.'))load();}}>Load latest version</button>}
    <fieldset disabled={disabled}><label>Title<input required maxLength={120} value={value.title} onChange={e=>change({...value,title:e.target.value})}/></label>
    {kind==='document'?<label>Document<textarea className="document-text" rows={16} maxLength={8000} value={value.text} onChange={e=>change({...value,text:e.target.value})}/></label>:<div className="sheet-scroll"><table className="shared-sheet"><caption className="visually-hidden">Shared sheet</caption><thead><tr><th scope="col">Row</th>{value.cells[0].map((_,col)=><th scope="col" key={col}>{col+1} <button type="button" aria-label={`Delete column ${col+1}`} disabled={value.cells[0].length===1} onClick={()=>removeColumn(col)}>×</button></th>)}<th><button type="button" aria-label="Add column" disabled={value.cells[0].length>=20} onClick={()=>change({...value,cells:value.cells.map(row=>[...row,''])})}>+</button></th></tr></thead><tbody>{value.cells.map((row,i)=><tr key={i}><th scope="row">{i+1} <button type="button" aria-label={`Delete row ${i+1}`} disabled={value.cells.length===1} onClick={()=>removeRow(i)}>×</button></th>{row.map((cell,j)=><td key={j}><input aria-label={`Row ${i+1}, column ${j+1}`} maxLength={500} value={cell} onChange={e=>change({...value,cells:value.cells.map((r,ri)=>ri===i?r.map((c,ci)=>ci===j?e.target.value:c):r)})}/></td>)}</tr>)}</tbody></table><button className="button secondary" type="button" aria-label="Add row" disabled={value.cells.length>=50} onClick={()=>change({...value,cells:[...value.cells,Array(value.cells[0].length).fill('')]})}>+ Add row</button></div>}</fieldset>
    <div className="calendar-actions">{canEdit&&<button className="button primary" disabled={disabled||conflict}>{busy?'Saving…':message?'Save changes':`Share ${kind}`}</button>}<button className="button secondary" type="button" disabled={busy} onClick={close}>Close</button></div>
  </form></Modal>;
}
