import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { ManagedAirflow } from './managed-airflow';

export class OpenMetadataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { natGateways: 1 });

    const db = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_3_02_0 }),
      storageEncrypted: true,
      instances: 1,
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MEDIUM),
        vpc,
      },
      defaultDatabaseName: 'openmetadata',
    });

    const openSearch = new opensearch.Domain(this, 'OpenSearch', {
      version: opensearch.EngineVersion.OPENSEARCH_1_3,
      enableVersionUpgrade: true,
      zoneAwareness: { availabilityZoneCount: 3 },
      vpc,
      capacity: {
        dataNodeInstanceType: 'r6g.large.search',
        dataNodes: 3,
        //masterNodeInstanceType: 'm6g.large.search',
        //masterNodes: 3,
      },
      ebs: {
        enabled: true,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
        volumeSize: 10,
      },
      //logging: {
      //  slowSearchLogEnabled: true,
      //  slowSearchLogGroup: new logs.LogGroup(this, 'SlowSearchLogs', { removalPolicy, retention }),
      //  slowIndexLogEnabled: true,
      //  slowIndexLogGroup: new logs.LogGroup(this, 'SlowIndexLogs', { removalPolicy, retention }),
      //  appLogEnabled: true,
      //  appLogGroup: new logs.LogGroup(this, 'AppLogs', { removalPolicy, retention }),
      //  auditLogEnabled: true,
      //  auditLogGroup: new logs.LogGroup(this, 'AuditLogs', { removalPolicy, retention }),
      //},
    });

    const airflow = new ManagedAirflow(this, 'Airflow', { vpc });

  }
}
