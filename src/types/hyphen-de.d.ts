declare module "hyphen/de" {
  type HyphenOptions = {
    hyphenChar?: string;
    minWordLength?: number;
  };

  export function hyphenateSync(
    text: string,
    options?: HyphenOptions,
  ): string;

  export function hyphenateHTMLSync(
    html: string,
    options?: HyphenOptions,
  ): string;
}
