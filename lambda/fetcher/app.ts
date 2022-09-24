import * as t from 'io-ts';
import { isLeft } from 'fp-ts/lib/Either';
import reporter from 'io-ts-reporters';
import { Logger } from '@aws-lambda-powertools/logger';
import Parser from './parser';

const logger = new Logger({
  logLevel: 'INFO',
  serviceName: 'notify_school_rss_fetcher',
});

const EventValidator = t.type({
  rssUrl: t.string,
  lastUpdateTime: t.string,
});

type EventType = t.TypeOf<typeof EventValidator>;

function isEventType(arg: unknown): arg is EventType {
  const v = EventValidator.decode(arg);

  if (isLeft(v)) {
    logger.error('event: bad type', { detail: reporter.report(v) });
    return false;
  }

  return true;
}

const WhatsNewValidator = t.type({
  title: t.union([t.string, t.undefined]),
  items: t.array(
    t.type({
      title: t.string,
      link: t.string,
      isoDate: t.string,
    }),
  ),
  lastUpdateTime: t.string,
});

type WhatsNewType = t.TypeOf<typeof WhatsNewValidator>;

function getDate(dateString: string): Date {
  const epoch = Date.parse(dateString);

  if (Number.isNaN(epoch)) {
    logger.warn('bad date-string', { detail: dateString });
  }

  return new Date(epoch);
}

export async function entryPoint(event: unknown): Promise<WhatsNewType> {
  try {
    logger.addPersistentLogAttributes({ event });
    logger.info('Application started.');

    if (!isEventType(event)) {
      logger.error('Bad Event.');
      throw new Error();
    }

    const lastUpdateTime = getDate(event.lastUpdateTime);

    if (Number.isNaN(lastUpdateTime.getTime())) {
      logger.error('Bad Date Format.');
      throw new Error();
    }

    const parser = new Parser();
    const feed = await parser.parseURL(event.rssUrl);

    const items = feed.items.flatMap((item) => {
      if (item.isoDate == null) {
        logger.warn("item don't have isoDate", { detail: item });
        return [];
      }

      if (item.title == null) {
        logger.warn("item don't have title", { detail: item });
        return [];
      }

      if (item.link == null) {
        logger.warn("item don't have link", { detail: item });
        return [];
      }

      const pubDate = getDate(item.isoDate);

      if (pubDate <= lastUpdateTime) {
        return [];
      }

      return [{
        title: item.title, link: item.link, isoDate: item.isoDate,
      }];
    });

    const newLastUpdateTime = items.length > 0
      ? items.map((item) => item.isoDate).reduce(
        (acc, cur) => (getDate(acc) > getDate(cur) ? acc : cur),
      )
      : event.lastUpdateTime;

    return { title: feed.title, items, lastUpdateTime: newLastUpdateTime };
  } finally {
    logger.info('Application ended.');
  }
}

export function getLogger(): Logger {
  return logger;
}
