import{c as a,r as f,j as e,B as k,a as p}from"./index-XIuCKTXe.js";/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o={name:"external-link",size:24,node:[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]};o.node;const y=a(o);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r={name:"refresh-cw",size:24,node:[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]};r.node;const b=a(r);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c={name:"shield-check",size:24,node:[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]};c.node;const w=a(c);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i={name:"x",size:24,node:[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]};i.node;const u=a(i);function j({isOpen:n,onClose:t,title:l,subtitle:s,maxWidth:h="max-w-2xl",children:x}){return f.useEffect(()=>{const d=m=>{m.key==="Escape"&&n&&t()};return window.addEventListener("keydown",d),()=>window.removeEventListener("keydown",d)},[n,t]),n?e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200",children:e.jsxs("div",{className:p("w-full bg-card border-2 border-border shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200",h),children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-border p-4 bg-muted/30",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-lg font-bold uppercase tracking-wide text-foreground",children:l}),s&&e.jsx("p",{className:"text-xs text-muted-foreground mt-0.5",children:s})]}),e.jsx(k,{variant:"outline",size:"icon-sm",onClick:t,"aria-label":"Close modal",children:e.jsx(u,{className:"w-4 h-4"})})]}),e.jsx("div",{className:"p-6 overflow-y-auto flex-1",children:x})]})}):null}export{y as E,j as M,b as R,w as S,u as X};
