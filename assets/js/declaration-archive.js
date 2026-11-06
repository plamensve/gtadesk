import { documentsForInvoice } from "./invoice-documents.js";

export function sortDeliveryRows(a,b){
  // Known invoice dates first (newest first), then creation order (newest first).
  const da=a.invoice_date||"",db=b.invoice_date||"";
  if(da!==db)return !da?1:!db?-1:db.localeCompare(da);
  const ca=a.created_at||"",cb=b.created_at||"";
  return cb.localeCompare(ca)||String(b.id||"").localeCompare(String(a.id||""));
}

function safeSegment(raw){
  const text=String(raw||"").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_")
    .replace(/\.\./g,"_").replace(/^\.+|\.+$/g,"").trim().slice(0,150);
  return text&&text!=="."&&text!==".." ? text:"Документ";
}

function uniqueFilename(name,used){
  const safe=safeSegment(name);
  let result=safe,idx=2;
  const dot=safe.lastIndexOf(".");
  const stem=dot>0?safe.slice(0,dot):safe,ext=dot>0?safe.slice(dot):"";
  while(used.has(result.toLowerCase()))result=stem+" ("+(idx++)+")"+ext;
  used.add(result.toLowerCase());
  return result;
}

/**
 * A declaration archive contains one root and one folder for every ARK.
 * Shared invoice PDFs are copied into each ARK folder referencing that
 * invoice. All metadata and file contents remain in private Supabase Storage.
 */
export function planDeclarationArchive(declarationNo,records,deliveryDocs,invoiceDocs){
  const rows=records.filter(r=>r.declaration_no===declarationNo).sort(sortDeliveryRows);
  if(!declarationNo||!rows.length)throw new Error("Няма доставки към избраната декларация.");
  const root="Декларация "+safeSegment(declarationNo);
  const dirs=[root+"/",root+"/Придружаващи документи/",root+"/Анализ/"];
  const entries=[],usedNames=new Map(),usedFolders=new Set();
  const usedFor=dir=>{
    if(!usedNames.has(dir))usedNames.set(dir,new Set());
    return usedNames.get(dir);
  };
  const add=(folder,doc)=>{
    const name=uniqueFilename(doc.filename||"Документ.pdf",usedFor(folder));
    entries.push({path:folder+"/"+name,doc});
  };
  const declarationFiles=deliveryDocs.filter(d=>d.declaration_no===declarationNo&&!d.delivery_id);
  for(const doc of declarationFiles){
    add(root+"/"+(doc.document_kind==="analysis"?"Анализ":"Придружаващи документи"),doc);
  }
  for(const row of rows){
    const base=safeSegment(row.ark||"Без АРК");
    let folderName=base,counter=2;
    while(usedFolders.has(folderName.toLowerCase()))folderName=base+" ("+(counter++)+")";
    usedFolders.add(folderName.toLowerCase());
    const folder=root+"/"+folderName;
    dirs.push(folder+"/");
    const own=deliveryDocs.filter(d=>d.delivery_id===row.id);
    for(const doc of own)add(folder,doc);
    for(const doc of documentsForInvoice(invoiceDocs,row))add(folder,doc);
  }
  return {root,dirs,entries,deliveryCount:rows.length};
}

export async function createDeclarationZip(plan,download,Zip,onProgress=()=>{}){
  if(!Zip)throw new Error("Библиотеката за ZIP архив не е заредена.");
  const zip=new Zip();
  for(const dir of plan.dirs)zip.folder(dir);
  let i=0;
  for(const {path,doc} of plan.entries){
    try{
      const blob=await download(doc);
      if(!blob)throw Error("Празен резултат от хранилището.");
      zip.file(path,blob);
      onProgress(++i,plan.entries.length);
    }catch(error){
      throw new Error("Неуспешно изтегляне на „"+doc.filename+"“: "+(error?.message||String(error)));
    }
  }
  const archive=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
  return archive;
}
export const declarationZipFileName=no=>"Декларация "+safeSegment(no)+".zip";
