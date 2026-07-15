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

  describe('CONSTRUCT with GRAPH blocks in the template', () => {
    const turtleValue = [
      '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
      '<http://example.org/s> <http://example.org/p2> <http://example.org/o2> .',
    ].join('\n');
    const context = { sources: [
      { type: 'serialized', value: turtleValue, mediaType: 'text/turtle', baseIRI: 'http://example.org/' },
    ]};

    it('places matched triples in the default graph without a GRAPH block', async() => {
      const query = 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }';
      const quads = await arrayifyStream(await engine.queryQuads(query, context));
      expect(quads).toHaveLength(2);
      for (const quad of quads) {
        expect(quad.graph.termType).toBe('DefaultGraph');
      }
    });

    it('assigns a named node GRAPH block to the CONSTRUCT quads', async() => {
      const query = 'CONSTRUCT { GRAPH <http://example.org/g> { ?s ?p ?o } } WHERE { ?s ?p ?o }';
      const quads = await arrayifyStream(await engine.queryQuads(query, context));
      expect(quads).toHaveLength(2);
      for (const quad of quads) {
        expect(quad.graph.termType).toBe('NamedNode');
        expect(quad.graph.value).toBe('http://example.org/g');
      }
    });

    it('assigns a variable GRAPH block to the CONSTRUCT quads', async() => {
      const query = 'CONSTRUCT { GRAPH ?s { ?s ?p ?o } } WHERE { ?s ?p ?o }';
      const quads = await arrayifyStream(await engine.queryQuads(query, context));
      expect(quads).toHaveLength(2);
      for (const quad of quads) {
        expect(quad.graph.termType).toBe('NamedNode');
        expect(quad.graph.value).toBe('http://example.org/s');
      }
    });

    it('keeps triples outside a GRAPH block in the default graph while GRAPH quads get their graph', async() => {
      const query = 'CONSTRUCT { ?s ?p ?o . GRAPH <http://example.org/g> { ?s ?p2 ?o2 } } WHERE { ' +
        '?s ?p ?o . ?s ?p2 ?o2 . FILTER(?p != ?p2) }';
      const quads = await arrayifyStream(await engine.queryQuads(query, context));
      const defaultGraphQuads = quads.filter(quad => quad.graph.termType === 'DefaultGraph');
      const namedGraphQuads = quads.filter(quad => quad.graph.termType === 'NamedNode');
      expect(defaultGraphQuads.length).toBeGreaterThan(0);
      expect(namedGraphQuads.length).toBeGreaterThan(0);
      for (const quad of namedGraphQuads) {
        expect(quad.graph.value).toBe('http://example.org/g');
      }
    });
  });
});
