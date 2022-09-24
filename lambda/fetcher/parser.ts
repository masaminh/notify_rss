import RssParser from 'rss-parser';

export default class Parser {
  constructor() {
    this.parser = new RssParser();
  }

  public async parseURL(url: string) {
    return this.parser.parseURL(url);
  }

  private parser: RssParser;
}
