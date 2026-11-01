/* GTA Desk: independently rotating textured Earth, no runtime library. */
(() => {
const vs="attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
const fs=[
"precision highp float;varying vec2 uv;uniform sampler2D tex;uniform float yaw,pitch;",
"void main(){vec2 q=(uv-.5)*2.;float r=dot(q,q);if(r>1.)discard;",
"vec3 v=vec3(q,sqrt(1.-r));float a=cos(pitch),b=sin(pitch);",
"v=vec3(v.x,a*v.y-b*v.z,b*v.y+a*v.z);a=cos(yaw);b=sin(yaw);",
"v=vec3(a*v.x+b*v.z,v.y,-b*v.x+a*v.z);",
"float lon=atan(v.x,v.z),lat=asin(clamp(v.y,-1.,1.));",
"vec3 t=texture2D(tex,vec2(fract(.5+lon/6.2831853),.5+lat/3.14159265)).rgb;",
"float land=smoothstep(-.09,.12,t.r*.75+t.g*.7-t.b*1.18+.02);",
"vec3 water=mix(vec3(.015,.33,.55),vec3(.18,.72,.86),clamp(.48+q.y*.22+sqrt(1.-r)*.2,0.,1.));",
"vec3 ground=mix(vec3(.46,.82,.92),vec3(.92,.99,1.),clamp(.3+t.r*.6+t.g*.3,0.,1.));",
"vec3 col=mix(water,ground,.92*land);float light=.74+.26*max(0.,dot(vec3(q,sqrt(1.-r)),normalize(vec3(-.4,.5,.8))));",
"col=col*light+pow(1.-sqrt(1.-r),3.)*vec3(.18,.3,.35);gl_FragColor=vec4(col,1.);}"
].join("\n");
function compile(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
for(const root of document.querySelectorAll(".globe-interactive")){
 const canvas=root.querySelector(".globe-sphere");
 const gl=canvas?.getContext("webgl",{alpha:true,antialias:true});
 if(!gl)continue;
 let program;
 try{program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("Shader link failed");}
 catch(error){console.warn("GTA Desk globe:",error);continue;}
 gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,"p");gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const yLoc=gl.getUniformLocation(program,"yaw"),pLoc=gl.getUniformLocation(program,"pitch");
 const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.uniform1i(gl.getUniformLocation(program,"tex"),0);
 let yaw=.25,pitch=-.28,ready=false,drag=false,ox=0,oy=0,last=performance.now(),previous=last;
 function draw(){if(!ready||canvas.width<2)return;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform1f(yLoc,yaw);gl.uniform1f(pLoc,pitch);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.drawArrays(gl.TRIANGLES,0,6);}
 function size(){const w=root.getBoundingClientRect().width;if(w<2)return;const d=Math.min(2,devicePixelRatio||1);canvas.width=canvas.height=Math.round(w*d);draw();root.dispatchEvent(new Event("globe-resize"));}
 const img=new Image();img.onload=()=>{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);ready=true;size();root.classList.add("globe-ready");root.dispatchEvent(new Event("globe-ready"));draw();};
 img.onerror=()=>console.warn("GTA Desk: Earth texture unavailable; fallback displayed.");img.src="./assets/earth-atmos-2048.jpg";
 root.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;drag=true;ox=e.clientX;oy=e.clientY;last=performance.now();root.setPointerCapture?.(e.pointerId);e.preventDefault();});
 root.addEventListener("pointermove",e=>{if(!drag||!ready)return;yaw-=(e.clientX-ox)*.009;pitch=Math.max(-1.3,Math.min(1.3,pitch+(e.clientY-oy)*.007));ox=e.clientX;oy=e.clientY;last=performance.now();draw();});
 for(const type of ["pointerup","pointercancel","lostpointercapture"])root.addEventListener(type,()=>{drag=false;last=performance.now();});
 root.addEventListener("keydown",e=>{if(!ready||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();if(e.key==="ArrowLeft")yaw-=.12;if(e.key==="ArrowRight")yaw+=.12;if(e.key==="ArrowUp")pitch=Math.min(1.3,pitch+.1);if(e.key==="ArrowDown")pitch=Math.max(-1.3,pitch-.1);last=performance.now();draw();});
 canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();ready=false;root.classList.remove("globe-ready");});
 new ResizeObserver(size).observe(root);size();
 const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
 function animate(t){const dt=Math.min(.05,(t-previous)/1000);previous=t;if(ready&&!reduced&&!drag&&t-last>2500&&!document.hidden){yaw+=dt*.024;draw();}requestAnimationFrame(animate);}
 requestAnimationFrame(animate);
}
})();