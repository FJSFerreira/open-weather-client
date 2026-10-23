import { Component, ElementRef, HostListener, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

registerLocaleData(localePt);

interface WeatherData {
  name: string;
  sys: { country: string };
  weather: Array<{ description: string; icon: string; main: string }>;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    temp_min: number;
    temp_max: number;
  };
  wind: { speed: number };
  dt: number;
}

interface ForecastEntry {
  dt: number;
  main: {
    temp: number;
    temp_min: number;
    temp_max: number;
  };
  weather: Array<{ description: string; icon: string }>;
}

interface ForecastResponse {
  city: { timezone: number };
  list: ForecastEntry[];
}

interface ForecastDay {
  date: string;
  dateTimestamp: number;
  isToday: boolean;
  tempMin: number;
  tempMax: number;
  icon: string;
  description: string;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface MapCoordinates {
  lat: number;
  lng: number;
}

interface LocationResult {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

type WeatherTheme = 'clear-day' | 'clear-night' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy';

@Component({
  imports: [DatePipe, DecimalPipe],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private mapInstance: import('leaflet').Map | null = null;
  private mapTrigger: HTMLElement | null = null;

  @ViewChild('mapDialog')
  private mapDialog?: ElementRef<HTMLElement>;

  protected readonly weather = signal<WeatherData | null>(null);
  protected readonly selectedCoordinates = signal<Coordinates | null>(null);
  protected readonly isMapOpen = signal(false);
  protected readonly mapSelection = signal<MapCoordinates | null>(null);
  protected readonly backgroundTheme = computed<WeatherTheme>(() => {
    const condition = this.weather()?.weather[0];
    if (!condition) {
      return 'cloudy';
    }

    if (condition.main === 'Clear') {
      return condition.icon.endsWith('n') ? 'clear-night' : 'clear-day';
    }

    switch (condition.main) {
      case 'Thunderstorm':
        return 'stormy';
      case 'Drizzle':
      case 'Rain':
        return 'rainy';
      case 'Snow':
        return 'snowy';
      case 'Mist':
      case 'Smoke':
      case 'Haze':
      case 'Dust':
      case 'Fog':
      case 'Sand':
      case 'Ash':
      case 'Squall':
      case 'Tornado':
        return 'foggy';
      default:
        return 'cloudy';
    }
  });
  protected readonly forecast = signal<ForecastDay[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly isForecastLoading = signal(true);
  protected readonly forecastErrorMessage = signal('');
  protected readonly isLocating = signal(true);
  protected readonly searchQuery = signal('');
  protected readonly locations = signal<LocationResult[]>([]);
  protected readonly isSearching = signal(false);
  protected readonly searchError = signal('');

  @ViewChild('locationMap')
  set locationMap(element: ElementRef<HTMLDivElement> | undefined) {
    if (!element) {
      this.destroyMap();
      return;
    }
    void this.initializeMap(element.nativeElement);
  }

  ngOnInit(): void {
    this.loadLocationWeather();
  }

  protected loadLocationWeather(): void {
    this.isLocating.set(true);
    this.selectedCoordinates.set(null);
    this.resetWeatherState();
    this.locations.set([]);
    this.searchError.set('');

    if (!navigator.geolocation) {
      this.setLocationError('Este browser não permite obter a localização atual.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.isLocating.set(false);
        this.selectedCoordinates.set(position.coords);
        this.loadCoordinates(position.coords);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Permita o acesso à localização no browser para consultar o tempo na sua localização atual.'
            : 'Não foi possível determinar a localização atual. Verifique o GPS ou a ligação e tente novamente.';
        this.setLocationError(message);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  protected refreshWeather(): void {
    const coordinates = this.selectedCoordinates();
    if (coordinates) {
      this.isLocating.set(false);
      this.loadCoordinates(coordinates, true);
      return;
    }

    this.loadLocationWeather();
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected searchLocations(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery().trim();
    this.locations.set([]);
    this.searchError.set('');

    if (query.length < 2) {
      this.searchError.set('Introduza pelo menos 2 caracteres para pesquisar.');
      return;
    }

    this.isSearching.set(true);
    this.http.get<LocationResult[]>('/api/geocode', {
      params: new HttpParams().set('q', query),
    }).subscribe({
      next: (locations) => {
        this.locations.set(locations);
        if (locations.length === 0) {
          this.searchError.set('Não foram encontradas localidades com esse nome.');
        }
      },
      error: (error: unknown) => {
        console.error('Não foi possível pesquisar a localidade.', error);
        this.searchError.set('Não foi possível pesquisar. Verifique a ligação e tente novamente.');
      },
      complete: () => this.isSearching.set(false),
    });
  }

  protected selectLocation(location: LocationResult): void {
    this.locations.set([]);
    this.searchQuery.set([location.name, location.state, location.country].filter(Boolean).join(', '));
    this.isLocating.set(false);
    const coordinates = { latitude: location.lat, longitude: location.lon };
    this.selectedCoordinates.set(coordinates);
    this.loadCoordinates(coordinates);
  }

  protected locationDetail(location: LocationResult): string {
    return [location.state, location.country].filter(Boolean).join(', ');
  }

  protected openMapPicker(): void {
    this.mapTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const coordinates = this.selectedCoordinates();
    this.mapSelection.set(
      coordinates
        ? { lat: coordinates.latitude, lng: coordinates.longitude }
        : { lat: 38.7223, lng: -9.1393 },
    );
    this.isMapOpen.set(true);
    requestAnimationFrame(() => this.mapDialog?.nativeElement.focus());
  }

  protected closeMapPicker(): void {
    this.isMapOpen.set(false);
    requestAnimationFrame(() => this.mapTrigger?.focus());
  }

  protected confirmMapLocation(): void {
    const selection = this.mapSelection();
    if (!selection) {
      return;
    }

    const coordinates = { latitude: selection.lat, longitude: selection.lng };
    this.selectedCoordinates.set(coordinates);
    this.searchQuery.set(`${selection.lat.toFixed(4)}, ${selection.lng.toFixed(4)}`);
    this.closeMapPicker();
    this.loadCoordinates(coordinates);
  }

  protected handleMapBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeMapPicker();
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onDialogKeydown(event: KeyboardEvent): void {
    if (!this.isMapOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMapPicker();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = this.mapDialog?.nativeElement;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog ||
        !dialog?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  private async initializeMap(element: HTMLDivElement): Promise<void> {
    const leaflet = await import('leaflet');
    if (!this.isMapOpen() || !element.isConnected) {
      return;
    }

    const selection = this.mapSelection() ?? { lat: 38.7223, lng: -9.1393 };
    const map = leaflet.map(element).setView([selection.lat, selection.lng], 10);
    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
      .addTo(map);

    const markerIcon = leaflet.icon({
      iconRetinaUrl: '/assets/leaflet/marker-icon-2x.png',
      iconUrl: '/assets/leaflet/marker-icon.png',
      shadowUrl: '/assets/leaflet/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    const marker = leaflet
      .marker([selection.lat, selection.lng], { draggable: true, icon: markerIcon })
      .addTo(map);
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      this.mapSelection.set({ lat: position.lat, lng: position.lng });
    });
    map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      this.mapSelection.set({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    this.mapInstance = map;
    requestAnimationFrame(() => map.invalidateSize());
  }

  private destroyMap(): void {
    this.mapInstance?.remove();
    this.mapInstance = null;
  }

  private loadCoordinates(coordinates: Coordinates, preserveData = false): void {
    if (preserveData) {
      this.clearRequestErrors();
    } else {
      this.resetWeatherState();
    }
    this.loadWeather(coordinates);
    this.loadForecast(coordinates);
  }

  protected loadWeather(coordinates: Coordinates): void {
    const params = this.coordinateParams(coordinates);

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.http.get<WeatherData>('/api/weather', { params }).subscribe({
      next: (weather) => this.weather.set(weather),
      error: (error: unknown) => {
        console.error('Não foi possível obter os dados meteorológicos.', error);
        this.errorMessage.set(this.requestErrorMessage(error, 'o estado do tempo'));
        this.isLoading.set(false);
      },
      complete: () => this.isLoading.set(false),
    });
  }

  protected loadForecast(coordinates: Coordinates): void {
    const params = this.coordinateParams(coordinates);

    this.isForecastLoading.set(true);
    this.forecastErrorMessage.set('');
    this.http.get<ForecastResponse>('/api/forecast', { params }).subscribe({
      next: (response) => {
        this.forecast.set(this.groupForecastByDay(response));
      },
      error: (error: unknown) => {
        console.error('Não foi possível obter a previsão meteorológica.', error);
        this.forecastErrorMessage.set(this.requestErrorMessage(error, 'a previsão'));
        this.isForecastLoading.set(false);
      },
      complete: () => this.isForecastLoading.set(false),
    });
  }

  private coordinateParams(coordinates: Coordinates): HttpParams {
    return new HttpParams()
      .set('lat', coordinates.latitude)
      .set('lon', coordinates.longitude);
  }

  private resetWeatherState(): void {
    this.isLoading.set(true);
    this.isForecastLoading.set(true);
    this.clearRequestErrors();
    this.weather.set(null);
    this.forecast.set([]);
  }

  private clearRequestErrors(): void {
    this.errorMessage.set('');
    this.forecastErrorMessage.set('');
  }

  private setLocationError(message: string): void {
    this.isLocating.set(false);
    this.isLoading.set(false);
    this.isForecastLoading.set(false);
    this.errorMessage.set(message);
    this.forecastErrorMessage.set(message);
  }

  private groupForecastByDay(response: ForecastResponse): ForecastDay[] {
    const grouped = new Map<string, ForecastEntry[]>();
    const today = new Date(Date.now() + response.city.timezone * 1000)
      .toISOString()
      .slice(0, 10);

    for (const entry of response.list) {
      const localDate = new Date((entry.dt + response.city.timezone) * 1000)
        .toISOString()
        .slice(0, 10);
      const entries = grouped.get(localDate) ?? [];
      entries.push(entry);
      grouped.set(localDate, entries);
    }

    return [...grouped.entries()].slice(0, 5).map(([date, entries]) => {
      const representative = entries.reduce((closest, entry) =>
        Math.abs(this.localHour(entry.dt, response.city.timezone) - 12) <
        Math.abs(this.localHour(closest.dt, response.city.timezone) - 12)
          ? entry
          : closest,
      );

      return {
        date,
        dateTimestamp: Date.UTC(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10)),
        ),
        isToday: date === today,
        tempMin: Math.min(...entries.map((entry) => entry.main.temp_min)),
        tempMax: Math.max(...entries.map((entry) => entry.main.temp_max)),
        icon: representative.weather[0].icon,
        description: representative.weather[0].description,
      };
    });
  }

  private localHour(timestamp: number, timezoneOffset: number): number {
    return new Date((timestamp + timezoneOffset) * 1000).getUTCHours();
  }

  private requestErrorMessage(error: unknown, dataName: string): string {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 200 &&
      error.error instanceof SyntaxError
    ) {
      return 'O servidor devolveu HTML em vez de dados da API. Inicie a aplicação com "npm start" (não "ng serve") para ativar o proxy meteorológico.';
    }

    return `Não foi possível carregar ${dataName}. Verifique a ligação e tente novamente.`;
  }
}
