// The room's light, baked once (DECISIONS.md, "Studio look").
//
// One warm spot hangs above and in front of the board, a little to the left: the
// same light the dart shadows already assume (tune.flight.shadowX/Y). A WebGL
// shader works out that light per pixel, once, at the screen's own resolution:
// the board face (sisal, wires, raised numbers, rim and side), the surround and
// wall (shadows, contact darkening, timber boards, skirting) and the floor (planks,
// mat, oche). Each result is copied into a plain canvas on the room's existing CSS
// 3D planes and the WebGL context is released. Nothing re-renders afterwards: the
// camera still moves the planes on the compositor, and the throw still reads the
// SVG board's own geometry (.board-plane), so where a dart lands is untouched.
//
// The values to tune by feel live in style.css ("Light and materials"), read here
// at bake time. If WebGL is missing or fails, the room keeps its CSS and SVG look.
import { radii } from "./game.js";
import { tune } from "./throw.js";

const vertex = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
// Shared: noise, colour space and the spot. Lengths are board millimetres
// (422 to a board width) from the bull; +y is down, +z from the wall to the player.
const prelude = `precision highp float;
uniform vec2 uSize;
uniform vec3 uLamp, uAim, uCam, uTint, uAmbCol;
uniform float uKey, uAmb, uCone, uSoft, uSpill, uGrain;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}
// 1 up to lo, 0 from hi: smoothstep with its edges reversed, which GLSL leaves undefined.
float fade(float hi,float lo,float x){return 1.-smoothstep(lo,hi,x);}
// The spot reaching pos: 1 on the board face at the bull, before the angle of the surface.
float spot(vec3 pos,out vec3 L){
  vec3 d=uLamp-pos;float r=length(d);L=d/r;
  float c=dot(-L,normalize(uAim-uLamp));
  float cone=smoothstep(cos(uCone+uSoft),cos(max(uCone-uSoft,0.)),c);
  return uKey*mix(uSpill,1.,cone)/(r*r);
}
// Diffuse plus a Blinn highlight. occl darkens the ambient, lit the spot.
vec3 shade(vec3 alb,vec3 n,vec3 pos,float spec,float gloss,float occl,float lit){
  vec3 L;float k=spot(pos,L)*lit;
  vec3 V=normalize(uCam-pos),H=normalize(L+V);
  float s=spec*pow(max(dot(n,H),0.),gloss)*(gloss+8.)/25.;
  return alb*(uAmb*occl*uAmbCol+k*max(dot(n,L),0.)*uTint)+k*s*uTint*step(0.,dot(n,L));
}
// A shadow cast by an upright cylinder about the bull (radius R, from the wall to
// height H) on a point q: does the path to the lamp pass through it?
float cylinder(vec3 q,float R,float H,float soft){
  if(q.z>=H)return 1.;
  vec3 L=normalize(uLamp-q);
  vec2 a=q.xy,ab=L.xy/L.z*(H-q.z);
  float t=clamp(-dot(a,ab)/max(dot(ab,ab),1e-4),0.,1.);
  float pen=1.5+soft*(H-q.z);
  return smoothstep(R-pen,R+pen,length(a+ab*t));
}
vec4 finish(vec3 c,float a){
  c=pow(max(c,0.),vec3(1./2.2));
  c+=(hash(gl_FragCoord.xy+.5)-.5)*uGrain;
  return vec4(clamp(c,0.,1.)*a,a);
}
vec2 pixel(){return vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y)/uSize;}
`;

