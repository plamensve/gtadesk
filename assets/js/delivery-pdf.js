import { formatDateDMY } from "./date-format.js";
import { invoiceKey, documentsForInvoice, invoiceDisplay } from "./invoice-documents.js";

/**
 * Ukrainian customs PDF package.
 * The declaration's attachments come first, followed by one readable GTA Desk
 * delivery-summary page for each selected row and that row's uploaded PDFs.
 * Everything is assembled locally in the browser; no document is sent elsewhere.
 */
const chronological=(a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))||String(a.filename||"").localeCompare(String(b.filename||""));
const display=value=>value===null||value===undefined||String(value).trim()===""?"—":String(value);
const dateLabel=date=>/^\d{4}-\d{2}-\d{2}/.test(String(date??""))?formatDateDMY(date):display(date);
const litersLabel=value=>value===null||value===undefined||value===""?"—":new Intl.NumberFormat("bg-BG",{maximumFractionDigits:3}).format(Number(value));
const statusLabel=row=>({used:"Използван",unused:"Неизползван",shared:"Общ"})[row.usage_status||(row.is_used?"used":"unused")]||"Неизползван";

export function prepareCustomsBundle(records,documents,selectedIds,invoiceDocuments=[]){
  const rows=records.filter(row=>selectedIds.has(row.id));
  if(!rows.length)throw new Error("Маркирай поне една доставка от таблицата.");
  const declarationNos=[...new Set(rows.map(row=>row.declaration_no).filter(Boolean))];
  if(declarationNos.length!==1||rows.some(row=>row.declaration_no!==declarationNos[0])){
    throw new Error("Избраните доставки трябва да са от една декларация.");
  }
  const declarationNo=declarationNos[0];
  // Declaration-wide PDFs are included once per selected declaration,
  // regardless of invoice number or the original order of checkboxes.
  const declarationDocuments=documents.filter(d=>declarationNos.includes(d.declaration_no)&&d.delivery_id==null).sort((a,b)=>
    declarationNos.indexOf(a.declaration_no)-declarationNos.indexOf(b.declaration_no)||chronological(a,b));
  const rowDocumentsById=new Map(rows.map(row=>[row.id,documents.filter(d=>d.delivery_id===row.id).sort(chronological)]));
  const rowDocuments=rows.flatMap(row=>rowDocumentsById.get(row.id));
  const seenInvoiceKeys=new Set();
  const invoiceDocumentsByRowId=new Map();
  const uniqueInvoiceDocuments=[];
  for(const row of rows){
    const key=invoiceKey(row.invoice_no,row.invoice_date);
    const matched=key&&!seenInvoiceKeys.has(key)?documentsForInvoice(invoiceDocuments,row).sort(chronological):[];
    if(key)seenInvoiceKeys.add(key);
    invoiceDocumentsByRowId.set(row.id,matched);
    uniqueInvoiceDocuments.push(...matched);
  }
  const rowsWithoutDocuments=rows.filter(row=>!rowDocumentsById.get(row.id).length&&!documentsForInvoice(invoiceDocuments,row).length).length;
  return {
    declarationNo,declarationNos,rows,declarationDocuments,rowDocumentsById,invoiceDocumentsByRowId,
    documents:[...declarationDocuments,...rowDocuments,...uniqueInvoiceDocuments],rowsWithoutDocuments,
    selectedCount:rows.length,declarationDocumentCount:declarationDocuments.length,
    rowDocumentCount:rowDocuments.length
  };
}

function wrapText(ctx,value,maxWidth,maxLines=2){
  const words=display(value).split(/\s+/u);
  const lines=[];
  let current="";
  for(const word of words){
    if(!word)continue;
    const candidate=current?current+" "+word:word;
    if(ctx.measureText(candidate).width<=maxWidth){current=candidate;continue;}
    if(current){lines.push(current);current="";}
    for(const letter of word){
      if(ctx.measureText(current+letter).width>maxWidth&&current){lines.push(current);current="";}
      current+=letter;
    }
  }
  if(current)lines.push(current);
  if(lines.length>maxLines){
    const result=lines.slice(0,maxLines);
    let last=result[maxLines-1];
    while(last&&ctx.measureText(last+"…").width>maxWidth)last=last.slice(0,-1);
    result[maxLines-1]=last+"…";
    return result;
  }
  return lines;
}

