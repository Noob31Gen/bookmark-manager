import{c as t,r as p,j as e,B as k}from"./index-C7P5Q-S4.js";import{c as u}from"./utils-DMNeROnM.js";/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r={name:"external-link",size:24,node:[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]};r.node;const w=t(r);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d={name:"refresh-cw",size:24,node:[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]};d.node;const M=t(d);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c={name:"shield-alert",size:24,node:[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M12 16h.01",key:"1drbdi"}]]};c.node;const j=t(c);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i={name:"shield-check",size:24,node:[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]};i.node;const g=t(i);/**
 * @license lucide-react v1.49.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l={name:"x",size:24,node:[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]};l.node;const y=t(l);function z({isOpen:s,onClose:n,title:m,subtitle:o,maxWidth:h="max-w-2xl",children:x}){return p.useEffect(()=>{const a=f=>{f.key==="Escape"&&s&&n()};return s&&(document.body.style.overflow="hidden",window.addEventListener("keydown",a)),()=>{document.body.style.overflow="",window.removeEventListener("keydown",a)}},[s,n]),s?e.jsx("div",{className:"fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200",onClick:a=>{a.target===a.currentTarget&&n()},children:e.jsxs("div",{className:u("w-full bg-card border-t-2 sm:border-2 border-border shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 safe-area-bottom sm:pb-0",h),children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-border p-3 sm:p-4 bg-muted/30 flex-shrink-0",children:[e.jsxs("div",{className:"min-w-0 flex-1 mr-2",children:[e.jsx("h2",{className:"text-base sm:text-lg font-black uppercase tracking-wide text-foreground truncate",children:m}),o&&e.jsx("p",{className:"text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate",children:o})]}),e.jsx(k,{variant:"outline",size:"icon-sm",onClick:n,"aria-label":"Close modal",className:"flex-shrink-0 cursor-pointer",children:e.jsx(y,{className:"w-4 h-4"})})]}),e.jsx("div",{className:"p-3 sm:p-6 overflow-y-auto flex-1",children:x})]})}):null}export{w as E,z as M,M as R,g as S,y as X,j as a};