// The board face, drawn into the board's own 422-unit box in its fixed projection
// (tune.camera: x' = x + skew·y, y' = faceHeight·y), so every bed, wire and number
// sits where the SVG face drew it and scoreAt() reads it.
const faceShader = `
uniform sampler2D uNums;
uniform float uSkew,uFh,uFaceZ,uWire,uWireShine,uSisal,uBevel,uShadow;
uniform float uR0,uR1,uR2,uR3,uR4,uR5;
uniform vec3 uCream,uBlack,uRed,uGreen,uBand,uMetal;
float wireAt(vec2 p,out vec3 across){
  float r=length(p);vec2 radial=p/max(r,1e-3);
  float best=1e3;across=vec3(radial,0.);
  float R[6];R[0]=uR0;R[1]=uR1;R[2]=uR2;R[3]=uR3;R[4]=uR4;R[5]=uR5;
  for(int i=0;i<6;i++){float d=r-R[i];if(abs(d)<abs(best)){best=d;}}
  if(r>uR1-uWire&&r<uR5+uWire){
    float deg=degrees(atan(p.x,-p.y))+9.;
    float f=fract(deg/18.),off=(f<.5?f:f-1.)*18.;
    float d=r*sin(radians(off));
    if(abs(d)<abs(best)){float a=radians(deg-9.-off);best=d;across=vec3(cos(a),sin(a),1.);}
  }
  if(across.z<.5)across=vec3(radial,0.);
  return best;
}
vec3 sisal(vec3 alb,vec2 p,float px,float dark,out vec3 n){
  float h0=fbm(p*1.7),hx=fbm((p+vec2(.25,0.))*1.7),hy=fbm((p+vec2(0.,.25))*1.7);
  n=normalize(vec3((h0-hx)*uSisal*3.,(h0-hy)*uSisal*3.,1.));
  float fleck=noise(p*2.9+31.)*.45+noise(p*1.1+7.)*.35+noise(p*.3)*.2;
  float fibre=smoothstep(.55,.8,noise(p*vec2(3.4,1.3)+fbm(p*.4)*4.));
  return alb*(1.+uSisal*((fleck-.5)*(.7+dark*.8)-fibre*(.22-dark*.3)));
}
void main(){
  vec2 uv=pixel();
  float px=422./uSize.x;
  vec2 s=uv*422.-211.;
  float y=s.y/uFh;vec2 p=vec2(s.x-uSkew*y,y);
  float r=length(p);
  vec3 pos=vec3(p,uFaceZ),n=vec3(0.,0.,1.),col;
  float alpha=1.;
  vec3 Lc;spot(pos,Lc);
  vec2 lean=Lc.xy/Lc.z;
  if(r<uR5+1.){
    float deg=mod(degrees(atan(p.x,-p.y))+369.,360.);
    float i=floor(deg/18.),odd=mod(i,2.);
    vec3 alb;
    float dark=0.;
    if(r<uR0)alb=uRed;
    else if(r<uR1)alb=uGreen;
    else{
      bool ring=(r>uR2&&r<uR3)||r>uR4;
      alb=ring?(odd>.5?uGreen:uRed):(odd>.5?uCream:uBlack);
      dark=ring||odd>.5?0.:1.;
      alb*=1.+(hash(vec2(i,ring?1.:0.))-.5)*.05;
    }
    alb=sisal(alb,p,px,dark,n);
    vec3 across;float d=wireAt(p,across);
    vec3 unused;float ds=wireAt(p+lean*uWire*3.2,unused);
    float shadow=1.-uShadow*.6*fade(uWire+.6,uWire-.3,abs(ds));
    float ao=1.-.45*fade(uWire+1.4,uWire,abs(d));
    col=shade(alb,n,pos,.02,6.,ao,shadow*ao);
    // The spider: round wires, lit along their top-left and dark beneath.
    float t=clamp(d/uWire,-1.,1.);
    vec3 wn=normalize(vec3(across.xy*t,sqrt(1.-t*t)));
    vec3 V=normalize(uCam-pos);vec3 R=reflect(-V,wn);
    vec3 wire=shade(uMetal,wn,pos+vec3(0.,0.,uWire),uWireShine,40.,1.,1.);
    wire+=uMetal*uWireShine*.45*smoothstep(-.3,.9,-R.y-.4*R.x);
    float cover=fade(uWire+px*.5,uWire-px*.5,abs(d));
    col=mix(col,wire,cover);
  }else if(r<199.5){
    vec3 nb;vec3 alb=sisal(uBand,p,px,1.,nb);
    vec4 m=texture2D(uNums,uv);
    float e=1.8/uSize.x;
    float gx=texture2D(uNums,uv+vec2(e,0.)).a-texture2D(uNums,uv-vec2(e,0.)).a;
    float gy=texture2D(uNums,uv+vec2(0.,e)).a-texture2D(uNums,uv-vec2(0.,e)).a;
    float behind=texture2D(uNums,uv-lean*2.6/422.).a;
    float band=1.-uShadow*.6*behind*(1.-m.a);
    float ao=1.-.35*fade(176.,170.,r);
    col=shade(alb,nb,pos,.03,10.,ao,band*ao);
    vec3 nn=normalize(vec3(-gx*uBevel,-gy*uBevel,1.));
    vec3 num=shade(uCream*1.18,nn,pos+vec3(0.,0.,2.6),.12,22.,1.,1.);
    col=mix(col,num,m.a);
  }else if(r<202.+px){
    float t=clamp((r-199.5)/2.5,0.,1.);
    vec3 rn=normalize(vec3(p/r*sin(t*1.3),cos(t*1.3)));
    col=shade(uBand*1.4,rn,pos,.25,30.,1.,1.);
    alpha=fade(202.+px*.5,202.-px*.5,r);
  }else alpha=0.;
  // The board's side, below the face (the SVG face's sidewall circle).
  float side=length(p-vec2(0.,8.));
  if(r>201.&&side<202.+px){
    vec2 out2=normalize(p);
    vec3 sn=normalize(vec3(out2,.15));
    vec3 alb=uBand*(.9+.2*noise(vec2(atan(p.x,p.y)*90.,r)));
    vec3 sc=shade(alb,sn,vec3(p,uFaceZ*.5),.05,12.,.7,1.);
    sc*=.55+.45*fade(214.,203.,side);
    float rim=fade(202.+px*.5,202.-px*.5,side);
    col=mix(sc,col,alpha);alpha=max(alpha,rim);
  }
  gl_FragColor=finish(col,alpha);
}`;