/** Renders Bulgarian text using installed browser fonts, avoiding PDF base-font Cyrillic limitations. */
export function renderDeliveryCoverPng(row,{index=1,total=1,declarationNo=row.declaration_no}={},createCanvas=()=>document.createElement("canvas")){
  const canvas=createCanvas();canvas.width=1190;canvas.height=1684;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Браузърът не поддържа създаване на PDF страница.");
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#10384e";ctx.fillRect(0,0,W,16);
  ctx.fillStyle="#0793a3";ctx.fillRect(0,16,W,7);
  ctx.textBaseline="alphabetic";

  ctx.fillStyle="#0c7284";ctx.font="bold 24px Arial, sans-serif";
  ctx.fillText("GTA DESK  /  ДОСТАВКИ И ДЕКЛАРАЦИИ",80,103);
  ctx.fillStyle="#12384f";ctx.font="bold 49px Arial, sans-serif";
  ctx.fillText("ИНФОРМАЦИЯ ЗА ДОСТАВКА",80,196);
  ctx.fillStyle="#608093";ctx.font="25px Arial, sans-serif";
  ctx.fillText("Декларация № "+display(declarationNo)+"  •  Избран ред "+index+" от "+total,80,251);
  ctx.fillStyle="#d7eaf0";ctx.fillRect(80,286,W-160,2);

  function drawField(label,value,x,y,width){
    ctx.fillStyle="#eaf5f7";ctx.fillRect(x,y,width,117);
    ctx.fillStyle="#55768b";ctx.font="bold 20px Arial, sans-serif";
    ctx.fillText(label.toUpperCase(),x+20,y+32);
    ctx.fillStyle="#10384e";ctx.font="bold 28px Arial, sans-serif";
    const lines=wrapText(ctx,value,width-40,2);
    lines.forEach((line,i)=>ctx.fillText(line,x+20,y+74+i*31));
  }
  const left=80,right=610,width=500;
  const rows=[
    [["Дата на доставка",dateLabel(row.delivered_on)],["Номер на декларация",display(row.declaration_no)]],
    [["АРК номер",display(row.ark)],["Фактура № / Дата",invoiceDisplay(row)]],
    [["Количество (литри)",litersLabel(row.quantity_liters)+" л"],["Статус",statusLabel(row)]],
    [["Влекач",display(row.tractor)],["Цистерна",display(row.tanker)]],
    [["Място на произход",display(row.counterparty)],["Място / направление",display(row.destination)]]
  ];
  rows.forEach((items,i)=>{
    const y=333+i*146;
    drawField(items[0][0],items[0][1],left,y,width);
    drawField(items[1][0],items[1][1],right,y,width);
  });
  const notesY=1085;
  ctx.fillStyle="#eaf5f7";ctx.fillRect(80,notesY,W-160,305);
  ctx.fillStyle="#55768b";ctx.font="bold 20px Arial, sans-serif";ctx.fillText("БЕЛЕЖКА",101,notesY+38);
  ctx.fillStyle="#10384e";ctx.font="25px Arial, sans-serif";
  const lines=wrapText(ctx,row.notes,W-205,8);
  lines.forEach((line,i)=>ctx.fillText(line,101,notesY+86+i*31));
  ctx.fillStyle="#d7eaf0";ctx.fillRect(80,1540,W-160,2);
  ctx.fillStyle="#55768b";ctx.font="21px Arial, sans-serif";
  ctx.fillText("Информация от електронния регистър GTA Desk",80,1583);
  ctx.fillText("Придружаващите PDF файлове следват тази страница, ако са налични.",80,1619);
  return canvas.toDataURL("image/png");
}

/**
 * An empty attachment list is valid: selected delivery details still produce
 * downloadable PDF pages. Each row's uploaded PDFs follow its detail page.
 */
export async function mergeCustomsPdfs(bundle,downloadPdf,PDFDocument,onProgress=()=>{},renderRowPage=renderDeliveryCoverPng){
  if(!bundle.rows?.length)throw new Error("Няма избрани доставки.");
  const combined=await PDFDocument.create();
  const total=bundle.rows.length+bundle.documents.length;
  let done=0;
  async function appendDocument(doc){
    try{
      const file=await downloadPdf(doc);
      if(!file)throw new Error("Файлът не може да бъде изтеглен.");
      const pdf=await PDFDocument.load(await file.arrayBuffer());
      const pages=await combined.copyPages(pdf,pdf.getPageIndices());
      if(!pages.length)throw new Error("Документът няма страници.");
      for(const page of pages)combined.addPage(page);
      onProgress(++done,total);
    }catch(error){
      throw new Error("Проблем с „"+doc.filename+"“: "+(error?.message||String(error)));
    }
  }
  for(const doc of bundle.declarationDocuments)await appendDocument(doc);
  for(const [index,row] of bundle.rows.entries()){
    try{
      const png=await renderRowPage(row,{index:index+1,total:bundle.rows.length,declarationNo:row.declaration_no});
      const image=await combined.embedPng(png);
      const page=combined.addPage([595.28,841.89]); // A4
      page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});
      onProgress(++done,total);
    }catch(error){
      throw new Error("Не може да се създаде PDF страница за АРК "+display(row.ark)+": "+(error?.message||String(error)));
    }
    for(const doc of bundle.rowDocumentsById.get(row.id)||[])await appendDocument(doc);
    for(const doc of bundle.invoiceDocumentsByRowId?.get(row.id)||[])await appendDocument(doc);
  }
  return combined.save();
}

export function customsPdfFileName(declarationNos){
  const numbers=Array.isArray(declarationNos)?declarationNos:[declarationNos];
  if(numbers.filter(Boolean).length!==1)return "Украинска_митница_избрани_доставки.pdf";
  const normalized=String(numbers.find(Boolean)).replace(/[^\p{L}\p{N}_-]+/gu,"_").slice(0,80)||"bez_nomer";
  return "Украинска_митница_декларация_"+normalized+".pdf";
}
