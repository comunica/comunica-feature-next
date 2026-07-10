import { parsedQueryMatchers } from '@traqula/test-utils';

declare global {
  // eslint-disable-next-line ts/no-namespace
  namespace jest {
    interface Matchers<R> {
      toEqualParsedQuery: (expected: unknown) => R;
      toEqualParsedQueryIgnoring: (selector: (obj: object) => boolean, keys: string[], expected: unknown) => R;
    }
  }
}

expect.extend(parsedQueryMatchers);
