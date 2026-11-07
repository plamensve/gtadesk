/**
 * Pure, testable width calculations. Every boundary controls the column to
 * its left. Resizing redistributes existing space; it never grows the table.
 */
export function fitDeliveryColumns(preferred, available, minimums, weights, actionsIndex, actionsWidth){
  const min=minimums.slice();
  min[actionsIndex]=actionsWidth;
  const minTotal=min.reduce((sum,value)=>sum+value,0);
  const target=Math.max(minTotal,Math.floor(available));
  const extra=target-minTotal;
  const hasPreference=Array.isArray(preferred)&&preferred.length===min.length;
  const share=min.map((_,i)=>{
    if(i===actionsIndex)return 0;
    return hasPreference?Math.max(1,Number(preferred[i])-min[i]):weights[i];
  });
  const shareTotal=share.reduce((sum,value)=>sum+value,0);
  const result=min.map((value,i)=>value+extra*share[i]/shareTotal);
  result[actionsIndex]=actionsWidth;
  return result;
}

export function resizeDeliveryBoundary(widths, index, requestedDelta, minimums, actionsIndex){
  const next=widths.slice();
  if(!Number.isInteger(index)||index<0||index>=actionsIndex||!Number.isFinite(requestedDelta))return next;
  if(requestedDelta>0){
    // Usually take space from columns to the right. For the final editable
    // Status column, take from the left without changing Actions.
    const donors=index===actionsIndex-1
      ?Array.from({length:index},(_,i)=>index-1-i)
      :Array.from({length:actionsIndex-index-1},(_,i)=>index+1+i);
    let pending=requestedDelta;
    for(const donor of donors){
      const taken=Math.min(pending,Math.max(0,next[donor]-minimums[donor]));
      next[donor]-=taken;
      next[index]+=taken;
      pending-=taken;
      if(pending<=0)break;
    }
  }else if(requestedDelta<0){
    const released=Math.min(-requestedDelta,Math.max(0,next[index]-minimums[index]));
    const recipient=index===actionsIndex-1?index-1:index+1;
    next[index]-=released;
    next[recipient]+=released;
  }
  return next;
}
