import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, onSnapshot, query, orderBy
} from "firebase/firestore";

// ── CHECKLIST ─────────────────────────────────────────────────────────────────
const BASE_CHECKLIST = [
  { cat: "🧴 Limpieza y Desinfección", items: [
    { id:1,  text:"Utiliza productos de limpieza establecidos en protocolos y concentraciones adecuadas" },
    { id:2,  text:"Productos químicos rotulados con nombre y fecha vigente en buen estado" },
    { id:3,  text:"Dispensadores dotados de jabón, alcohol, toallas y limpios" },
    { id:4,  text:"Bolsas de residuos rotuladas en recipiente correspondiente al color" },
    { id:5,  text:"Transporte de residuos según código de colores" },
    { id:6,  text:"Uso de guantes negros para recolección de residuos" },
    { id:7,  text:"Uso de bayetilla azul para áreas limpias" },
    { id:8,  text:"Uso de bayetilla roja para áreas sucias" },
    { id:9,  text:"Uso de bayetilla naranja para áreas admin/puestos de enfermería (si aplica)" },
    { id:10, text:"No usa escoba para barrer habitaciones y pasillos" },
    { id:11, text:"Uso del cañón de ozono para aseo terminal en aislamiento (si aplica)" },
    { id:12, text:"Mopas y bayetas propias de aislamiento en habitaciones de paciente infeccioso" },
    { id:13, text:"Sala de espera, pasillos y áreas comunes limpias" },
    { id:14, text:"Conoce y aplica procedimiento para recolección de fluidos corporales" },
  ]},
  { cat: "🦺 Elementos de Protección Personal", items: [
    { id:17, text:"Uso de delantal al limpiar baños" },
    { id:18, text:"Uso de gafas de seguridad al limpiar baños" },
    { id:19, text:"Uso de tapabocas al limpiar baños" },
    { id:20, text:"Uso de guantes negros o rojos al limpiar baños" },
    { id:21, text:"Uso de monogafas en aseos terminales" },
    { id:22, text:"Uso correcto de EPP en actividades exteriores" },
    { id:23, text:"Uso de EPP correspondiente en habitaciones de aislamiento" },
  ]},
  { cat: "🙌 Higiene de Manos", items: [
    { id:25, text:"Realiza higiene de manos antes de iniciar labores" },
    { id:26, text:"Realiza higiene de manos después de manipular residuos" },
    { id:27, text:"Realiza higiene de manos después de quitarse los guantes" },
    { id:28, text:"Técnica correcta de lavado de manos (5 momentos OMS)" },
  ]},
  { cat: "🏥 Áreas y Servicios", items: [
    { id:30, text:"Cuartos y habitaciones: aseo y desinfección completos" },
    { id:31, text:"Baños de pacientes limpios y desinfectados" },
    { id:32, text:"Consultorios: equipos limpios y superficies desinfectadas" },
    { id:33, text:"Cocina/comedor: manejo correcto de residuos orgánicos" },
    { id:34, text:"Puntos ecológicos limpios y correctamente clasificados" },
    { id:35, text:"Áreas de circulación y andenes limpios" },
    { id:36, text:"Parqueaderos libres de basura y telarañas" },
    { id:37, text:"Cuarto de residuos temporales/finales superficies libres de suciedad" },
  ]},
  { cat: "📋 Documentación y Registros", items: [
    { id:40, text:"Registra oportunamente tareas en formatos asignados por servicio" },
    { id:41, text:"Registra revisiones de coordinación mes a mes" },
    { id:42, text:"Organización por puesto de trabajo al día con firmas de funcionarias" },
    { id:43, text:"Carros de limpieza organizados y limpios" },
  ]},
];
const ALL_ITEMS = BASE_CHECKLIST.flatMap(c => c.items);

const DEFAULT_COORDS = [
  "Ana García","Beatriz López","Carmen Rodríguez","Diana Martínez","Elena Sánchez",
  "Fernanda Torres","Gloria Vargas","Helena Mora","Iris Castillo","Juana Herrera",
  "Karla Ríos","Laura Peña","María Suárez","Natalia Ramos","Olga Jiménez",
];
const DEFAULT_SEDES = [
  { name:"Hospital Regional Moniquirá", ciudad:"Moniquirá" },
  { name:"Clínica Norte",               ciudad:"Tunja" },
  { name:"Centro de Salud Sur",         ciudad:"Tunja" },
  { name:"Hospital Central",            ciudad:"Bogotá" },
  { name:"Sede Administrativa",         ciudad:"Bogotá" },
  { name:"Clínica San José",            ciudad:"Duitama" },
  { name:"Centro Médico Este",          ciudad:"Sogamoso" },
  { name:"Hospital Occidente",          ciudad:"Chiquinquirá" },
];

// ── UTILS ─────────────────────────────────────────────────────────────────────
function getStatus(p) {
  if (p >= 0.8)  return { label:"Satisfactorio",      color:"#10b981", bg:"#d1fae5", text:"#065f46" };
  if (p >= 0.65) return { label:"Llamado Verbal",      color:"#f59e0b", bg:"#fef3c7", text:"#78350f" };
  return               { label:"Proc. Disciplinario", color:"#ef4444", bg:"#fee2e2", text:"#7f1d1d" };
}
function calcScore(entries) {
  const t = entries.reduce((s,e) => s+(e.obs||0), 0);
  const p = entries.reduce((s,e) => s+(e.pos||0), 0);
  return t > 0 ? p/t : 0;
}
const fmt = v => Math.round(v*100)+"%";

function compressImage(file) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 500;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h*(MAX/w)); w = MAX; }
          else       { w = Math.round(w*(MAX/h)); h = MAX; }
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", 0.5));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── FIREBASE HELPERS ──────────────────────────────────────────────────────────
const saveConfig = async (key, data) => {
  await setDoc(doc(db, "app_config", key), { data });
};
const loadConfig = async (key, fallback) => {
  try {
    const snap = await getDoc(doc(db, "app_config", key));
    return snap.exists() ? snap.data().data : fallback;
  } catch { return fallback; }
};
const saveRecord = async (record) => {
  await setDoc(doc(db, "records", String(record.id)), record);
};
const deleteRecord_fb = async (id) => {
  await deleteDoc(doc(db, "records", String(id)));
  // delete photos for this record
  const snap = await getDocs(collection(db, "photos"));
  snap.forEach(async d => { if (d.data().recordId === id) await deleteDoc(d.ref); });
};
const savePhotos = async (recordId, photoList) => {
  // Store each photo as a separate Firestore doc to stay under 1MB limit
  for (let i = 0; i < photoList.length; i++) {
    const photoDoc = { recordId, index: i, ...photoList[i] };
    await setDoc(doc(db, "photos", `${recordId}_${i}`), photoDoc);
  }
};

