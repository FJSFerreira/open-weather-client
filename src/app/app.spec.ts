import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';
import { LOCALE_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  let geolocationDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: 41.1579,
              longitude: -8.6291,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition),
      },
    });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOCALE_ID, useValue: 'pt-PT' },
      ],
    })
      .compileComponents();
  });

  afterEach(() => {
    if (geolocationDescriptor) {
      Object.defineProperty(navigator, 'geolocation', geolocationDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'geolocation');
    }
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should show the weather data from the API on the home screen', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(
      (req) =>
        req.url === '/api/weather' &&
        req.params.get('lat') === '41.1579' &&
        req.params.get('lon') === '-8.6291',
    );
    const forecastRequest = http.expectOne(
      (req) =>
        req.url === '/api/forecast' &&
        req.params.get('lat') === '41.1579' &&
        req.params.get('lon') === '-8.6291',
    );
    expect(request.request.method).toBe('GET');
    expect(forecastRequest.request.method).toBe('GET');
    request.flush({
      name: 'Alenquer',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 21.4, feels_like: 20.8, humidity: 55, temp_min: 18, temp_max: 23 },
      wind: { speed: 3.2 },
      dt: 1792764000,
    });
    forecastRequest.flush({
      city: { timezone: 0 },
      list: [
        {
          dt: 1792807200,
          main: { temp: 20, temp_min: 18, temp_max: 22 },
          weather: [{ description: 'céu limpo', icon: '01d' }],
        },
        {
          dt: 1792893600,
          main: { temp: 19, temp_min: 16, temp_max: 21 },
          weather: [{ description: 'nuvens dispersas', icon: '02d' }],
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Alenquer');
    expect(compiled.textContent).toContain('21°C');
    expect(compiled.textContent).toContain('Sensação térmica 21°C');
    expect(compiled.textContent).toContain('Temperatura mínima');
    expect(compiled.textContent).toContain('18°C');
    expect(compiled.textContent).toContain('Temperatura máxima');
    expect(compiled.textContent).toContain('23°C');
    expect(compiled.textContent).toContain('céu limpo');
    expect(compiled.textContent).toContain('55%');
    expect(compiled.textContent).toContain('Previsão para 5 dias');
    expect(compiled.textContent).toContain('nuvens dispersas');
    expect(compiled.textContent).toContain('16°');
    http.verify();
  });

  it('should set the background theme based on current conditions', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url === '/api/weather').flush({
      name: 'Alenquer',
      sys: { country: 'PT' },
      weather: [{ description: 'chuva moderada', icon: '10d', main: 'Rain' }],
      main: { temp: 15, feels_like: 14, humidity: 80, temp_min: 14, temp_max: 16 },
      wind: { speed: 4 },
      dt: 1792764000,
    });
    http.expectOne((req) => req.url === '/api/forecast').flush({ city: { timezone: 0 }, list: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const page = (fixture.nativeElement as HTMLElement).querySelector('.page');
    expect(page?.classList.contains('weather-rainy')).toBe(true);
    http.verify();
  });

  it('should search for and load weather for a selected location', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url === '/api/weather').flush({
      name: 'Porto',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 20, feels_like: 20, humidity: 55, temp_min: 18, temp_max: 22 },
      wind: { speed: 2 },
      dt: 1792764000,
    });
    http.expectOne((req) => req.url === '/api/forecast').flush({ city: { timezone: 0 }, list: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Lisboa';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(http.match((req) => req.url === '/api/geocode')).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const searchRequest = http.expectOne(
      (req) => req.url === '/api/geocode' && req.params.get('q') === 'Lisboa',
    );
    searchRequest.flush([
      { name: 'Lisbon', state: 'Lisboa', country: 'PT', lat: 38.7223, lon: -9.1393 },
      { name: 'Lisboa', state: 'Portugal', country: 'PT', lat: 38.7167, lon: -9.1333 },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.location-results button').length).toBe(2);
    const resultButton = fixture.nativeElement.querySelector('.location-results button') as HTMLButtonElement;
    resultButton.click();

    const weatherRequest = http.expectOne(
      (req) =>
        req.url === '/api/weather' &&
        req.params.get('lat') === '38.7223' &&
        req.params.get('lon') === '-9.1393',
    );
    const forecastRequest = http.expectOne(
      (req) =>
        req.url === '/api/forecast' &&
        req.params.get('lat') === '38.7223' &&
        req.params.get('lon') === '-9.1393',
    );
    weatherRequest.flush({
      name: 'Lisboa',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 22, feels_like: 22, humidity: 50, temp_min: 20, temp_max: 24 },
      wind: { speed: 2 },
      dt: 1792764000,
    });
    forecastRequest.flush({ city: { timezone: 0 }, list: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Lisboa');
    const refreshButton = compiled.querySelector('.refresh-button') as HTMLButtonElement;
    expect(refreshButton).toBeTruthy();
    refreshButton.click();
    fixture.detectChanges();
    expect(compiled.querySelector('h1')?.textContent).toContain('Lisboa');
    expect(compiled.textContent).toContain('22°C');
    expect(compiled.textContent).toContain('A atualizar dados...');

    const refreshedWeatherRequest = http.expectOne(
      (req) =>
        req.url === '/api/weather' &&
        req.params.get('lat') === '38.7223' &&
        req.params.get('lon') === '-9.1393',
    );
    const refreshedForecastRequest = http.expectOne(
      (req) =>
        req.url === '/api/forecast' &&
        req.params.get('lat') === '38.7223' &&
        req.params.get('lon') === '-9.1393',
    );
    refreshedWeatherRequest.flush({
      name: 'Lisboa',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 22, feels_like: 22, humidity: 50, temp_min: 20, temp_max: 24 },
      wind: { speed: 2 },
      dt: 1792764000,
    });
    refreshedForecastRequest.flush({ city: { timezone: 0 }, list: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    const currentLocationButton = compiled.querySelector(
      '.current-location-button',
    ) as HTMLButtonElement;
    currentLocationButton.click();

    const currentWeatherRequest = http.expectOne(
      (req) =>
        req.url === '/api/weather' &&
        req.params.get('lat') === '41.1579' &&
        req.params.get('lon') === '-8.6291',
    );
    const currentForecastRequest = http.expectOne(
      (req) =>
        req.url === '/api/forecast' &&
        req.params.get('lat') === '41.1579' &&
        req.params.get('lon') === '-8.6291',
    );
    currentWeatherRequest.flush({
      name: 'Porto',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 20, feels_like: 20, humidity: 55, temp_min: 18, temp_max: 22 },
      wind: { speed: 2 },
      dt: 1792764000,
    });
    currentForecastRequest.flush({ city: { timezone: 0 }, list: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('h1')?.textContent).toContain('Porto');
    http.verify();
  });

  it('keeps the last weather and forecast visible when a refresh fails', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((req) => req.url === '/api/weather').flush({
      name: 'Porto',
      sys: { country: 'PT' },
      weather: [{ description: 'céu limpo', icon: '01d', main: 'Clear' }],
      main: { temp: 20, feels_like: 20, humidity: 55, temp_min: 18, temp_max: 22 },
      wind: { speed: 2 },
      dt: 1792764000,
    });
    http.expectOne((req) => req.url === '/api/forecast').flush({
      city: { timezone: 0 },
      list: [
        {
          dt: Math.floor(Date.now() / 1000),
          main: { temp: 20, temp_min: 18, temp_max: 22 },
          weather: [{ description: 'céu limpo', icon: '01d' }],
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.forecast-day').length).toBeGreaterThan(0);
    (compiled.querySelector('.refresh-button') as HTMLButtonElement).click();
    const weatherRequest = http.expectOne((req) => req.url === '/api/weather');
    const forecastRequest = http.expectOne((req) => req.url === '/api/forecast');
    weatherRequest.flush('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
    forecastRequest.flush('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('h1')?.textContent).toContain('Porto');
    expect(compiled.textContent).toContain('20°C');
    expect(compiled.querySelectorAll('.forecast-day').length).toBeGreaterThan(0);
    expect(compiled.querySelectorAll('[role="alert"]').length).toBe(2);
    http.verify();
  });

});
