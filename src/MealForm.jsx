import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';

export default function MealForm({meal,api,Modal,today,onClose,onSaved}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const editing=Boolean(meal);
  const moods=[...new Set(['Satisfied','Energized','Still hungry','Comforted','Neutral',meal?.mood].filter(Boolean))];
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');
    const fields=Object.fromEntries(new FormData(e.currentTarget));
    for(const field of ['calories','protein','fiber'])fields[field]=Number(fields[field]);
    try{await api(editing?'/meals/'+encodeURIComponent(meal.id):'/meals',{method:editing?'PATCH':'POST',body:fields});await onSaved();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Modal title={editing?'A little update to your food story.':'What’s on your plate?'} subtitle={editing?'Correct the details below. Your changes will update this entry.':'A memory of your meal, without the judgement.'} onClose={onClose}>
    <form onSubmit={submit}>
      <label>Meal name<input name="name" required maxLength="100" defaultValue={meal?.name||''} placeholder="e.g. Tinola, rice & a little comfort"/></label>
      <div className="form-grid">
        <label>Meal type<select name="type" defaultValue={meal?.type||'breakfast'}>{['breakfast','lunch','dinner','snack'].map(type=><option value={type} key={type}>{type[0].toUpperCase()+type.slice(1)}</option>)}</select></label>
        <label>How did it feel?<select name="mood" defaultValue={meal?.mood||'Satisfied'}>{moods.map(mood=><option key={mood}>{mood}</option>)}</select></label>
        <label>Date<input type="date" name="date" required defaultValue={meal?.date||today()} max={today()}/></label>
        <label>Time (Philippine time)<input type="time" name="time" required defaultValue={meal?.time||new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'})}/></label>
      </div>
      <div className="field-divider">OPTIONAL NUTRITION ESTIMATES</div>
      <div className="form-grid thirds">
        <label>Energy (kcal)<input name="calories" type="number" min="0" max="10000" step="0.1" defaultValue={meal?.calories??''} placeholder="0"/></label>
        <label>Protein (g)<input name="protein" type="number" min="0" max="1000" step="0.1" defaultValue={meal?.protein??''} placeholder="0"/></label>
        <label>Fiber (g)<input name="fiber" type="number" min="0" max="1000" step="0.1" defaultValue={meal?.fiber??''} placeholder="0"/></label>
      </div>
      <label>A little note<textarea name="note" rows="3" maxLength="1000" defaultValue={meal?.note||''} placeholder="What did you enjoy? Anything you’d like your dietitian to know?"/></label>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Add to my food story'}{editing?<Check size={17}/>:<Plus size={17}/>}</button></div>
    </form>
  </Modal>;
}