// The wall around the board: the surround (a raised ring with a rounded edge) and
// the painted timber boards and skirting behind it, with the shadows that the
// board and surround cast and the darkening where they meet.
const wallShader = `
uniform vec4 uRect;
uniform float uRs,uSurH,uBoardR,uBoardH,uPanel,uFloorY,uSkirt,uSoftness,uShadow,uSheen;
uniform vec3 uPaint,uSurCol,uSkirtCol;
vec3 surround(vec2 p,float r){
  float e=16.,rr=r-(uRs-e);
  vec3 n=vec3(0.,0.,1.);float h=uSurH;
  if(rr>0.){float t=min(rr/e,1.);h=uSurH-e+e*sqrt(1.-t*t);n=normalize(vec3(p/r*t,sqrt(max(1.-t*t,.02))));}
  vec3 pos=vec3(p,h);
  vec3 alb=uSurCol*(1.+(noise(p*1.9)-.5)*.35+(noise(p*.08)-.5)*.2);
  float ao=1.-.6*exp(-(r-uBoardR)/10.);
  float lit=mix(1.,cylinder(pos,uBoardR,uBoardH,uSoftness),uShadow);
  return shade(alb,n,pos,uSheen,14.,ao,lit*ao);
}
vec3 wall(vec2 p,float r){
  vec3 pos=vec3(p,0.),n=vec3(0.,0.,1.);
  float lit=mix(1.,min(cylinder(pos,uBoardR,uBoardH,uSoftness),cylinder(pos,uRs,uSurH,uSoftness)),uShadow);
  float ao=1.-.55*exp(-max(r-uRs,0.)/34.);
  vec3 alb;
  if(p.y>uFloorY-uSkirt){
    // Skirting: a chamfered top catching the light, then its face.
    float top=uFloorY-uSkirt;
    n=p.y<top+6.?normalize(vec3(0.,-.75,.66)):vec3(0.,0.,1.);
    pos.z=10.;
    alb=uSkirtCol*(1.+(noise(vec2(p.x*.05,p.y*.6))-.5)*.2);
    ao*=1.-.45*smoothstep(uFloorY-14.,uFloorY,p.y);
  }else{
    float u=p.x/uPanel+.5,i=floor(u),f=fract(u);
    float ds=(f<.5?f:f-1.)*uPanel;
    if(abs(ds)<2.25)n=normalize(vec3(-sign(ds)*.8,0.,.6));
    float grain=fbm(vec2(p.x*.5,p.y*.03+i*7.));
    alb=uPaint*(1.+(grain-.5)*.18+(hash(vec2(i,3.))-.5)*.06);
    ao*=1.-.35*fade(3.,0.,abs(ds));
    ao*=1.-.4*exp(-(uFloorY-uSkirt-p.y)/22.);
  }
  return shade(alb,n,pos,uSheen*.6,18.,ao,lit*ao);
}
void main(){
  vec2 uv=pixel();
  vec2 p=mix(uRect.xy,uRect.zw,uv);
  float px=(uRect.z-uRect.x)/uSize.x;
  float r=length(p);
  vec3 col;
  float edge=fade(uRs+px,uRs-px,r);
  if(edge>=1.)col=surround(p,r);
  else if(edge<=0.)col=wall(p,r);
  else col=mix(wall(p,r),surround(p,r),edge);
  float a=smoothstep(0.,.14,uv.x)*fade(1.,.86,uv.x)*smoothstep(0.,.18,uv.y);
  gl_FragColor=finish(col,a);
}`;

