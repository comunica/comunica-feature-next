/** @jest-environment setup-polly-jest/jest-environment-node */

import type { QueryBindings } from '@comunica/types';
import arrayifyStream from 'arrayify-stream';
import 'jest-rdf';
import '@comunica/utils-jest';
import { QueryEngine } from '../lib/QueryEngine';
import { fetch as cachedFetch } from './util';

globalThis.fetch = cachedFetch;

describe('System test: QuerySparql', () => {
  let engine: QueryEngine;
  beforeAll(() => {
    engine = new QueryEngine();
  });

  describe('instantiated multiple times', () => {
    it('should contain different actors', () => {
      const engine2 = new QueryEngine();

      expect((<any> engine).actorInitQuery).toBe((<any> engine).actorInitQuery);
      expect((<any> engine2).actorInitQuery).toBe((<any> engine2).actorInitQuery);
      expect((<any> engine).actorInitQuery).not.toBe((<any> engine2).actorInitQuery);
    });
  });

  it('query simple SPO on a raw RDF document with results', async() => {
    const result = <QueryBindings> await engine.query(`SELECT * WHERE {
      ?s ?p ?o.
    }`, { sources: <string[]> [ 'https://www.rubensworks.net/' ]});
    expect((await arrayifyStream(await result.execute())).length).toBeGreaterThan(100);
  });
});
