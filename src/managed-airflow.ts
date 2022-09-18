import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as mwaa from 'aws-cdk-lib/aws-mwaa';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface ManagedAirflowProps {
  vpc: ec2.IVpc;
}

export class ManagedAirflow extends Construct {
  securityGroup: ec2.SecurityGroup;
  bucket: s3.Bucket;
  role: iam.Role;

  constructor(scope: Construct, id: string, props: ManagedAirflowProps) {
    super(scope, id);

    const vpc = props.vpc;
    const mwaaEnvName = this.node.path.replace(/\//g, '-');

    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', { vpc });
    this.securityGroup.connections.allowInternally(ec2.Port.allTraffic());

    this.bucket = new s3.Bucket(this, 'Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    this.role = new iam.Role(this, 'Role', {
      description: 'The IAM role used by your environment to access your DAG code, write logs, and perform other actions.',
      assumedBy: new iam.ServicePrincipal('airflow-env.amazonaws.com'),
      inlinePolicies: {
        'MWAA-Execution-Policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['airflow:PublishMetrics'],
              resources: [`arn:${cdk.Aws.PARTITION}:airflow:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:environment/${mwaaEnvName}`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.DENY,
              actions: ['s3:ListAllMyBuckets'],
              resources: [
                `${this.bucket.bucketArn}`,
                `${this.bucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:GetObject*',
                's3:GetBucket*',
                's3:List*',
              ],
              resources: [
                `${this.bucket.bucketArn}`,
                `${this.bucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'logs:CreateLogStream',
                'logs:CreateLogGroup',
                'logs:PutLogEvents',
                'logs:GetLogEvents',
                'logs:GetLogRecord',
                'logs:GetLogGroupFields',
                'logs:GetQueryResults',
              ],
              resources: [`arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:airflow-${mwaaEnvName}-*`],
            }),
            new iam.PolicyStatement({
              actions: ['logs:DescribeLogGroups'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: ['cloudwatch:PutMetricData'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'sqs:ChangeMessageVisibility',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
                'sqs:GetQueueUrl',
                'sqs:ReceiveMessage',
                'sqs:SendMessage',
              ],
              resources: [`arn:${cdk.Aws.PARTITION}:sqs:${cdk.Aws.REGION}:*:airflow-celery-*`],
            }),
            new iam.PolicyStatement({
              actions: [
                'kms:Decrypt',
                'kms:DescribeKey',
                'kms:GenerateDataKey*',
                'kms:Encrypt',
              ],
              notResources: [`arn:aws:kms:*:${cdk.Aws.ACCOUNT_ID}:key/*`],
              conditions: {
                StringLike: {
                  'kms:ViaService': [`sqs.${cdk.Aws.REGION}.amazonaws.com`],
                },
              },
            }),
          ],
        }),
      },
    });

    const environment = new mwaa.CfnEnvironment(this, 'Environment', {
      name: mwaaEnvName,
      airflowVersion: '2.2.2',
      weeklyMaintenanceWindowStart: 'FRI:03:30', // UTC
      sourceBucketArn: this.bucket.bucketArn,
      dagS3Path: 'dags',
      //pluginsS3Path: 'plugins.zip',
      //requirementsS3Path: 'requirements.txt',
      webserverAccessMode: 'PUBLIC_ONLY',
      networkConfiguration: {
        securityGroupIds: [this.securityGroup.securityGroupId],
        subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId).slice(0, 2),
      },
      loggingConfiguration: {
        taskLogs: { enabled: true, logLevel: 'INFO' },
        webserverLogs: { enabled: true, logLevel: 'WARNING' },
        schedulerLogs: { enabled: true, logLevel: 'WARNING' },
        workerLogs: { enabled: true, logLevel: 'WARNING' },
        dagProcessingLogs: { enabled: true, logLevel: 'WARNING' },
      },
      executionRoleArn: this.role.roleArn,
    });

  }
}
