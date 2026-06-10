export default async function handler(req, res) {
  // Налаштування CORS, щоб фронтенд міг без проблем отримувати дані
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Беремо закодований запит "data" з URL query (наприклад, ?data=...)
  const { data } = req.query;

  if (!data) {
    return res.status(400).json({ error: 'Missing "data" parameter' });
  }

  try {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    
    // Надсилаємо запит від імені сервера Vercel, додаючи легітимні заголовки
    const response = await fetch(`${overpassUrl}?data=${encodeURIComponent(data)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // Унікальний ідентифікатор вашого застосунку відповідно до вимог OSM
        'User-Agent': 'DroneMissionControlSystem/1.0 (https://drone-system-roan.vercel.app; student-project)', 
        'Referer': 'https://drone-system-roan.vercel.app/'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(`Overpass upstream error: ${errorText}`);
    }

    const jsonData = await response.json();
    
    // Повертаємо успішну відповідь фронтенду
    return res.status(200).json(jsonData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}