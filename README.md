# OpenWeather

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.4.

## Development server

Set the OpenWeather API key in a local environment file (it is ignored by Git):

```powershell
Copy-Item .env.example .env.local
```

Replace the placeholder in `.env.local` with your API key, then start the app:

```bash
npm start
```

Open `http://localhost:4200/`. The app asks for browser location permission and displays current weather and a five-day forecast for your current coordinates, using metric units. You can also search for another locality, pick a point on the interactive OpenStreetMap map, and return to your current location at any time. The API key is read by a local server-side proxy and is not sent to the browser.

Use `npm start` rather than `ng serve`: the start script launches both the Angular development server and the local weather API proxy. Without the proxy, requests to `/api/weather` and `/api/forecast` are handled by Angular's development server and may return the app's HTML page instead of JSON.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute the Angular unit tests and isolated proxy tests, use:

```bash
npm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
