const EXPLANATIONS={
 probability:{title:'Probability Transport',text:'Redistributes a normalized probability vector around its native circular grid. Four changing inputs are checked against an independent diffusion calculation.'},
 wave:{title:'Travelling Wave',text:'Advances the saved specimen’s driven angular phase. The issued boundary is checked against the wave equation; the transported density response is a separate quantity.'},
 word64:{title:'64-bit Word / Subtraction',text:'Encodes changing operands in paired density channels and performs exact subtraction modulo 2⁶⁴. Underflow, large values and saved-session recovery are checked.'}
};
export function mountSelectedCrystals({root=document.getElementById('selected-crystal-evaluation'),api=window.lotus}={}){
 if(!root)return;
 const select=root.querySelector('[data-crystal]'),button=root.querySelector('[data-run-selected]'),status=root.querySelector('[data-selected-status]'),help=root.querySelector('[data-selected-help]'),rows=root.querySelector('tbody');
 let timer=null,disposed=false;
 const explain=()=>{help.textContent=EXPLANATIONS[select.value]?.text || '';};select.onchange=explain;explain();
 function render(s){
  const busy=s.status==='running';button.disabled=busy;select.disabled=busy;rows.replaceChildren();
  status.textContent=s.status==='complete'?`${EXPLANATIONS[s.key].title}: ${s.summary.cases}/4 independently checked · two recovery followups matched.`:busy?`Running ${EXPLANATIONS[s.key].title}…`:s.status==='failed'?s.error:s.status==='stopped'?'Evaluation stopped.':'Ready. Choose a crystal and run its four source-backed cases.';
  for(const r of s.summary?.rows || []){const tr=document.createElement('tr');for(const value of [r.job+1,r.result,r.error.toExponential(2),r.sourceTime.toFixed(5)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}rows.append(tr);}
 }
 async function refresh(){try{const s=await api.selectedCrystalStatus();if(disposed)return;render(s);if(s.status==='running')timer=setTimeout(refresh,250);}catch{status.textContent='Selected crystal evaluation is unavailable.';button.disabled=false;}}
 button.onclick=async()=>{clearTimeout(timer);button.disabled=true;select.disabled=true;try{const s=await api.runSelectedCrystal(select.value);render(s);if(s.status==='running')timer=setTimeout(refresh,250);}catch{status.textContent='Could not start the selected evaluation.';button.disabled=false;select.disabled=false;}};
 let ready=Promise.resolve();if(!api?.selectedCrystalStatus||!api?.runSelectedCrystal){button.disabled=true;status.textContent='Open the updated Lotus Electron application to run these cases.';}else ready=refresh();
 return {ready,refresh,dispose(){disposed=true;clearTimeout(timer);button.onclick=null;select.onchange=null;}};
}
if(typeof document!=='undefined')mountSelectedCrystals();
