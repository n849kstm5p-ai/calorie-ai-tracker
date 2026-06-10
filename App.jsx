import { useState, useRef, useCallback, useEffect } from "react";
import { scanImage } from "./lib/scan";

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 250, fat: 65 };

const COLORS = {
  bg: "#0F0F12", card: "#1A1A20", cardBorder: "#2A2A35",
  accent: "#7EE8A2", accentDim: "#7EE8A220", accentText: "#4ade80",
  protein: "#60a5fa", carbs: "#f59e0b", fat: "#f472b6",
  text: "#F0F0F5", muted: "#7070A0", danger: "#f87171",
};

const MEAL_TIMES = ["Breakfast", "Lunch", "Dinner", "Snack"];

// --- Storage helpers ---
const STORAGE_KEY = "calai_data";
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { meals: {}, goals: DEFAULT_GOALS };
  } catch { return { meals: {}, goals: DEFAULT_GOALS }; }
}
function saveStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// --- Date helpers ---
function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}
function formatDateLabel(dateKey) {
  const d = new Date(dateKey + "T12:00:00");
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function getDayLabel(dateKey) {
  const d = new Date(dateKey + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long" });
}
function addDays(dateKey, n) {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

// --- Components ---
function MacroBar({ label, value, goal, color }) {
  const pct = Math.min((value / goal) * 100, 100);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700 }}>{value}<span style={{ color: COLORS.muted, fontWeight: 400 }}>/{goal}g</span></span>
      </div>
      <div style={{ height: 5, borderRadius: 9999, background: COLORS.cardBorder, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 9999, background: color, transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

function CalorieRing({ consumed, goal }) {
  const pct = Math.min(consumed / goal, 1);
  const r = 52, circ = 2 * Math.PI * r;
  const over = consumed > goal;
  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke={COLORS.cardBorder} strokeWidth={10} />
        <circle cx={70} cy={70} r={r} fill="none" stroke={over ? COLORS.danger : COLORS.accent}
          strokeWidth={10} strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.text, lineHeight: 1 }}>{consumed}</span>
        <span style={{ fontSize: 10, color: COLORS.muted, marginTop: 2, letterSpacing: "0.08em" }}>EATEN</span>
        <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: over ? COLORS.danger : COLORS.accentText }}>
          {over ? `+${consumed - goal}` : `${goal - consumed} left`}
        </span>
      </div>
    </div>
  );
}

