/**
 * One customs package contains declaration-wide attachments first, followed
 * by all attachments of selected deliveries belonging to that declaration.
 * These functions are independent of Supabase and can be tested in Node.
 */
const chronological=(a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))||String(a.filename||"").localeCompare(String(b.filename||""));
export function prepareCustomsBundle(records,documents,selectedIds){
  const rows=records.filter(row=>selectedIds.has(row.id));
  if(!rows.length)throw new Error("Маркирай поне една доставка от таблицата.");
  const declarationNo=rows[0].declaration_no;
  if(rows.some(row=>row.declaration_no!==declarationNo))throw new Error("Избраните доставки трябва да са от една декларация.");
  const declDocs=documents.filter(d=>d.declaration_no===declarationNo&&d.delivery_id==null).sort(chronological);
  const rowDocs=rows.flatMap(row=>documents.filter(d=>d.delivery_id===row.id).sort(chronological));
  const rowsWithoutDocuments=rows.filter(row=>!documents.some(d=>d.delivery_id===row.id)).length;
  return {declarationNo,documents:[...declDocs,...rowDocs],rowsWithoutDocuments,selectedCount:rows.length,declarationDocumentCount:declDocs.length,rowDocumentCount:rowDocs.length};
}
export async function mergeCustomsPdfs(documents,downloadPdf,PDFDocument,onProgress=()=>{}){
  if(!documents.length)throw new Error("Няма PDF документи за обединяване.");
  const combined=await PDFDocument.create();
  let progress=0;
  for(const doc of documents){
    try{
      const file=await downloadPdf(doc);
      if(!file)throw new Error("Файлът не може да бъде изтеглен.");
      const pdf=await PDFDocument.load(await file.arrayBuffer());
      const pages=await combined.copyPages(pdf,pdf.getPageIndices());
      if(!pages.length)throw new Error("Документът няма страници.");
      for(const page of pages)combined.addPage(page);
      progress++;
      onProgress(progress,documents.length);
    }catch(error){
      throw new Error("Проблем с „"+doc.filename+"“: "+(error?.message||String(error)));
    }
  }
  return combined.save();
}
export function customsPdfFileName(declarationNo){
  const normalized=String(declarationNo).replace(/[^\p{L}\p{N}_-]+/gu,"_").slice(0,80)||"bez_nomer";
  return "Украинска_митница_декларация_"+normalized+".pdf";
}
