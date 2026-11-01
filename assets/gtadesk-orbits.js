/* 3D projected orbits: segments hidden by Earth's spherical depth never render. */
(() => {
 for(const root of document.querySelectorAll(".globe-interactive")){
  const canvas=root.querySelector(".globe-rings");const ctx=canvas?.getContext("2d");if(!ctx)continue;
  const specs=[{angle:-.42,tilt:1.04,color:"#4bdfec"},{angle:.76,tilt:1.18,color:"#9df1f8"}];
  function point(s,t){
   const r=1.3,ca=Math.cos(s.angle),sa=Math.sin(s.angle),ct=Math.cos(s.tilt),st=Math.sin(s.tilt),c=Math.cos(t),sn=Math.sin(t);
   return {x:r*(ca*c-sa*ct*sn),y:r*(sa*c+ca*ct*sn),z:r*st*sn};
  }
  function visible(p){const r2=p.x*p.x+p.y*p.y;return r2>=1||p.z>=Math.sqrt(Math.max(0,1-r2));}
  function draw(){
   const w=root.getBoundingClientRect().width;
   if(w<2)return;
   const dpr=Math.min(2,devicePixelRatio||1),sz=Math.round(w*1.5*dpr),center=sz/2,radius=sz/3,scale=sz/480;
   canvas.width=canvas.height=sz;ctx.clearRect(0,0,sz,sz);
   for(const s of specs){
    ctx.lineWidth=2.2*scale;ctx.strokeStyle=s.color;ctx.shadowColor="#22d4e0";ctx.shadowBlur=11*scale;ctx.lineCap="round";
    let active=false;ctx.beginPath();
    for(let i=0;i<=720;i++){
     const p=point(s,i/720*Math.PI*2);
     if(visible(p)){const x=center+p.x*radius,y=center-p.y*radius;if(!active){ctx.moveTo(x,y);active=true;}else ctx.lineTo(x,y);}
     else if(active){ctx.stroke();ctx.beginPath();active=false;}
    }
    if(active)ctx.stroke();
    for(const t of [1.0,2.6,5.05]){
     const p=point(s,t);if(!visible(p))continue;
     const x=center+p.x*radius,y=center-p.y*radius;
     ctx.beginPath();ctx.arc(x,y,4*scale,0,Math.PI*2);ctx.fillStyle="#0ac7c5";ctx.shadowBlur=12*scale;ctx.fill();
    }
   }
   ctx.shadowBlur=0;
  }
  root.addEventListener("globe-ready",draw);root.addEventListener("globe-resize",draw);
  new ResizeObserver(()=>{if(root.classList.contains("globe-ready"))draw();}).observe(root);
 }
})();