function FoodItem({ item, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
        {item.emoji || "🍽️"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>P {item.protein}g · C {item.carbs}g · F {item.fat}g</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 700, color: COLORS.accentText, fontSize: 14 }}>{item.calories}</div>
        <div style={{ fontSize: 10, color: COLORS.muted }}>kcal</div>
      </div>
      <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: "4px 6px", fontSize: 16, lineHeight: 1, borderRadius: 6 }}>×</button>
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [storage, setStorage] = useState(() => loadStorage());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [tab, setTab] = useState("today");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("manual");
  const [selectedMealTime, setSelectedMealTime] = useState("Breakfast");
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", emoji: "🍽️" });
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [showGoals, setShowGoals] = useState(false);
  const [goalsForm, setGoalsForm] = useState(storage.goals);
  const fileRef = useRef();
  const SCAN_API = import.meta.env.VITE_SCAN_API || null;

  // Persist on every change
  useEffect(() => { saveStorage(storage); }, [storage]);

  const goals = storage.goals;
  const mealsForDay = storage.meals[selectedDate] || [];

  

  const totals = mealsForDay.reduce((a, m) => ({
    calories: a.calories + m.calories, protein: a.protein + m.protein,
    carbs: a.carbs + m.carbs, fat: a.fat + m.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const deleteItem = (id) => {
    setStorage(prev => {
      const updated = (prev.meals[selectedDate] || []).filter(m => m.id !== id);
      return { ...prev, meals: { ...prev.meals, [selectedDate]: updated } };
    });
  };

  const addMeal = () => {
    if (!form.name || !form.calories) return;
    const newMeal = {
      id: Date.now(), name: form.name,
      calories: parseInt(form.calories) || 0, protein: parseInt(form.protein) || 0,
      carbs: parseInt(form.carbs) || 0, fat: parseInt(form.fat) || 0,
      emoji: form.emoji, mealTime: selectedMealTime,
    };
    setStorage(prev => ({
      ...prev,
      meals: { ...prev.meals, [selectedDate]: [...(prev.meals[selectedDate] || []), newMeal] }
    }));
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "", emoji: "🍽️" });
    setShowAdd(false); setScanResult(null); setImagePreview(null);
  };

  const saveGoals = () => {
    setStorage(prev => ({ ...prev, goals: { calories: parseInt(goalsForm.calories) || 2000, protein: parseInt(goalsForm.protein) || 150, carbs: parseInt(goalsForm.carbs) || 250, fat: parseInt(goalsForm.fat) || 65 } }));
    setShowGoals(false);
  };

  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      setScanning(true);
      setScanError(null);
      setScanResult(null);
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      try {
        const parsed = await scanImage(base64, mediaType);
        setScanResult(parsed);
        setForm({
          name: parsed.name || "",
          calories: parsed.calories != null ? String(parsed.calories) : "",
          protein: parsed.protein != null ? String(parsed.protein) : "",
          carbs: parsed.carbs != null ? String(parsed.carbs) : "",
          fat: parsed.fat != null ? String(parsed.fat) : "",
          emoji: parsed.emoji || "🍽️",
        });
      } catch (err) {
        const msg = err?.message || String(err);
        setScanError(`Couldn't analyze the image. ${msg}`);
      } finally { setScanning(false); }
    };
    reader.readAsDataURL(file);
  }, []);

  const groupedMeals = MEAL_TIMES.reduce((acc, mt) => {
    const items = mealsForDay.filter(m => m.mealTime === mt);
    if (items.length) acc[mt] = items;
    return acc;
  }, {});

  // Build last 7 days for history
  const today = toDateKey(new Date());
  const historyDays = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).reverse();

  const inputStyle = { background: COLORS.bg, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, color: COLORS.text, padding: "10px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  const isToday = selectedDate === today;
  const isFuture = selectedDate > today;

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: COLORS.text, maxWidth: 430, margin: "0 auto", position: "relative", paddingBottom: 80 }}>
      {!SCAN_API && (
        <div style={{ margin: "20px", padding: "14px 16px", borderRadius: 18, background: "#7f1d1d", border: `1px solid ${COLORS.danger}`, color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
          Local scan proxy not configured. Set <code style={{ fontFamily: "monospace", background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 6 }}>VITE_SCAN_API=http://localhost:3000/scan</code> in your .env and restart the frontend.
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "48px 20px 12px", background: COLORS.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>{getDayLabel(selectedDate)}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, marginTop: 2 }}>{formatDateLabel(selectedDate)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowGoals(true)}
              style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: COLORS.muted, cursor: "pointer" }}>
              🎯 Goals
            </button>
            {!isFuture && (
              <button onClick={() => { setShowAdd(true); setAddMode("photo"); setScanResult(null); setImagePreview(null); setScanError(null); }}
                style={{ background: COLORS.accent, border: "none", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, color: "#0F0F12", cursor: "pointer" }}>
                📷 Scan
              </button>
            )}
          </div>
        </div>

        {/* Date navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <button onClick={() => setSelectedDate(d => addDays(d, -1))}
            style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, padding: "5px 10px", color: COLORS.muted, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>‹</button>
          <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 6, scrollbarWidth: "none" }}>
            {historyDays.map(d => {
              const dayMeals = storage.meals[d] || [];
              const dayCals = dayMeals.reduce((a, m) => a + m.calories, 0);
              const isSelected = d === selectedDate;
              const isT = d === today;
              return (
                <button key={d} onClick={() => setSelectedDate(d)}
                  style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", borderRadius: 10, border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.cardBorder}`, background: isSelected ? COLORS.accentDim : COLORS.card, cursor: "pointer", minWidth: 48 }}>
                  <span style={{ fontSize: 9, color: isSelected ? COLORS.accentText : COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {isT ? "TDY" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: isSelected ? COLORS.accentText : COLORS.text, marginTop: 2 }}>
                    {new Date(d + "T12:00:00").getDate()}
                  </span>
                  {dayCals > 0 && <span style={{ fontSize: 9, color: isSelected ? COLORS.accentText : COLORS.muted, marginTop: 1 }}>{dayCals}</span>}
                </button>
              );
            })}
          </div>
          <button onClick={() => { if (!isFuture) setSelectedDate(d => addDays(d, 1)); }}
            style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, padding: "5px 10px", color: isFuture ? COLORS.cardBorder : COLORS.muted, cursor: isFuture ? "default" : "pointer", fontSize: 14, fontWeight: 700 }}>›</button>
        </div>
      </div>

      {/* Log tab */}
      {tab === "today" && (
        <div style={{ padding: "8px 20px 0" }}>
          {/* Summary card */}
          <div style={{ background: COLORS.card, borderRadius: 20, padding: 20, border: `1px solid ${COLORS.cardBorder}`, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <CalorieRing consumed={totals.calories} goal={goals.calories} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                <MacroBar label="Protein" value={totals.protein} goal={goals.protein} color={COLORS.protein} />
                <MacroBar label="Carbs" value={totals.carbs} goal={goals.carbs} color={COLORS.carbs} />
                <MacroBar label="Fat" value={totals.fat} goal={goals.fat} color={COLORS.fat} />
              </div>
              
            </div>
          </div>

          {Object.keys(groupedMeals).length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.muted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🥗</div>
              <div style={{ fontWeight: 600, color: COLORS.text }}>No meals logged{!isToday ? " this day" : " yet"}</div>
              {!isFuture && <div style={{ fontSize: 13, marginTop: 4 }}>Tap + to add or scan your food</div>}
            </div>
          )}

          {Object.entries(groupedMeals).map(([mealTime, items]) => {
            const mtCals = items.reduce((a, i) => a + i.calories, 0);
            return (
              <div key={mealTime} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{mealTime}</span>
                  <span style={{ fontSize: 12, color: COLORS.accentText, fontWeight: 600 }}>{mtCals} kcal</span>
                </div>
                <div style={{ background: COLORS.card, borderRadius: 16, padding: "0 16px", border: `1px solid ${COLORS.cardBorder}` }}>
                  {items.map((item, i) => (
                    <div key={item.id} style={{ borderBottom: i < items.length - 1 ? `1px solid ${COLORS.cardBorder}` : "none" }}>
                      <FoodItem item={item} onDelete={deleteItem} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {!isFuture && (
            <button onClick={() => { setShowAdd(true); setAddMode("manual"); setScanResult(null); setImagePreview(null); }}
              style={{ width: "100%", background: COLORS.card, border: `1.5px dashed ${COLORS.cardBorder}`, borderRadius: 16, padding: "14px", fontSize: 14, color: COLORS.muted, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
              + Add Food Manually
            </button>
          )}
        </div>
      )}

      {/* Stats tab */}
      {tab === "stats" && (
        <div style={{ padding: "12px 20px 0" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: COLORS.text }}>{formatDateLabel(selectedDate)} — Summary</div>
          {[
            { label: "Calories", val: totals.calories, goal: goals.calories, unit: "kcal", color: COLORS.accent },
            { label: "Protein", val: totals.protein, goal: goals.protein, unit: "g", color: COLORS.protein },
            { label: "Carbohydrates", val: totals.carbs, goal: goals.carbs, unit: "g", color: COLORS.carbs },
            { label: "Fat", val: totals.fat, goal: goals.fat, unit: "g", color: COLORS.fat },
          ].map(({ label, val, goal, unit, color }) => (
            <div key={label} style={{ background: COLORS.card, borderRadius: 16, padding: 18, marginBottom: 12, border: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: COLORS.text }}>{label}</span>
                <span style={{ fontWeight: 800, color }}>{val}<span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 13 }}>/{goal}{unit}</span></span>
              </div>
              <div style={{ height: 8, borderRadius: 9999, background: COLORS.cardBorder }}>
                <div style={{ height: "100%", borderRadius: 9999, background: color, width: `${Math.min((val / goal) * 100, 100)}%`, transition: "width 0.6s" }} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 8 }}>
                {val > goal ? <span style={{ color: COLORS.danger }}>+{val - goal}{unit} over goal</span> : `${goal - val}${unit} remaining`}
              </div>
            </div>
          ))}

          {/* 7-day calorie history */}
          <div style={{ background: COLORS.card, borderRadius: 16, padding: 18, border: `1px solid ${COLORS.cardBorder}`, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 14, fontSize: 14 }}>7-Day Calories</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {historyDays.map(d => {
                const cals = (storage.meals[d] || []).reduce((a, m) => a + m.calories, 0);
                const pct = Math.min(cals / goals.calories, 1.2);
                const isSelected = d === selectedDate;
                return (
                  <div key={d} onClick={() => setSelectedDate(d)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                    <div style={{ width: "100%", height: `${Math.max(pct * 64, cals > 0 ? 4 : 0)}px`, background: isSelected ? COLORS.accent : cals > goals.calories ? COLORS.danger : COLORS.accentDim, borderRadius: "4px 4px 0 0", transition: "height 0.4s", border: isSelected ? `1px solid ${COLORS.accent}` : "none" }} />
                    <div style={{ fontSize: 9, color: isSelected ? COLORS.accentText : COLORS.muted, marginTop: 4, textTransform: "uppercase", fontWeight: 600 }}>
                      {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: COLORS.muted }}>
              <span>Goal: {goals.calories} kcal</span>
              <span style={{ color: COLORS.accentText }}>Avg: {Math.round(historyDays.reduce((a, d) => a + (storage.meals[d] || []).reduce((b, m) => b + m.calories, 0), 0) / 7)} kcal</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: COLORS.card, borderTop: `1px solid ${COLORS.cardBorder}`, display: "flex", padding: "10px 0 20px" }}>
        {[["today", "📋", "Log"], ["stats", "📊", "Stats"]].map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === t ? COLORS.accentText : COLORS.muted, fontWeight: tab === t ? 700 : 400, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Goals modal */}
      {showGoals && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setShowGoals(false); }}>
          <div style={{ background: COLORS.card, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 20px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Daily Goals</span>
              <button onClick={() => setShowGoals(false)} style={{ background: COLORS.bg, border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 18, borderRadius: 8, padding: "2px 8px" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { key: "calories", label: "Calories", unit: "kcal", color: COLORS.accent },
                { key: "protein", label: "Protein", unit: "g", color: COLORS.protein },
                { key: "carbs", label: "Carbohydrates", unit: "g", color: COLORS.carbs },
                { key: "fat", label: "Fat", unit: "g", color: COLORS.fat },
              ].map(({ key, label, unit, color }) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label} ({unit})</div>
                  <input style={{ ...inputStyle, borderColor: color + "50" }} type="number"
                    value={goalsForm[key]} onChange={e => setGoalsForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <button onClick={saveGoals}
                style={{ background: COLORS.accent, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, color: "#0F0F12", cursor: "pointer", marginTop: 4 }}>
                Save Goals
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add food modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setScanResult(null); setImagePreview(null); } }}>
          <div style={{ background: COLORS.card, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", padding: "24px 20px 40px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Add Food</span>
              <button onClick={() => { setShowAdd(false); setScanResult(null); setImagePreview(null); }} style={{ background: COLORS.bg, border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 18, borderRadius: 8, padding: "2px 8px" }}>×</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: COLORS.bg, borderRadius: 12, padding: 4 }}>
              {["photo", "manual"].map(m => (
                <button key={m} onClick={() => setAddMode(m)}
                  style={{ flex: 1, padding: "8px", borderRadius: 9, background: addMode === m ? COLORS.accent : "transparent", border: "none", color: addMode === m ? "#0F0F12" : COLORS.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.2s" }}>
                  {m === "photo" ? "📷 Scan Photo" : "✏️ Manual"}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Meal</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {MEAL_TIMES.map(mt => (
                  <button key={mt} onClick={() => setSelectedMealTime(mt)}
                    style={{ padding: "6px 14px", borderRadius: 9999, border: `1.5px solid ${selectedMealTime === mt ? COLORS.accent : COLORS.cardBorder}`, background: selectedMealTime === mt ? COLORS.accentDim : "transparent", color: selectedMealTime === mt ? COLORS.accentText : COLORS.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    {mt}
                  </button>
                ))}
              </div>
            </div>

            {addMode === "photo" && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleImageUpload} />
                {!imagePreview && (
                  <button onClick={() => fileRef.current?.click()}
                    style={{ width: "100%", background: COLORS.bg, border: `2px dashed ${COLORS.cardBorder}`, borderRadius: 16, padding: "32px 20px", cursor: "pointer", color: COLORS.muted, textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                    <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>Take or upload a photo</div>
                    <div style={{ fontSize: 13 }}>AI will estimate calories & macros</div>
                  </button>
                )}
                {imagePreview && (
                  <div style={{ marginBottom: 16 }}>
                    <img src={imagePreview} alt="food" style={{ width: "100%", borderRadius: 14, maxHeight: 200, objectFit: "cover" }} />
                    {scanning && (
                      <div style={{ textAlign: "center", padding: "16px 0", color: COLORS.accentText, fontWeight: 600, fontSize: 14 }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>Analyzing your meal...
                      </div>
                    )}
                    {scanError && <div style={{ color: COLORS.danger, fontSize: 13, marginTop: 10, padding: "10px", background: "#f8717120", borderRadius: 10 }}>{scanError}</div>}
                    {scanResult && !scanning && (
                      <div style={{ background: COLORS.accentDim, borderRadius: 12, padding: 14, marginTop: 12, border: `1px solid ${COLORS.accent}40` }}>
                        <div style={{ fontWeight: 700, color: COLORS.accentText, marginBottom: 4 }}>✓ Meal detected</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{scanResult.emoji} {scanResult.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>{scanResult.calories} kcal · P {scanResult.protein}g · C {scanResult.carbs}g · F {scanResult.fat}g</div>
                        {scanResult.__mockScan && (
                          <div style={{ marginTop: 10, fontSize: 12, color: COLORS.danger }}>Note: scan proxy is not configured, so this is a mock result.</div>
                        )}
                      </div>
                    )}
                    <button onClick={() => { setImagePreview(null); setScanResult(null); if (fileRef.current) fileRef.current.value = ""; }}
                      style={{ marginTop: 10, background: "none", border: "none", color: COLORS.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                      Use a different photo
                    </button>
                  </div>
                )}
              </div>
            )}

            {(addMode === "manual" || scanResult) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: addMode === "photo" ? 8 : 0 }}>
                <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
                  {scanResult ? "Review & confirm" : "Food details"}
                </div>
                <input style={inputStyle} placeholder="Food name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { key: "calories", label: "Calories", color: COLORS.muted },
                    { key: "protein", label: "Protein (g)", color: COLORS.protein },
                    { key: "carbs", label: "Carbs (g)", color: COLORS.carbs },
                    { key: "fat", label: "Fat (g)", color: COLORS.fat },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                      <input style={{ ...inputStyle, borderColor: color + "50" }} placeholder="0" type="number"
                        value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <button onClick={addMeal}
                  style={{ background: COLORS.accent, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, color: "#0F0F12", cursor: "pointer", marginTop: 4 }}>
                  Add to {selectedMealTime}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: #5050A0; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
