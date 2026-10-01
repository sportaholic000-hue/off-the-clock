import 'dotenv/config';
import {prepareDeploymentEnvironment} from './deploymentConfig.js';

// Evaluated before either persistent service opens a file. Direct server
// starts receive the same checks as npm start and the Docker entrypoint.
export const deploymentConfig = prepareDeploymentEnvironment();
