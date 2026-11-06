/** Helpers for secured document operations on the private GTA Desk PDF bucket. */
export async function fetchDeliveryPdf(client,doc,bucket="gta-delivery-pdfs"){
  if(!doc?.storage_path)throw new Error("Невалиден PDF документ.");
  const {data,error}=await client.storage.from(bucket).download(doc.storage_path);
  if(error)throw new Error(error.message);
  if(!data)throw new Error("Файлът не може да бъде изтеглен.");
  return data;
}

/**
 * Remove from private Storage before deleting metadata. If the metadata
 * removal fails, it can be retried; a stale UI entry is preferable to an
 * orphaned private blob that can no longer be located from the register.
 */
export async function removeDeliveryPdf(client,doc,bucket="gta-delivery-pdfs",table="gta_delivery_documents"){
  if(!doc?.id||!doc?.storage_path)throw new Error("Липсва идентификатор на документа.");
  const {error:storageError}=await client.storage.from(bucket).remove([doc.storage_path]);
  if(storageError)throw new Error("Файлът не беше изтрит: "+storageError.message);
  const {data,error:metadataError}=await client.from(table).delete().eq("id",doc.id).select("id").single();
  if(metadataError)throw new Error("Файлът е премахнат от хранилището, но записът остава. Повтори изтриването: "+metadataError.message);
  if(!data?.id)throw new Error("Записът на документа не беше потвърден като изтрит. Опитай отново.");
  return data.id;
}
