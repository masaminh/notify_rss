import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as NotifyRss from '../lib/notify_rss-stack';

describe('CDK Stack', () => {
  it('Resources', () => {
    const app = new cdk.App();
    const prop = {
      rssUrl: 'https://www.test/',
      queueArn: 'arn:aws:sqs:ap-northeast-1:000000000000:XXXX',
      webhookName: 'WEBHOOKNAME',
    };

    // WHEN
    const stack = new NotifyRss.NotifyRssStack(app, 'MyTestStack', prop);
    // THEN
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', {});
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'EXPRESS',
    });
    template.hasResourceProperties('AWS::Events::Rule', {});
  });
});
