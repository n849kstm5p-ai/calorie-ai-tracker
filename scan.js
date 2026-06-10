const API_URL = import.meta.env.VITE_SCAN_API || null;

export async function scanImage(base64, mediaType) {
  // If an API URL is configured via Vite env `VITE_SCAN_API`, forward the image.
  if (API_URL) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, mediaType }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Scan API error: ${res.status} ${text}`);
    }
    const json = await res.json();
    return json;
  }

  // Fallback mock: simulate a short delay and return a plausible parsed result.
  console.warn('VITE_SCAN_API is not configured; using mock scan result. Set VITE_SCAN_API=http://localhost:3000/scan in .env and restart the frontend.');
  await new Promise((r) => setTimeout(r, 900));
  return {
    name: "Chicken & Rice Bowl",
    emoji: "🍗",
    calories: 620,
    protein: 42,
    carbs: 58,
    fat: 18,
    __mockScan: true,
  };
}
