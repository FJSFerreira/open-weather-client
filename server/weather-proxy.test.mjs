import assert from 'node:assert/strict';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createWeatherProxy } from './weather-proxy.mjs';

describe('weather proxy', () => {
  let server;
  let baseUrl;
  let fetchCalls;

  async function startProxy(fetchImpl = async () => new Response('{}')) {
    fetchCalls = [];
    server = createWeatherProxy({
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        fetchCalls.push({ url: new URL(url), options });
        return fetchImpl(url, options);
      },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  beforeEach(() => startProxy());
  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
  });

  it('rejects missing, blank, nonnumeric, and out-of-range coordinates', async () => {
    const invalidQueries = [
      '',
      '?lat=&lon=2',
      '?lat=1&lon=',
      '?lat=nope&lon=2',
      '?lat=1&lon=181',
      '?lat=-91&lon=2',
    ];

    for (const query of invalidQueries) {
      const response = await fetch(`${baseUrl}/api/weather${query}`);
      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), {
        message: 'Valid latitude and longitude are required.',
      });
    }

    assert.equal(fetchCalls.length, 0);
  });

  it('forwards validated weather and forecast parameters', async () => {
    const weatherResponse = await fetch(`${baseUrl}/api/weather?lat=38.9&lon=-9.1`);
    assert.equal(weatherResponse.status, 200);
    assert.deepEqual(await weatherResponse.json(), {});

    const forecastResponse = await fetch(`${baseUrl}/api/forecast?lat=38.9&lon=-9.1`);
    assert.equal(forecastResponse.status, 200);

    assert.equal(fetchCalls.length, 2);
    for (const { url } of fetchCalls) {
      assert.equal(url.searchParams.get('lat'), '38.9');
      assert.equal(url.searchParams.get('lon'), '-9.1');
      assert.equal(url.searchParams.get('units'), 'metric');
      assert.equal(url.searchParams.get('lang'), 'pt');
      assert.equal(url.searchParams.get('appid'), 'test-key');
    }
    assert.match(fetchCalls[0].url.pathname, /\/weather$/);
    assert.match(fetchCalls[1].url.pathname, /\/forecast$/);
  });

  it('returns up to five geocoding results in Portuguese', async () => {
    const response = await fetch(`${baseUrl}/api/geocode?q=Lisboa`);
    assert.equal(response.status, 200);
    const { url } = fetchCalls[0];
    assert.equal(url.searchParams.get('q'), 'Lisboa');
    assert.equal(url.searchParams.get('limit'), '5');
    assert.equal(url.searchParams.get('lang'), 'pt');
    assert.equal(url.searchParams.get('appid'), 'test-key');
  });

  it('validates geocoding queries and forwards upstream error statuses', async () => {
    const invalidQuery = await fetch(`${baseUrl}/api/geocode?q=x`);
    assert.equal(invalidQuery.status, 400);
    assert.equal(fetchCalls.length, 0);

    server.close();
    await once(server, 'close');
    await startProxy(async () => new Response('unauthorized', { status: 401 }));

    const upstreamError = await fetch(`${baseUrl}/api/weather?lat=1&lon=2`);
    assert.equal(upstreamError.status, 401);
    assert.equal(await upstreamError.text(), 'unauthorized');
  });

  it('requires an API key before creating the proxy', () => {
    assert.throws(() => createWeatherProxy({}), /OPENWEATHER_API_KEY is required/);
  });
});