// ── EXCEL EXPORTS ─────────────────────────────────────────────────────────────
function exportCoordExcel(record, sedes) {
  const st   = getStatus(record.score);
  const sede = sedes.find(s => s.name === record.sede) || { ciudad:"" };
  const wb   = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([
    ["INFORME DE SUPERVISIÓN — PLAN DE ACCIÓN"], [""],
    ["Coordinadora:", record.coordinadora],
    ["Sede:", record.sede], ["Ciudad:", sede.ciudad], ["Fecha:", record.fecha],
    ["Calificación:", fmt(record.score)], ["Estado:", st.label],
    ["Total personas observadas:", record.entries.reduce((s,e)=>s+e.obs,0)],
    ["Total comportamientos positivos:", record.entries.reduce((s,e)=>s+e.pos,0)],
    [""], ["Escala de Calificación:"],
    ["80%-100%","Revisión Satisfactoria"],
    ["65%-80%","Llamado de Atención Verbal"],
    ["Menos 65%","Proceso Disciplinario"],
  ]);
  ws1["!cols"] = [{wch:32},{wch:40}];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

  const rows = [["#","Categoría","Ítem","Obs.","Pos.","% Cumplimiento","Estado","Observación","PLAN DE ACCIÓN"]];
  BASE_CHECKLIST.forEach(cat => cat.items.forEach(item => {
    const e = record.entries.find(x => x.id === item.id);
    if (e) {
      const ip = e.obs>0 ? e.pos/e.obs : 0;
      rows.push([item.id, cat.cat.replace(/^[^ ]+ /,""), item.text, e.obs, e.pos, fmt(ip), getStatus(ip).label, e.note||"", ""]);
    }
  }));
  if (record.obsGeneral) rows.push(["","","OBS. GENERALES:",record.obsGeneral]);
  const ws2 = XLSX.utils.aoa_to_sheet(rows);
  ws2["!cols"] = [{wch:4},{wch:22},{wch:55},{wch:10},{wch:8},{wch:14},{wch:22},{wch:35},{wch:40}];
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle por Ítem");

  const plan = [["ÍTEMS CON OPORTUNIDAD DE MEJORA"],[""],
    ["#","Ítem","% Cumplimiento","Observación","Responsable","Fecha Compromiso","Acción Correctiva","Seguimiento"]];
  record.entries.forEach(e => {
    const ip = e.obs>0 ? e.pos/e.obs : 0;
    if (ip < 0.8) {
      const it = ALL_ITEMS.find(x => x.id === e.id);
      plan.push([e.id, it?.text||"", fmt(ip), e.note||"", "", "", "", ""]);
    }
  });
  const ws3 = XLSX.utils.aoa_to_sheet(plan);
  ws3["!cols"] = [{wch:4},{wch:50},{wch:14},{wch:35},{wch:20},{wch:16},{wch:40},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws3, "Plan de Acción");
  XLSX.writeFile(wb, `Supervision_${record.coordinadora.replace(/ /g,"_")}_${record.fecha}.xlsx`);
}