// The floor, seen from above with the wall along its top edge: dark varnished
// planks running out from the wall, the mat to the oche, and the oche itself.
const floorShader = `
uniform vec4 uRect;
uniform float uFloorY,uPlank,uMatW,uOche,uSheen;
uniform vec3 uWood,uMat,uLine,uSteel;
void main(){
  vec2 uv=pixel();
  vec2 q=mix(uRect.xy,uRect.zw,uv);
  float px=(uRect.z-uRect.x)/uSize.x;
  vec3 pos=vec3(q.x,uFloorY,q.y),n=vec3(0.,-1.,0.);
  float ao=1.-.55*exp(-q.y/40.);
  vec3 col;
  float u=q.x/uPlank+.5,i=floor(u),f=fract(u);
  float seam=fade(1.6,.3,abs((f<.5?f:f-1.)*uPlank));
  float joint=fract(q.y/(uPlank*9.)+hash(vec2(i,1.)));
  seam=max(seam,fade(.006,.0,abs(joint-.5))*.8);
  vec3 wood=uWood*(1.+(fbm(vec2(q.x*.35,q.y*.02+i*5.))-.5)*.5+(hash(vec2(i,2.))-.5)*.2);
  col=shade(wood*(1.-.6*seam),n,pos,uSheen,24.,ao,ao);
  if(abs(q.x)<uMatW&&q.y<uOche+uMatW*.4){
    float e=uMatW-abs(q.x);
    vec3 mat=uMat*(1.+(noise(q*1.3)-.5)*.25);
    if(e>uMatW*.035&&e<uMatW*.07)mat=uLine;
    float lip=smoothstep(0.,3.,e);
    vec3 m=shade(mat,n,pos+vec3(0.,-3.,0.),.12,10.,ao,ao*(.75+.25*lip));
    col=mix(col*.7,m,smoothstep(0.,px*1.5,e));
  }
  float oz=q.y-uOche;
  if(abs(q.x)<uMatW*1.39&&oz>-4.&&oz<26.){
    // The oche: a raised steel strip with a lit top and a shadow on the camera side.
    vec3 sn=oz<0.?normalize(vec3(0.,-.6,-.8)):vec3(0.,-1.,0.);
    vec3 steel=uSteel*(1.+(noise(vec2(q.x*.02,q.y*3.))-.5)*.3);
    vec3 o=shade(steel,sn,pos+vec3(0.,-12.,0.),.9,40.,1.,1.);
    col=oz<22.?o:col*.5;
  }
  float d=length(vec2((uv.x-.5)*2.,uv.y));
  gl_FragColor=finish(col,1.-smoothstep(.45,1.,d));
}`;

function compile(gl, source) {
  const program = gl.createProgram();
  for (const [type, text] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, prelude + source],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "a");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  return program;
}

