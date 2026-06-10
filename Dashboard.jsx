import {useState,useEffect} from 'react';
export default function Dashboard(){
 const [meals,setMeals]=useState(()=>JSON.parse(localStorage.getItem('meals')||'[]'));
 const [name,setName]=useState('');
 const [cal,setCal]=useState('');
 useEffect(()=>localStorage.setItem('meals',JSON.stringify(meals)),[meals]);
 const total=meals.reduce((a,m)=>a+m.calories,0);
 return <div>
 <h2>Today's Calories: {total}</h2>
 <input placeholder='Food' value={name} onChange={e=>setName(e.target.value)}/>
 <input placeholder='Calories' value={cal} onChange={e=>setCal(e.target.value)}/>
 <button onClick={()=>{setMeals([...meals,{name,calories:Number(cal)}]);setName('');setCal('')}}>Add</button>
 {meals.map((m,i)=><div key={i}>{m.name} - {m.calories}</div>)}
 </div>
}
