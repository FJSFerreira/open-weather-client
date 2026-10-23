import { spawn } from 'node:child_process';
import { startWeatherProxy } from './weather-proxy.mjs';

const weatherProxy = startWeatherProxy();
const angular = spawn(
  process.execPath,
  ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', '127.0.0.1', '--proxy-config', 'proxy.conf.json'],
  { stdio: 'inherit' },
);

function stop(signal) {
  angular.kill(signal);
  weatherProxy.close();
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

angular.once('error', (error) => {
  console.error('Could not start the Angular development server:', error);
  weatherProxy.close();
  process.exitCode = 1;
});

angular.once('exit', (code, signal) => {
  weatherProxy.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});