// "#rrggbb" → linear RGB.
const linear = (hex) =>
  [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);

// The room's numbers from style.css, in board widths unless stated.
function settings() {
  const css = getComputedStyle(document.documentElement);
  const num = (name) => parseFloat(css.getPropertyValue(name));
  const hex = (name) => linear(css.getPropertyValue(name).trim());
  const tint = (name) => {
    const c = hex(name);
    return c.map((v) => v / Math.max(...c));
  };
  return {
    lamp: [num("--light-x"), num("--light-y"), num("--light-z")],
    aim: [num("--light-aim-x"), num("--light-aim-y")],
    strength: num("--light"),
    ambient: num("--ambient"),
    cone: num("--spot-cone"),
    soft: num("--spot-soft"),
    spill: num("--spot-spill"),
    tint: tint("--light-colour"),
    ambientTint: tint("--ambient-colour"),
    shadow: num("--shadows"),
    softness: num("--shadow-soft"),
    wire: num("--wire-shine"),
    sisal: num("--sisal"),
    bevel: num("--number-relief"),
    sheen: num("--sheen"),
    grain: num("--grain"),
    paint: hex("--wall-paint"),
    boards: num("--wall-boards"),
    surround: num("--surround"),
    floorDrop: num("--floor-drop"),
    floorDepth: num("--floor-depth"),
    ocheAt: num("--oche-at"),
    lens: num("--lens"),
  };
}

// The numbers ring, drawn as the SVG face draws it (src/art.js boardFace) into a
// mask the shader raises and shades.
function numbers(size, sectors) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"),
    k = size / 422;
  g.setTransform(k, 0, k * tune.camera.skew, k * tune.camera.faceHeight, size / 2, size / 2);
  g.font = "700 20px system-ui, -apple-system, sans-serif";
  g.textAlign = "center";
  g.fillStyle = "#fff";
  sectors.forEach((n, i) => {
    const a = (i * 18 * Math.PI) / 180;
    g.fillText(n, Math.sin(a) * 185, -Math.cos(a) * 185 + 6.5);
  });
  return c;
}

const mm = 422; // board millimetres to a board width

