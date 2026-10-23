import { createServer } from 'node:http';

export function createWeatherProxy({ apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new Error(
      'OPENWEATHER_API_KEY is required to create the weather proxy.',
    );
  }

  const server = createServer(async (request, response) => {
    const endpoints = {
      '/api/weather': 'weather',
      '/api/forecast': 'forecast',
    };
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const endpoint = endpoints[requestUrl.pathname];

    if (request.method === 'GET' && requestUrl.pathname === '/api/geocode') {
      const query = requestUrl.searchParams.get('q')?.trim();
      if (!query || query.length < 2 || query.length > 120) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'A location query between 2 and 120 characters is required.' }));
        return;
      }

      const url = new URL('https://api.openweathermap.org/geo/1.0/direct');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '5');
      url.searchParams.set('appid', apiKey);
      url.searchParams.set('lang', 'pt');

      try {
        await forwardResponse(fetchImpl, url, response);
      } catch (error) {
        console.error('OpenWeather geocoding request failed:', error);
        response.writeHead(502, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Location search service is unavailable.' }));
      }
      return;
    }

    if (request.method !== 'GET' || !endpoint) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Not found' }));
      return;
    }

    const latitudeParam = requestUrl.searchParams.get('lat');
    const longitudeParam = requestUrl.searchParams.get('lon');
    const latitude = latitudeParam === null || latitudeParam.trim() === '' ? Number.NaN : Number(latitudeParam);
    const longitude =
      longitudeParam === null || longitudeParam.trim() === '' ? Number.NaN : Number(longitudeParam);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Valid latitude and longitude are required.' }));
      return;
    }

    const url = new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang', 'pt');

    try {
      await forwardResponse(fetchImpl, url, response);
    } catch (error) {
      console.error('OpenWeather request failed:', error);
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Weather service is unavailable.' }));
    }
  });

  return server;
}

export function startWeatherProxy() {
  const server = createWeatherProxy({ apiKey: process.env.OPENWEATHER_API_KEY });
  server.listen(3001, '127.0.0.1');
  return server;
}

async function forwardResponse(fetchImpl, url, response) {
  const upstream = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  const body = await upstream.arrayBuffer();
  response.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
  });
  response.end(Buffer.from(body));
}
