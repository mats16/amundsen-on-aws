import { App } from 'aws-cdk-lib';
import { OpenMetadataStack } from './openmetadata-stack';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new OpenMetadataStack(app, 'OpenMetadata', { env });

app.synth();