// Bakes the face, wall and floor for a board `b` CSS px wide at `dpr`, into the
// three canvases given. Returns how long it took (ms), or throws.
export function bake({ b, dpr, face, wall, floor, sectors }) {
  const t0 = performance.now();
  const s = settings();
  const gl = document
    .createElement("canvas")
    .getContext("webgl", { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw Error("No WebGL");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const faceZ = 40; // the face stands this far off the wall (mm)
  const lamp = s.lamp.map((v) => v * mm);
  const aim = [s.aim[0] * mm, s.aim[1] * mm, faceZ];
  const cam = [0, 0, s.lens * mm];
  // Normalise so the face at the bull shows its own colours: ambient plus the spot
  // falling on it there make 1.
  const toBull = [-lamp[0], -lamp[1], faceZ - lamp[2]];
  const dist2 = toBull.reduce((t, v) => t + v * v, 0);
  const facing = (lamp[2] - faceZ) / Math.sqrt(dist2);
  const key = (s.strength * (1 - s.ambient) * dist2) / facing;

  // Compile all three first: a failure then leaves every canvas as it was.
  const programs = [faceShader, wallShader, floorShader].map((source) => compile(gl, source));
  function draw(program, canvas, width, height, uniforms, texture, check) {
    gl.useProgram(program);
    gl.canvas.width = width;
    gl.canvas.height = height;
    gl.viewport(0, 0, width, height);
    const set = (name, v) => {
      const at = gl.getUniformLocation(program, name);
      if (!at) return;
      if (typeof v === "number") gl.uniform1f(at, v);
      else if (v.length === 2) gl.uniform2fv(at, v);
      else if (v.length === 3) gl.uniform3fv(at, v);
      else gl.uniform4fv(at, v);
    };
    const common = {
      uSize: [width, height],
      uLamp: lamp,
      uAim: aim,
      uCam: cam,
      uTint: s.tint,
      uAmbCol: s.ambientTint,
      uKey: key,
      uAmb: s.ambient,
      uCone: (s.cone * Math.PI) / 180,
      uSoft: (s.soft * Math.PI) / 180,
      uSpill: s.spill,
      uGrain: s.grain / 255,
    };
    for (const [name, v] of Object.entries({ ...common, ...uniforms })) set(name, v);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const [k, v] of [
        [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
        [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      ])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
      gl.uniform1i(gl.getUniformLocation(program, "uNums"), 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    check?.(width, height);
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(gl.canvas, 0, 0);
  }

  // The face, at full resolution: it's what you read.
  const size = Math.min(2048, Math.round(b * dpr));
  draw(
    programs[0],
    face,
    size,
    size,
    {
      uSkew: tune.camera.skew,
      uFh: tune.camera.faceHeight,
      uFaceZ: faceZ,
      uWire: 0.7,
      uWireShine: s.wire,
      uSisal: s.sisal,
      uBevel: s.bevel,
      uShadow: s.shadow,
      uR0: radii.bull,
      uR1: radii.outerBull,
      uR2: radii.trebleIn,
      uR3: radii.trebleOut,
      uR4: radii.doubleIn,
      uR5: radii.edge,
      uCream: linear("#f3f1e8"),
      uBlack: linear("#17191a"),
      uRed: linear("#c52639"),
      uGreen: linear("#128959"),
      uBand: linear("#1b1d1d"),
      uMetal: linear("#e4e1d8"),
    },
    numbers(size, sectors),
    // Before any canvas changes: the bull must come out red and a cream bed
    // (single 1, 130 mm out) cream, or this GPU drew something else.
    (w, h) => {
      const at = (x, y) => {
        const px = new Uint8Array(4);
        const u = Math.round(((x + y * tune.camera.skew + 211) / 422) * w - 0.5),
          v = Math.round(((y * tune.camera.faceHeight + 211) / 422) * h - 0.5);
        gl.readPixels(u, h - 1 - v, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const [r, g, , a] = at(0, 0);
      const [cr, cg, cb, ca] = at(Math.sin(Math.PI / 10) * 130, -Math.cos(Math.PI / 10) * 130);
      if (!(a === 255 && r > 2 * g && ca === 255 && Math.min(cr, cg, cb) > 120))
        throw Error("The baked face came out wrong");
    },
  );

  // The wall and surround: soft, so about one texel per CSS px is plenty.
  const W = 3.6,
    top = 2.0,
    H = top + s.floorDrop;
  const wallScale = Math.min(1, dpr, Math.sqrt(1.6e6 / (W * H * b * b)));
  const rs = (s.surround / 2) * mm;
  draw(programs[1], wall, Math.round(W * b * wallScale), Math.round(H * b * wallScale), {
    uRect: [(-W / 2) * mm, -top * mm, (W / 2) * mm, s.floorDrop * mm],
    uRs: rs,
    uSurH: 24,
    uBoardR: 202,
    uBoardH: faceZ,
    uPanel: s.boards * mm,
    uFloorY: s.floorDrop * mm,
    uSkirt: 0.045 * mm,
    uSoftness: s.softness,
    uShadow: s.shadow,
    uSheen: s.sheen,
    uPaint: s.paint,
    uSurCol: linear("#151615"),
    uSkirtCol: linear("#1d1e19"),
  });

  // The floor: seen at a glancing angle, so a lower resolution avoids shimmer.
  const FW = 3.2,
    FD = s.floorDepth;
  const floorScale = Math.min(0.75, dpr);
  draw(programs[2], floor, Math.round(FW * b * floorScale), Math.round(FD * b * floorScale), {
    uRect: [(-FW / 2) * mm, 0, (FW / 2) * mm, FD * mm],
    uFloorY: s.floorDrop * mm,
    uPlank: 0.18 * mm,
    uMatW: 0.31 * mm,
    uOche: s.ocheAt * mm,
    uSheen: s.sheen,
    uWood: linear("#2b2218"),
    uMat: linear("#151816"),
    uLine: linear("#128959"),
    uSteel: linear("#c9c6bc"),
  });

  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return performance.now() - t0;
}
