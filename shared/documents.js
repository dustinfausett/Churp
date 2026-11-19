export function validateDocument(value, kind=value?.kind) {
  if(!value || !['document','sheet'].includes(kind) || value.kind!==kind || typeof value.title!=='string' || !value.title.trim() || value.title.length>120)throw new Error('Add a title of up to 120 characters.');
  const result={kind,title:value.title.trim()};
  if(kind==='document') {
    if(typeof value.text!=='string' || value.text.length>8000)throw new Error('Documents can contain up to 8,000 characters.');
    result.text=value.text;
  } else {
    if(!Array.isArray(value.cells)||value.cells.length<1||value.cells.length>50||!Array.isArray(value.cells[0])||value.cells[0].length<1||value.cells[0].length>20||value.cells.some(row=>!Array.isArray(row)||row.length!==value.cells[0].length||row.some(cell=>typeof cell!=='string'||cell.length>500)))throw new Error('Use 1–50 rows, 1–20 columns, and up to 500 characters per cell.');
    result.cells=value.cells.map(row=>[...row]);
  }
  if(JSON.stringify(result).length>9500)throw new Error('This shared item is full. Shorten its contents before saving.');
  return result;
}
export function parseDocument(body,kind) {try{return validateDocument(JSON.parse(body),kind);}catch{return null;}}
export const documentProof=({id,expectedVersion,clientId,cipherHash})=>({id,expectedVersion,clientId,cipherHash});
