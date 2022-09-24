import * as app from '../../../lambda/fetcher/app';

jest.mock('@aws-lambda-powertools/logger');

// eslint-disable-next-line func-names
jest.mock('../../../lambda/fetcher/parser', () => function () {
  return {
    parseURL: (url: string) => {
      if (url === 'http://goodurl/') {
        return Promise.resolve({
          title: 'TITLE',
          items: [
            { title: 'TITLE0', link: 'http://link0/', isoDate: '2022-07-31T00:00:00Z' },
            { title: 'TITLE1', link: 'http://link1/', isoDate: '2022-08-01T00:00:00Z' },
            { title: 'TITLE2', link: 'http://link2/', isoDate: '2022-08-02T00:00:00Z' },
            { title: 'TITLE3', link: 'http://link3/', isoDate: '2022-08-01T12:00:00Z' },
            { title: 'TITLE4', link: 'http://link4/' },
            { title: 'TITLE5', isoDate: '2022-08-02T00:00:00Z' },
            { link: 'http://link6/', isoDate: '2022-08-02T00:00:00Z' },
          ],
        });
      }

      return Promise.resolve({ items: [] });
    },
  };
});

describe('lambda/fetcher/app', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('entryPoint', async () => {
    const feed = await app.entryPoint({
      rssUrl: 'http://goodurl/', lastUpdateTime: '2022-07-31T12:00:00Z',
    });

    expect(feed.title).toBe('TITLE');
    expect(feed.items.length).toBe(3);
    expect(feed.items).toContainEqual({
      title: 'TITLE1',
      link: 'http://link1/',
      isoDate: '2022-08-01T00:00:00Z',
    });
    expect(feed.items).toContainEqual({
      title: 'TITLE2',
      link: 'http://link2/',
      isoDate: '2022-08-02T00:00:00Z',
    });
    expect(feed.items).toContainEqual({
      title: 'TITLE3',
      link: 'http://link3/',
      isoDate: '2022-08-01T12:00:00Z',
    });
    expect(feed.lastUpdateTime).toBe('2022-08-02T00:00:00Z');
  });

  it('entryPoint: empty', async () => {
    const feed = await app.entryPoint({
      rssUrl: 'http://goodurl/', lastUpdateTime: '2022-08-03T00:00:00Z',
    });

    expect(feed.title).toBe('TITLE');
    expect(feed.items.length).toBe(0);
    expect(feed.lastUpdateTime).toBe('2022-08-03T00:00:00Z');
  });

  it('entryPoint: bad date format', async () => {
    const handlerPromise = app.entryPoint({
      rssUrl: 'http://goodurl/', lastUpdateTime: '2022-08-01T12:00:99Z',
    });

    await expect(handlerPromise).rejects.toThrow();
  });

  it('entryPoint: bad event', async () => {
    const handlerPromise = app.entryPoint({});
    await expect(handlerPromise).rejects.toThrow();
  });

  it('getLogger', async () => {
    const logger = app.getLogger();
    expect(logger).toBeDefined();
  });
});
