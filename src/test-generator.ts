import { generateDockerfile } from './services/dockerfileGenerator.js';

const nodeDocker = generateDockerfile({
  runtime: 'nodejs',
  startCommand: 'npm start',
  buildCommand: 'npm run build',
  port: 8080
});

console.log("=== Generated Node.js Dockerfile ===");
console.log(nodeDocker);