function exportMonthlyReport(records, month, sedes) {
  const recs = records.filter(r => r.fecha.startsWith(month));
  const wb   = XLSX.utils.book_new();
  const ciudades = [...new Set(sedes.map(s => s.ciudad))];

  const hdr = ["Ciudad","# Supervisiones","Prom. Calificación","% Satisfactorias","% Llamado Verbal","% Proc. Disciplinario",
    "Limpieza %","EPP %","Higiene Manos %","Áreas %","Documentación %"];
  const dataRows = [hdr];
  ciudades.forEach(ciudad => {
    const sc = sedes.filter(s => s.ciudad===ciudad).map(s => s.name);
    const cr = recs.filter(r => sc.includes(r.sede));
    if (!cr.length) return;
    const avg = cr.reduce((s,r) => s+r.score,0) / cr.length;
    const catAvgs = BASE_CHECKLIST.map(cat => {
      let t=0,p=0;
      cr.forEach(r => r.entries.forEach(e => {
        if (cat.items.find(it => it.id===e.id)) { t+=e.obs; p+=e.pos; }
      }));
      return t>0 ? p/t : 0;
    });
    dataRows.push([ciudad, cr.length, fmt(avg),
      fmt(cr.filter(r=>r.score>=0.8).length/cr.length),
      fmt(cr.filter(r=>r.score>=0.65&&r.score<0.8).length/cr.length),
      fmt(cr.filter(r=>r.score<0.65).length/cr.length),
      ...catAvgs.map(fmt)]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet([["INFORME MENSUAL — "+month],["",...dataRows]]);
  ws1["!cols"] = [{wch:20},{wch:16},{wch:18},{wch:18},{wch:18},{wch:20},{wch:14},{wch:10},{wch:16},{wch:12},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen por Ciudad");

  const dh = ["Fecha","Coordinadora","Sede","Ciudad","Calificación","Estado","Obs. Generales"];
  const dr = [dh];
  [...recs].sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(r => {
    const sd = sedes.find(s=>s.name===r.sede)||{ciudad:""};
    dr.push([r.fecha,r.coordinadora,r.sede,sd.ciudad,fmt(r.score),getStatus(r.score).label,r.obsGeneral||""]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(dr);
  ws2["!cols"] = [{wch:12},{wch:22},{wch:30},{wch:18},{wch:14},{wch:22},{wch:50}];
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle Supervisiones");

  const ah = ["Coordinadora","Sede","Ciudad","Calificación","Estado","Observaciones","Acción Requerida"];
  const ar = [["COORDINADORAS QUE REQUIEREN ATENCIÓN — "+month],[""],ah];
  recs.filter(r=>r.score<0.8).sort((a,b)=>a.score-b.score).forEach(r => {
    const sd = sedes.find(s=>s.name===r.sede)||{ciudad:""};
    ar.push([r.coordinadora,r.sede,sd.ciudad,fmt(r.score),getStatus(r.score).label,r.obsGeneral||"",""]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(ar);
  ws3["!cols"] = [{wch:22},{wch:30},{wch:18},{wch:14},{wch:22},{wch:40},{wch:35}];
  XLSX.utils.book_append_sheet(wb, ws3, "Alertas del Mes");
  XLSX.writeFile(wb, `Informe_Mensual_${month}.xlsx`);
}

// ── MICRO COMPONENTS ──────────────────────────────────────────────────────────
function Spark({ data }) {
  if (!data||data.length<2) return <span style={{color:"#94a3b8",fontSize:12}}>—</span>;
  const max=Math.max(...data,1), min=Math.min(...data,0), range=max-min||1, w=60, h=24;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/range)*h}`).join(" ");
  const trend = data[data.length-1]>data[data.length-2]?"#10b981":data[data.length-1]<data[data.length-2]?"#ef4444":"#94a3b8";
  return <svg width={w} height={h}><polyline fill="none" stroke={trend} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts}/></svg>;
}

function Donut({ pct:p, size=64, stroke=8 }) {
  const r=(size-stroke)/2, circ=2*Math.PI*r, dash=circ*p, st=getStatus(p);
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={st.color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray .5s"}}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" fill={st.color}
        fontSize={size*0.22} fontWeight="700" style={{transform:`rotate(90deg) translate(0,-${size}px)`}}>
        {Math.round(p*100)}%
      </text>
    </svg>
  );
}

// ── STYLE TOKENS ──────────────────────────────────────────────────────────────
const S = {
  app:    { fontFamily:"'Segoe UI','Helvetica Neue',sans-serif", background:"#f1f5f9", minHeight:"100vh" },
  hdr:    { background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", color:"#fff",
            padding:"13px 24px", display:"flex", alignItems:"center", justifyContent:"space-between",
            boxShadow:"0 4px 20px rgba(0,0,0,.3)", position:"sticky", top:0, zIndex:100 },
  main:   { padding:"18px 24px", maxWidth:1240, margin:"0 auto" },
  card:   { background:"#fff", borderRadius:12, padding:18, boxShadow:"0 1px 8px rgba(0,0,0,.06)", marginBottom:14 },
  h2:     { fontSize:16, fontWeight:700, margin:"0 0 14px", color:"#1e293b" },
  lbl:    { fontSize:12, fontWeight:600, color:"#475569", marginBottom:3, display:"block" },
  inp:    { width:"100%", padding:"8px 11px", borderRadius:7, border:"1px solid #cbd5e1",
            fontSize:13, fontFamily:"inherit", boxSizing:"border-box" },
  sel:    { width:"100%", padding:"8px 11px", borderRadius:7, border:"1px solid #cbd5e1",
            fontSize:13, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" },
  btn:    (c,sm) => ({ padding:sm?"6px 12px":"9px 20px", borderRadius:7, border:"none", cursor:"pointer",
                       fontWeight:700, fontSize:sm?11:13, background:c, color:"#fff", fontFamily:"inherit",
                       display:"inline-flex", alignItems:"center", gap:4 }),
  btnOut: (c)    => ({ padding:"6px 12px", borderRadius:7, border:`1.5px solid ${c}`, cursor:"pointer",
                       fontWeight:600, fontSize:12, background:"transparent", color:c, fontFamily:"inherit" }),
  th:     { textAlign:"left", padding:"8px 11px", borderBottom:"2px solid #e2e8f0",
            fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".5px" },
  td:     { padding:"9px 11px", borderBottom:"1px solid #f1f5f9", fontSize:12, verticalAlign:"middle" },
  badge:  (st) => ({ display:"inline-block", padding:"2px 9px", borderRadius:20,
                     fontSize:10, fontWeight:700, background:st.bg, color:st.text }),
  kpi:    (c)  => ({ background:"#fff", borderRadius:11, padding:"14px 18px",
                     borderLeft:`4px solid ${c}`, boxShadow:"0 1px 8px rgba(0,0,0,.06)" }),
  tiny:   { padding:"5px 7px", borderRadius:6, border:"1px solid #cbd5e1", fontSize:11,
            width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
};

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]       = useState("dashboard");
  const [records, setRecs]    = useState([]);
  const [photos, setPhotos]   = useState({});    // { recordId: [{dataUrl,caption,itemId}] }
  const [coords, setCoords]   = useState(DEFAULT_COORDS);
  const [sedes, setSedes]     = useState(DEFAULT_SEDES);
  const [loading, setLoad]    = useState(true);
  const [saving, setSave]     = useState(false);
  const [detailCoord, setDC]  = useState(null);
  const [detailRec, setDR]    = useState(null);
  const [monthFilt, setMonth] = useState(new Date().toISOString().slice(0,7));

  const emptyEntries = () => Object.fromEntries(ALL_ITEMS.map(it=>[it.id,{obs:"",pos:"",note:""}]));
  const [form, setForm] = useState({
    coordinadora:"", sede:"",
    fecha: new Date().toISOString().slice(0,10),
    entries: emptyEntries(), obsGeneral:"", formPhotos:[],
  });

  // ── Load from Firebase ─────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const c = await loadConfig("coords", DEFAULT_COORDS);
        const s = await loadConfig("sedes", DEFAULT_SEDES);
        setCoords(c); setSedes(s);

        // Load photos
        const photoSnap = await getDocs(collection(db, "photos"));
        const photoMap = {};
        photoSnap.forEach(d => {
          const data = d.data();
          if (!photoMap[data.recordId]) photoMap[data.recordId] = [];
          photoMap[data.recordId][data.index] = { dataUrl:data.dataUrl, caption:data.caption, itemId:data.itemId };
        });
        setPhotos(photoMap);
      } catch(e) { console.error(e); }
      setLoad(false);
    };

    // Real-time listener for records
    const q = query(collection(db, "records"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q, snap => {
      const recs = snap.docs.map(d => d.data());
      setRecs(recs);
      setLoad(false);
    }, () => setLoad(false));

    init();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!form.coordinadora && coords.length) {
      setForm(p => ({ ...p, coordinadora:coords[0], sede:sedes[0]?.name||"" }));
    }
  }, [coords, sedes]);

  const handlePhotos = async (files, itemId=null) => {
    const compressed = await Promise.all([...files].map(f => compressImage(f)));
    setForm(p => ({ ...p, formPhotos:[...p.formPhotos, ...compressed.map(d=>({dataUrl:d,caption:"",itemId}))] }));
  };

  const submit = async () => {
    const entries = Object.entries(form.entries)
      .map(([id,e]) => ({ id:+id, obs:+e.obs||0, pos:+e.pos||0, note:e.note }))
      .filter(e => e.obs > 0);
    if (!entries.length) { alert("Ingresa al menos un ítem con personas observadas."); return; }
    setSave(true);
    const id = Date.now();
    const rec = { id, coordinadora:form.coordinadora, sede:form.sede, fecha:form.fecha,
                  entries, obsGeneral:form.obsGeneral, score:calcScore(entries) };
    try {
      await saveRecord(rec);
      if (form.formPhotos.length) {
        await savePhotos(id, form.formPhotos);
        setPhotos(p => ({ ...p, [id]:form.formPhotos }));
      }
    } catch(e) { alert("Error al guardar: "+e.message); }
    setSave(false);
    setForm(p => ({ ...p, entries:emptyEntries(), obsGeneral:"", formPhotos:[] }));
    setView("dashboard");
  };

  const delRecord = async (id) => {
    setSave(true);
    try { await deleteRecord_fb(id); }
    catch(e) { alert("Error: "+e.message); }
    setPhotos(p => { const n={...p}; delete n[id]; return n; });
    if (detailRec?.id === id) setDR(null);
    setSave(false);
  };

  const updateCoords = async (c) => { setCoords(c); await saveConfig("coords", c); };
  const updateSedes  = async (s) => { setSedes(s);  await saveConfig("sedes", s);  };

  // ── Aggregations ───────────────────────────────────────────────────────────
  const cStats = coords.map(c => {
    const rs = [...records.filter(r=>r.coordinadora===c)].sort((a,b)=>a.fecha.localeCompare(b.fecha));
    const last = rs[rs.length-1];
    return { name:c, total:rs.length, last, spark:rs.slice(-6).map(r=>r.score) };
  });
  const wd = cStats.filter(c => c.last);
  const avgG = wd.length ? wd.reduce((s,c)=>s+c.last.score,0)/wd.length : 0;
  const catBD = BASE_CHECKLIST.map(cat => {
    let t=0,p=0;
    records.forEach(r => r.entries.forEach(e => {
      if (cat.items.find(it=>it.id===e.id)) { t+=e.obs; p+=e.pos; }
    }));
    return { label:cat.cat.replace(/^[^ ]+ /,""), val:t>0?p/t:0 };
  });
  const months = [...new Set(records.map(r=>r.fecha.slice(0,7)))].sort().reverse();

  const NAV = [
    {id:"dashboard", l:"🏠 Dashboard"},
    {id:"nueva",     l:"➕ Nueva Supervisión"},
    {id:"indicadores",l:"📊 Indicadores"},
    {id:"settings",  l:"⚙️ Configuración"},
  ];

  const Header = () => (
    <div style={S.hdr}>
      <div>
        <div style={{fontSize:16,fontWeight:800,letterSpacing:"-0.5px"}}>📋 Supervisión Regional</div>
        <div style={{fontSize:10,opacity:.55,marginTop:1}}>HSA-80 · Sistema de Verificación de Actividades</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        {saving && <span style={{fontSize:10,opacity:.7}}>💾 Guardando...</span>}
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {NAV.map(n => (
            <button key={n.id} style={{padding:"6px 13px",borderRadius:7,border:"none",cursor:"pointer",
              fontWeight:600,fontSize:11,background:view===n.id?"#3b82f6":"rgba(255,255,255,.12)",color:"#fff"}}
              onClick={()=>{setDC(null);setDR(null);setView(n.id);}}>
              {n.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>📋</div>
        <div style={{color:"#64748b",fontSize:14}}>Conectando con Firebase...</div>
      </div>
    </div>
  );

  // ── DETAIL RECORD ──────────────────────────────────────────────────────────
  if (detailRec) {
    const st=getStatus(detailRec.score), rph=photos[detailRec.id]||[];
    return (
      <div style={S.app}><Header/>
        <div style={S.main}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <button style={S.btnOut("#64748b")} onClick={()=>setDR(null)}>← Volver</button>
            <h2 style={{...S.h2,margin:0,flex:1}}>Detalle de Supervisión</h2>
            <button style={S.btn("#10b981",true)} onClick={()=>exportCoordExcel(detailRec,sedes)}>⬇️ Excel + Plan de Acción</button>
            <button style={S.btn("#ef4444",true)} onClick={()=>{if(confirm("¿Eliminar este registro?"))delRecord(detailRec.id);}}>🗑 Eliminar</button>
          </div>
          <div style={{...S.card,borderLeft:`4px solid ${st.color}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>{detailRec.coordinadora}</div>
              <div style={{color:"#64748b",fontSize:13}}>{detailRec.sede} · {detailRec.fecha}</div>
              <div style={{marginTop:6,display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={S.badge(st)}>{st.label}</span>
                <span style={{fontSize:12,color:"#64748b"}}>Obs: {detailRec.entries.reduce((s,e)=>s+e.obs,0)} · Pos: {detailRec.entries.reduce((s,e)=>s+e.pos,0)}</span>
              </div>
            </div>
            <Donut pct={detailRec.score} size={76} stroke={9}/>
          </div>
          <div style={S.card}>
            <h3 style={{...S.h2,fontSize:13}}>Detalle por Ítem</h3>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
                <thead><tr>
                  <th style={S.th}>Categoría</th><th style={S.th}>Ítem</th>
                  <th style={S.th}>Obs.</th><th style={S.th}>Pos.</th><th style={S.th}>%</th><th style={S.th}>Nota</th>
                </tr></thead>
                <tbody>
                  {BASE_CHECKLIST.map(cat=>cat.items.map(item=>{
                    const e=detailRec.entries.find(x=>x.id===item.id); if(!e) return null;
                    const ip=e.obs>0?e.pos/e.obs:0, ist=getStatus(ip);
                    return (<tr key={item.id}>
                      <td style={{...S.td,fontSize:10,color:"#64748b",whiteSpace:"nowrap"}}>{cat.cat.replace(/^[^ ]+ /,"")}</td>
                      <td style={S.td}>{item.text}</td>
                      <td style={{...S.td,textAlign:"center"}}>{e.obs}</td>
                      <td style={{...S.td,textAlign:"center"}}>{e.pos}</td>
                      <td style={S.td}><span style={S.badge(ist)}>{fmt(ip)}</span></td>
                      <td style={{...S.td,fontSize:11,color:"#64748b"}}>{e.note||"—"}</td>
                    </tr>);
                  }))}
                </tbody>
              </table>
            </div>
          </div>
          {detailRec.obsGeneral && (
            <div style={{...S.card,background:"#f8fafc"}}>
              <strong style={{fontSize:12}}>Observaciones Generales:</strong>
              <p style={{margin:"6px 0 0",color:"#475569",fontSize:13}}>{detailRec.obsGeneral}</p>
            </div>
          )}
          {rph.length>0 && (
            <div style={S.card}>
              <h3 style={{...S.h2,fontSize:13}}>📸 Evidencia Fotográfica ({rph.length})</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                {rph.filter(Boolean).map((ph,i) => (
                  <div key={i} style={{borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0"}}>
                    <img src={ph.dataUrl} alt="" style={{width:"100%",height:130,objectFit:"cover",display:"block"}}/>
                    {ph.caption && <div style={{padding:"5px 8px",fontSize:11,color:"#64748b",background:"#f8fafc"}}>{ph.caption}</div>}
                    {ph.itemId  && <div style={{padding:"0 8px 5px",fontSize:10,color:"#3b82f6"}}>Ítem #{ph.itemId}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── COORD HISTORY ──────────────────────────────────────────────────────────
  if (detailCoord) {
    const crs = [...records.filter(r=>r.coordinadora===detailCoord)].sort((a,b)=>b.fecha.localeCompare(a.fecha));
    return (
      <div style={S.app}><Header/>
        <div style={S.main}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button style={S.btnOut("#64748b")} onClick={()=>setDC(null)}>← Volver</button>
            <h2 style={{...S.h2,margin:0,flex:1}}>Historial — {detailCoord}</h2>
          </div>
          {!crs.length
            ? <div style={{...S.card,textAlign:"center",padding:40,color:"#94a3b8"}}>Sin registros para esta coordinadora.</div>
            : crs.map(r => {
              const st=getStatus(r.score), rph=photos[r.id]||[];
              return (
                <div key={r.id} style={{...S.card,borderLeft:`4px solid ${st.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{r.sede}</div>
                      <div style={{color:"#64748b",fontSize:12}}>{r.fecha}</div>
                      {rph.length>0 && <div style={{fontSize:11,color:"#0ea5e9",marginTop:2}}>📸 {rph.length} foto(s)</div>}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={S.badge(st)}>{st.label}</span>
                      <Donut pct={r.score} size={48} stroke={6}/>
                      <button style={S.btn("#3b82f6",true)} onClick={()=>setDR(r)}>Ver Detalle →</button>
                      <button style={S.btn("#10b981",true)} onClick={()=>exportCoordExcel(r,sedes)}>⬇️ Excel</button>
                      <button onClick={()=>{if(confirm("¿Eliminar?"))delRecord(r.id);}}
                        style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:16}}>🗑</button>
                    </div>
                  </div>
                  {rph.length>0 && (
                    <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:2}}>
                      {rph.filter(Boolean).map((ph,i) => (
                        <img key={i} src={ph.dataUrl} alt="" style={{height:60,width:60,objectFit:"cover",borderRadius:6,border:"1px solid #e2e8f0",flexShrink:0}}/>
                      ))}
                    </div>
                  )}
                </div>
              );
          })}
        </div>
      </div>
    );
  }

  // ── NUEVA SUPERVISIÓN ──────────────────────────────────────────────────────
  if (view === "nueva") {
    const ItemPhotoBtn = ({ itemId }) => {
      const ref = useRef();
      const cnt = form.formPhotos.filter(p=>p.itemId===itemId).length;
      return (
        <>
          <input ref={ref} type="file" accept="image/*" multiple capture="environment"
            style={{display:"none"}} onChange={e=>handlePhotos(e.target.files,itemId)}/>
          <button type="button" style={{...S.btn("#0ea5e9",true),fontSize:10,padding:"4px 8px"}}
            onClick={()=>ref.current.click()}>📷{cnt>0?` (${cnt})`:""}</button>
        </>
      );
    };
    const GenPhotoBtn = () => {
      const ref = useRef();
      return (
        <>
          <input ref={ref} type="file" accept="image/*" multiple capture="environment"
            style={{display:"none"}} onChange={e=>handlePhotos(e.target.files,null)}/>
          <button type="button" style={S.btn("#0ea5e9",true)} onClick={()=>ref.current.click()}>📷 Agregar foto general</button>
        </>
      );
    };
    return (
      <div style={S.app}><Header/>
        <div style={S.main}>
          <div style={S.card}>
            <h2 style={S.h2}>➕ Registrar Nueva Supervisión</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14,marginBottom:20}}>
              <div><label style={S.lbl}>Coordinadora</label>
                <select style={S.sel} value={form.coordinadora} onChange={e=>setForm(p=>({...p,coordinadora:e.target.value}))}>
                  {coords.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={S.lbl}>Sede / Centro de Trabajo</label>
                <select style={S.sel} value={form.sede} onChange={e=>setForm(p=>({...p,sede:e.target.value}))}>
                  {sedes.map(s=><option key={s.name} value={s.name}>{s.name} ({s.ciudad})</option>)}</select></div>
              <div><label style={S.lbl}>Fecha de Supervisión</label>
                <input type="date" style={S.inp} value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))}/></div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 72px 72px 140px 90px",gap:5,
              padding:"5px 0",borderBottom:"2px solid #e2e8f0",marginBottom:6}}>
              {["ÍTEM","Obs.","Pos.","Nota","Foto"].map(h=>(
                <div key={h} style={{fontSize:10,fontWeight:700,color:"#64748b"}}>{h}</div>
              ))}
            </div>

            {BASE_CHECKLIST.map(cat=>(
              <div key={cat.cat}>
                <div style={{fontSize:12,fontWeight:700,color:"#3b82f6",padding:"9px 0 3px",borderBottom:"1px solid #e2e8f0",marginBottom:5}}>{cat.cat}</div>
                {cat.items.map(item=>{
                  const e=form.entries[item.id];
                  const ip=+e.obs>0?(+e.pos)/(+e.obs):null;
                  return (
                    <div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr 72px 72px 140px 90px",
                      gap:5,alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f8fafc"}}>
                      <div style={{fontSize:11,color:"#334155",display:"flex",alignItems:"center",gap:5}}>
                        {ip!==null && <span style={{width:6,height:6,borderRadius:"50%",background:getStatus(ip).color,flexShrink:0,display:"inline-block"}}/>}
                        {item.text}
                      </div>
                      <input type="number" min="0" placeholder="0" style={S.tiny} value={e.obs}
                        onChange={ev=>setForm(p=>({...p,entries:{...p.entries,[item.id]:{...p.entries[item.id],obs:ev.target.value}}}))}/>
                      <input type="number" min="0" placeholder="0" style={S.tiny} value={e.pos}
                        onChange={ev=>setForm(p=>({...p,entries:{...p.entries,[item.id]:{...p.entries[item.id],pos:ev.target.value}}}))}/>
                      <input type="text" placeholder="Nota..." style={S.tiny} value={e.note}
                        onChange={ev=>setForm(p=>({...p,entries:{...p.entries,[item.id]:{...p.entries[item.id],note:ev.target.value}}}))}/>
                      <ItemPhotoBtn itemId={item.id}/>
                    </div>
                  );
                })}
              </div>
            ))}

            <div style={{marginTop:18,display:"grid",gridTemplateColumns:"1fr auto",gap:14,alignItems:"start"}}>
              <div><label style={S.lbl}>Observaciones Generales</label>
                <textarea style={{...S.inp,height:72,resize:"vertical"}} value={form.obsGeneral}
                  onChange={e=>setForm(p=>({...p,obsGeneral:e.target.value}))} placeholder="Observaciones generales de la visita..."/></div>
              <div style={{paddingTop:18}}><GenPhotoBtn/></div>
            </div>

            {form.formPhotos.length>0 && (
              <div style={{marginTop:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:6}}>📸 Fotos adjuntas ({form.formPhotos.length})</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {form.formPhotos.map((ph,i)=>(
                    <div key={i} style={{position:"relative"}}>
                      <img src={ph.dataUrl} alt="" style={{width:76,height:76,objectFit:"cover",borderRadius:7,border:"1px solid #e2e8f0"}}/>
                      {ph.itemId && <div style={{position:"absolute",top:2,left:2,background:"#3b82f6",color:"#fff",fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:3}}>#{ph.itemId}</div>}
                      <button onClick={()=>setForm(p=>({...p,formPhotos:p.formPhotos.filter((_,j)=>j!==i)}))}
                        style={{position:"absolute",top:-5,right:-5,background:"#ef4444",color:"#fff",border:"none",
                          borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:9,fontWeight:700,
                          display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
                      <input placeholder="Pie de foto..." value={ph.caption}
                        onChange={ev=>setForm(p=>({...p,formPhotos:p.formPhotos.map((x,j)=>j===i?{...x,caption:ev.target.value}:x)}))}
                        style={{display:"block",width:76,marginTop:2,fontSize:9,padding:"2px 4px",border:"1px solid #e2e8f0",borderRadius:3,boxSizing:"border-box"}}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button style={S.btn("#3b82f6")} onClick={submit} disabled={saving}>
                {saving?"⏳ Guardando...":"💾 Guardar Supervisión"}
              </button>
              <button style={S.btn("#64748b")} onClick={()=>setView("dashboard")}>Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── INDICADORES ────────────────────────────────────────────────────────────
  if (view === "indicadores") {
    const mr = records.filter(r=>r.fecha.startsWith(monthFilt));
    const ciudades = [...new Set(sedes.map(s=>s.ciudad))];
    const cityData = ciudades.map(c=>{
      const sc=sedes.filter(s=>s.ciudad===c).map(s=>s.name);
      const cr=mr.filter(r=>sc.includes(r.sede));
      return { ciudad:c, count:cr.length, avg:cr.length?cr.reduce((s,r)=>s+r.score,0)/cr.length:null };
    }).filter(c=>c.count>0);

    return (
      <div style={S.app}><Header/>
        <div style={S.main}>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <h2 style={{...S.h2,margin:0,flex:1}}>📊 Indicadores</h2>
            <select style={{...S.sel,width:150}} value={monthFilt} onChange={e=>setMonth(e.target.value)}>
              {months.length ? months.map(m=><option key={m} value={m}>{m}</option>) : <option value={monthFilt}>{monthFilt}</option>}
            </select>
            <button style={S.btn("#10b981")} onClick={()=>{
              if(!mr.length){alert("No hay datos para este mes.");return;}
              exportMonthlyReport(records,monthFilt,sedes);
            }}>⬇️ Informe Mensual por Ciudad</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:14}}>
            <div style={S.card}>
              <h3 style={{...S.h2,fontSize:13}}>📊 Cumplimiento por Categoría (global)</h3>
              {!records.length ? <div style={{color:"#94a3b8",textAlign:"center",padding:16}}>Sin datos</div>
                : catBD.map(c=>{ const st=getStatus(c.val); return (
                  <div key={c.label} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <span style={{fontSize:11,flex:1}}>{c.label}</span>
                    <div style={{width:100,height:5,background:"#e2e8f0",borderRadius:3,flexShrink:0}}>
                      <div style={{width:`${c.val*100}%`,height:"100%",background:st.color,borderRadius:3}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:st.color,width:34,textAlign:"right"}}>{fmt(c.val)}</span>
                  </div>
                );})}
            </div>
            <div style={S.card}>
              <h3 style={{...S.h2,fontSize:13}}>🏙️ Por Ciudad — {monthFilt}</h3>
              {!cityData.length ? <div style={{color:"#94a3b8",textAlign:"center",padding:16}}>Sin supervisiones en este período</div>
                : cityData.map(c=>{ const st=getStatus(c.avg); return (
                  <div key={c.ciudad} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <span style={{fontSize:13,fontWeight:600,flex:1}}>{c.ciudad}</span>
                    <span style={{fontSize:11,color:"#64748b"}}>{c.count} sup.</span>
                    <div style={{width:80,height:5,background:"#e2e8f0",borderRadius:3}}>
                      <div style={{width:`${c.avg*100}%`,height:"100%",background:st.color,borderRadius:3}}/>
                    </div>
                    <span style={{fontWeight:800,color:st.color,width:36,textAlign:"right",fontSize:13}}>{fmt(c.avg)}</span>
                  </div>
                );})}
            </div>
            <div style={S.card}>
              <h3 style={{...S.h2,fontSize:13}}>🏆 Ranking de Coordinadoras</h3>
              {!wd.length ? <div style={{color:"#94a3b8",textAlign:"center",padding:16}}>Sin datos</div>
                : [...wd].sort((a,b)=>b.last.score-a.last.score).map((c,i)=>{ const st=getStatus(c.last.score); return (
                  <div key={c.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",
                    borderBottom:"1px solid #f1f5f9",cursor:"pointer"}} onClick={()=>setDC(c.name)}>
                    <span style={{width:20,height:20,borderRadius:"50%",flexShrink:0,
                      background:i<3?["#f59e0b","#94a3b8","#b45309"][i]:"#e2e8f0",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:9,fontWeight:800,color:i<3?"#fff":"#64748b"}}>{i+1}</span>
                    <span style={{flex:1,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                    <Spark data={c.spark}/>
                    <span style={{fontWeight:800,color:st.color,width:36,textAlign:"right",fontSize:13}}>{fmt(c.last.score)}</span>
                  </div>
                );})}
            </div>
            <div style={S.card}>
              <h3 style={{...S.h2,fontSize:13}}>⚠️ Requieren Atención</h3>
              {!wd.filter(c=>c.last.score<0.8).length
                ? <div style={{textAlign:"center",padding:16,color:"#10b981",fontSize:13}}>🎉 ¡Todas satisfactorias!</div>
                : wd.filter(c=>c.last.score<0.8).sort((a,b)=>a.last.score-b.last.score).map(c=>{ const st=getStatus(c.last.score); return (
                  <div key={c.name} style={{padding:"9px 12px",borderRadius:8,background:st.bg,marginBottom:7,cursor:"pointer"}} onClick={()=>setDC(c.name)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:12,color:st.text}}>{c.name}</div>
                        <div style={{fontSize:10,color:st.text,opacity:.8}}>{c.last.sede} · {c.last.fecha}</div>
                      </div>
                      <span style={{fontWeight:800,fontSize:16,color:st.color}}>{fmt(c.last.score)}</span>
                    </div>
                  </div>
                );})}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  if (view === "settings") {
    return <SettingsPanel coords={coords} sedes={sedes}
      onSaveCoords={updateCoords} onSaveSedes={updateSedes} Header={Header}/>;
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  return (
    <div style={S.app}><Header/>
      <div style={S.main}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
          <div style={S.kpi("#3b82f6")}><div style={{fontSize:28,fontWeight:800}}>{records.length}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>Total Supervisiones</div></div>
          <div style={S.kpi("#10b981")}><div style={{fontSize:28,fontWeight:800}}>{wd.filter(c=>c.last.score>=0.8).length}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>✅ Satisfactorias</div></div>
          <div style={S.kpi("#f59e0b")}><div style={{fontSize:28,fontWeight:800}}>{wd.filter(c=>c.last.score>=0.65&&c.last.score<0.8).length}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>⚠️ Llamado Verbal</div></div>
          <div style={S.kpi("#ef4444")}><div style={{fontSize:28,fontWeight:800}}>{wd.filter(c=>c.last.score<0.65).length}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>🔴 Proc. Disciplinario</div></div>
        </div>

        {wd.length>0 && (
          <div style={{...S.card,display:"flex",alignItems:"center",gap:18,marginBottom:14,flexWrap:"wrap"}}>
            <Donut pct={avgG} size={72} stroke={8}/>
            <div>
              <div style={{fontSize:18,fontWeight:800}}>Promedio Global: {fmt(avgG)}</div>
              <div style={{color:"#64748b",fontSize:12}}>{wd.length} coordinadoras supervisadas · {records.length} visitas totales</div>
              <span style={S.badge(getStatus(avgG))}>{getStatus(avgG).label}</span>
            </div>
            <div style={{marginLeft:"auto"}}>
              <button style={S.btn("#3b82f6")} onClick={()=>setView("nueva")}>➕ Nueva Supervisión</button>
            </div>
          </div>
        )}

        <div style={S.card}>
          <h2 style={S.h2}>Coordinadoras ({coords.length})</h2>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead><tr>
                <th style={S.th}>Coordinadora</th><th style={S.th}>Última Supervisión</th>
                <th style={S.th}>Sede</th><th style={S.th}>Tendencia</th>
                <th style={S.th}>Puntaje</th><th style={S.th}>Estado</th>
                <th style={S.th}>Visitas</th><th style={S.th}></th>
              </tr></thead>
              <tbody>
                {cStats.map(c=>{
                  const st=c.last?getStatus(c.last.score):null;
                  const rph=c.last?photos[c.last.id]||[]:[];
                  return (
                    <tr key={c.name} style={{cursor:"pointer"}} onClick={()=>setDC(c.name)}>
                      <td style={{...S.td,fontWeight:600}}>{c.name}</td>
                      <td style={S.td}>{c.last?c.last.fecha:<span style={{color:"#94a3b8"}}>Sin registro</span>}</td>
                      <td style={{...S.td,fontSize:11,color:"#64748b"}}>{c.last?c.last.sede:"—"}</td>
                      <td style={S.td}><Spark data={c.spark}/></td>
                      <td style={{...S.td,fontWeight:700}}>
                        {c.last ? <><span style={{color:st.color}}>{fmt(c.last.score)}</span>{rph.length>0&&<span style={{fontSize:9,color:"#0ea5e9",marginLeft:3}}>📸{rph.length}</span>}</> : "—"}
                      </td>
                      <td style={S.td}>{st?<span style={S.badge(st)}>{st.label}</span>:<span style={{color:"#94a3b8",fontSize:11}}>Pendiente</span>}</td>
                      <td style={S.td}>{c.total||<span style={{color:"#94a3b8"}}>0</span>}</td>
                      <td style={S.td}>
                        <button onClick={e=>{e.stopPropagation();setDC(c.name);}}
                          style={{background:"none",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:11,color:"#3b82f6",fontWeight:600}}>Ver →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!records.length && (
          <div style={{...S.card,textAlign:"center",padding:52}}>
            <div style={{fontSize:44,marginBottom:10}}>📋</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:7}}>¡Empieza a registrar supervisiones!</div>
            <div style={{color:"#64748b",marginBottom:18,fontSize:13}}>Haz clic en "Nueva Supervisión" para comenzar.</div>
            <button style={S.btn("#3b82f6")} onClick={()=>setView("nueva")}>➕ Registrar Primera Supervisión</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────────────
function SettingsPanel({ coords, sedes, onSaveCoords, onSaveSedes, Header }) {
  const [tab, setTab]           = useState("coords");
  const [newC, setNewC]         = useState("");
  const [editC, setEditC]       = useState(null);
  const [editCVal, setEditCVal] = useState("");
  const [newS, setNewS]         = useState({ name:"", ciudad:"" });
  const [editS, setEditS]       = useState(null);
  const [editSVal, setEditSVal] = useState({ name:"", ciudad:"" });

  const SI = {
    row: { display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:"1px solid #f1f5f9" },
    inp: { padding:"7px 10px", borderRadius:7, border:"1px solid #cbd5e1", fontSize:13, fontFamily:"inherit", flex:1 },
    btn: c => ({ padding:"6px 12px", borderRadius:7, border:"none", cursor:"pointer", fontWeight:600, fontSize:12, background:c, color:"#fff", fontFamily:"inherit" }),
  };

  return (
    <div style={{ fontFamily:"'Segoe UI','Helvetica Neue',sans-serif", background:"#f1f5f9", minHeight:"100vh" }}>
      <Header/>
      <div style={{ padding:"18px 24px", maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ fontSize:16, fontWeight:700, margin:"0 0 14px" }}>⚙️ Configuración</h2>
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          <button style={SI.btn(tab==="coords"?"#3b82f6":"#94a3b8")} onClick={()=>setTab("coords")}>👥 Coordinadoras ({coords.length})</button>
          <button style={SI.btn(tab==="sedes"?"#3b82f6":"#94a3b8")} onClick={()=>setTab("sedes")}>🏥 Sedes / Centros ({sedes.length})</button>
        </div>

        <div style={{ background:"#fff", borderRadius:12, padding:18, boxShadow:"0 1px 8px rgba(0,0,0,.06)" }}>
          {tab==="coords" && <>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input style={SI.inp} placeholder="Nombre de la nueva coordinadora..."
                value={newC} onChange={e=>setNewC(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&newC.trim()){ onSaveCoords([...coords,newC.trim()]); setNewC(""); } }}/>
              <button style={SI.btn("#10b981")} onClick={()=>{ if(newC.trim()){ onSaveCoords([...coords,newC.trim()]); setNewC(""); } }}>+ Agregar</button>
            </div>
            {coords.map((c,i)=>(
              <div key={i} style={SI.row}>
                {editC===i ? (
                  <>
                    <input style={SI.inp} value={editCVal} onChange={e=>setEditCVal(e.target.value)} autoFocus/>
                    <button style={SI.btn("#3b82f6")} onClick={()=>{ if(editCVal.trim()){ const u=[...coords]; u[i]=editCVal.trim(); onSaveCoords(u); } setEditC(null); }}>✓ Guardar</button>
                    <button style={SI.btn("#94a3b8")} onClick={()=>setEditC(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex:1, fontSize:13 }}>{c}</span>
                    <button style={SI.btn("#f59e0b")} onClick={()=>{ setEditC(i); setEditCVal(c); }}>✏️ Editar</button>
                    <button style={SI.btn("#ef4444")} onClick={()=>{ if(confirm(`¿Eliminar a ${c}?`)) onSaveCoords(coords.filter((_,j)=>j!==i)); }}>🗑</button>
                  </>
                )}
              </div>
            ))}
          </>}

          {tab==="sedes" && <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:8, marginBottom:14 }}>
              <input style={SI.inp} placeholder="Nombre de la sede..." value={newS.name} onChange={e=>setNewS(p=>({...p,name:e.target.value}))}/>
              <input style={SI.inp} placeholder="Ciudad..." value={newS.ciudad} onChange={e=>setNewS(p=>({...p,ciudad:e.target.value}))}/>
              <button style={SI.btn("#10b981")} onClick={()=>{ if(newS.name.trim()&&newS.ciudad.trim()){ onSaveSedes([...sedes,{...newS}]); setNewS({name:"",ciudad:""}); } }}>+ Agregar</button>
            </div>
            {sedes.map((s,i)=>(
              <div key={i} style={SI.row}>
                {editS===i ? (
                  <>
                    <input style={{...SI.inp,flex:2}} value={editSVal.name} onChange={e=>setEditSVal(p=>({...p,name:e.target.value}))} autoFocus/>
                    <input style={SI.inp} value={editSVal.ciudad} onChange={e=>setEditSVal(p=>({...p,ciudad:e.target.value}))}/>
                    <button style={SI.btn("#3b82f6")} onClick={()=>{ if(editSVal.name.trim()&&editSVal.ciudad.trim()){ const u=[...sedes]; u[i]={...editSVal}; onSaveSedes(u); } setEditS(null); }}>✓</button>
                    <button style={SI.btn("#94a3b8")} onClick={()=>setEditS(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex:2, fontSize:13, fontWeight:600 }}>{s.name}</span>
                    <span style={{ fontSize:12, color:"#64748b", flex:1 }}>{s.ciudad}</span>
                    <button style={SI.btn("#f59e0b")} onClick={()=>{ setEditS(i); setEditSVal({...s}); }}>✏️ Editar</button>
                    <button style={SI.btn("#ef4444")} onClick={()=>{ if(confirm(`¿Eliminar ${s.name}?`)) onSaveSedes(sedes.filter((_,j)=>j!==i)); }}>🗑</button>
                  </>
                )}
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  );
}
