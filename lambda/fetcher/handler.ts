import 'source-map-support/register';
import middy from '@middy/core';
import { injectLambdaContext } from '@aws-lambda-powertools/logger';
import * as app from './app';

// eslint-disable-next-line import/prefer-default-export
export const handler = middy(app.entryPoint).use(injectLambdaContext(app.getLogger()));
