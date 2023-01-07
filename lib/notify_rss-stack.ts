import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

type NotifyRssStaciProps = StackProps & {
  rssUrl: string,
  queueArn: string,
  webhookName: string,
};

// eslint-disable-next-line import/prefer-default-export
export class NotifyRssStack extends Stack {
  constructor(scope: Construct, id: string, props: NotifyRssStaciProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'StatusTable', {
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const stateGetLastUpdateTime = new sfnTasks.DynamoGetItem(this, 'GetLastUpdateTime', {
      table,
      key: { key: sfnTasks.DynamoAttributeValue.fromString('lastUpdateTime') },
      resultPath: '$.result',
    });

    const stateFetch = new sfnTasks.LambdaInvoke(this, 'Fetch', {
      lambdaFunction: new lambdaNodeJs.NodejsFunction(this, 'FetchFunction', {
        entry: 'lambda/fetcher/handler.ts',
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        logRetention: logs.RetentionDays.ONE_MONTH,
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          sourceMap: true,
          forceDockerBundling: false,
        },
      }),
      payload: sfn.TaskInput.fromObject({
        lastUpdateTime: sfn.JsonPath.stringAt('$.result.Item.value.S'),
        rssUrl: props.rssUrl,
      }),
    });

    const stateSetCurrentTime = new sfnTasks.DynamoPutItem(this, 'SetCurrentTime', {
      table,
      item: {
        key: sfnTasks.DynamoAttributeValue.fromString('lastUpdateTime'),
        value: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.time')),
      },
    });

    const stateFormatMessage = new sfn.Pass(this, 'FormatMessage', {
      parameters: {
        'message.$': "States.Format('*{}*\n<{}|{}>',$.title,$.mapped.link,$.mapped.title)",
      },
    });

    const stateSendMessage = new sfnTasks.SqsSendMessage(this, 'SendMessage', {
      queue: sqs.Queue.fromQueueArn(this, 'Queue', props.queueArn),
      messageBody: sfn.TaskInput.fromObject({
        webhookname: props.webhookName,
        message: sfn.JsonPath.stringAt('$.message'),
      }),
    });

    const stateSetLastUpdateTime = new sfnTasks.DynamoPutItem(this, 'SetLastUpdateTime', {
      table,
      item: {
        key: sfnTasks.DynamoAttributeValue.fromString('lastUpdateTime'),
        value: sfnTasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.Payload.lastUpdateTime')),
      },
    });

    const stateMachine = new sfn.StateMachine(this, `${id}-StateMachine`, {
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definition: stateGetLastUpdateTime.next(
        new sfn.Choice(this, 'JudgeExistanceOfLastUpdateTime')
          .when(
            sfn.Condition.isNotPresent('$.result.Item.value.S'),
            stateSetCurrentTime,
          )
          .otherwise(stateFetch.next(
            new sfn.Map(this, 'LoopMessageItems', {
              itemsPath: sfn.JsonPath.stringAt('$.Payload.items'),
              parameters: {
                'title.$': '$.Payload.title',
                'mapped.$': '$$.Map.Item.Value',
              },
              resultPath: sfn.JsonPath.DISCARD,
            }).iterator(
              stateFormatMessage.next(stateSendMessage),
            ).next(stateSetLastUpdateTime),
          )),
      ),
    });

    // eslint-disable-next-line no-new
    new events.Rule(this, 'EventRule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new eventsTargets.SfnStateMachine(stateMachine)],
    });
  }
}
