// Extract only navigable web links, locally after message decryption.
export function extractLinks(text) {
  const links=[];
  for(const match of String(text||'').matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let value=match[0].replace(/[.,!?;:]+$/,'');
    while(value.endsWith(')') && (value.match(/\)/g)||[]).length>(value.match(/\(/g)||[]).length)value=value.slice(0,-1);
    try {const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!links.includes(url.href))links.push(url.href);} catch {}
  }
  return links;
}
