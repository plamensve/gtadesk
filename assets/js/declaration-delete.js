import { invoiceKey } from "./invoice-documents.js";

/** A non-destructive estimate for the confirmation dialog. */
export function previewDeclarationDeletion(name,records,deliveryDocuments,invoiceDocuments){
  const rows=records.filter(r=>r.declaration_no===name);
  const ids=new Set(rows.map(r=>r.id));
  const deliveryFiles=deliveryDocuments.filter(d=>d.declaration_no===name || ids.has(d.delivery_id));
  const targetInvoiceKeys=new Set(rows.map(r=>invoiceKey(r.invoice_no,r.invoice_date)).filter(Boolean));
  const externalInvoiceKeys=new Set(records.filter(r=>r.declaration_no!==name)
    .map(r=>invoiceKey(r.invoice_no,r.invoice_date)).filter(Boolean));
  const relatedInvoices=invoiceDocuments.filter(d=>targetInvoiceKeys.has(invoiceKey(d.invoice_no,d.invoice_date)));
  const unsharedInvoices=relatedInvoices.filter(d=>!externalInvoiceKeys.has(invoiceKey(d.invoice_no,d.invoice_date)));
  return {
    deliveries:rows.length,
    deliveryDocuments:deliveryFiles.length,
    invoiceDocumentsToDelete:unsharedInvoices.length,
    sharedInvoiceDocumentsRetained:relatedInvoices.length-unsharedInvoices.length,
    filesToDelete:deliveryFiles.length+unsharedInvoices.length
  };
}

/** The DB deletion RPC commits metadata removals and persistent storage cleanup tasks atomically. */
export async function deleteDeclarationMetadata(client,name){
  if(!String(name??"").trim())throw Error("Избери декларация.");
  const {data,error}=await client.rpc("gta_delete_declaration",{p_declaration_no:name});
  if(error)throw Error(error.message);
  if(!data||data.declaration_no!==name)throw Error("Изтриването не е потвърдено от базата данни.");
  return data;
}

/**
 * Remove physical objects only through Supabase Storage API. A file's
 * persistent cleanup-queue entry is acknowledged after successful removal.
 * On network errors it stays queued and can be retried on next page load.
 */
export async function cleanupDeletedPdfFiles(client,paths=null,bucket="gta-delivery-pdfs",onProgress=()=>{}){
  let pending=paths;
  if(pending===null){
    const {data,error}=await client.from("gta_pdf_cleanup_queue")
      .select("storage_path").order("created_at",{ascending:true}).limit(500);
    if(error)throw Error("Грешка при прочитане на файловете за почистване: "+error.message);
    pending=(data||[]).map(x=>x.storage_path);
  }
  if(!Array.isArray(pending))throw Error("Невалиден списък с файлове за изтриване.");
  const unique=[...new Set(pending.filter(p=>typeof p==="string"&&p.trim()))];
  let cleaned=0,failed=0;
  const errors=[];
  for(let offset=0;offset<unique.length;offset+=50){
    const batch=unique.slice(offset,offset+50);
    try{
      const {error}=await client.storage.from(bucket).remove(batch);
      if(error)throw error;
      const {data:ack,error:dbError}=await client.from("gta_pdf_cleanup_queue")
        .delete().in("storage_path",batch).select("storage_path");
      if(dbError)throw dbError;
      if((ack||[]).length!==batch.length){
        throw Error("Не всички изтрити файлове бяха потвърдени в опашката.");
      }
      cleaned+=batch.length;
    }catch(error){
      failed+=batch.length;
      errors.push(error?.message||String(error));
    }
    onProgress(cleaned,unique.length,failed);
  }
  return {cleaned,failed,errors};
}
