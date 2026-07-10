import { ActorQueryParse } from '@comunica/bus-query-parse';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { ActorQueryParseSparqlNext } from '../lib';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

describe('ActorQueryParseSparql', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('The ActorQueryParseSparql module', () => {
    it('should be a function', () => {
      expect(ActorQueryParseSparqlNext).toBeInstanceOf(Function);
    });

    it('should be a ActorQueryParseSparql constructor', () => {
      expect(new (<any> ActorQueryParseSparqlNext)({ name: 'actor', bus })).toBeInstanceOf(ActorQueryParseSparqlNext);
      expect(new (<any> ActorQueryParseSparqlNext)({ name: 'actor', bus })).toBeInstanceOf(ActorQueryParse);
    });

    it('should not be able to create new ActorQueryParseSparql objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryParseSparqlNext)();
      }).toThrow(`Class constructor ActorQueryParseSparqlNext cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQueryParseSparql instance', () => {
    let actor: ActorQueryParseSparqlNext;
    let context: IActionContext;

    beforeEach(() => {
      actor = new ActorQueryParseSparqlNext({ name: 'actor', bus });
      context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
    });

    it('should not test on the graphql format', async() => {
      await expect(actor.test({
        query: 'a',
        queryFormat: { language: 'graphql', version: '1.0' },
        context,
      }))
        .resolves.toFailTest(`This actor can only parse SPARQL queries`);
    });

    it('should test on no format', async() => {
      await expect(actor.test({
        query: 'a',
        context,
      })).resolves.toPassTestVoid();
    });

    it('should test on the sparql format', async() => {
      await expect(actor.test({
        query: 'a',
        queryFormat: { language: 'sparql', version: '1.1' },
        context,
      }))
        .resolves.toPassTestVoid();
    });

    it('should run', async() => {
      const result = await actor.run({ query: 'SELECT * WHERE { ?a a ?b }', context });
      expect(result).toMatchObject({
        operation: AF.createProject(AF.createBgp([ AF.createPattern(
          DF.variable('a'),
          DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          DF.variable('b'),
        ) ]), [ DF.variable('a'), DF.variable('b') ]),
      });
    });

    it('should run for a SPARQL 1.2 query', async() => {
      const result = await actor.run({ query: 'SELECT * WHERE { << ?a a ?q >> a ?b }', context });
      expect(result).toBeTruthy();
    });

    it('should run for an update query', async() => {
      const result = await actor.run({
        query: 'INSERT { <http://example/egbook> <http://ex.org/p> "A" } WHERE {}',
        context,
      });
      expect(result).toMatchObject({
        operation: AF.createDeleteInsert(undefined, [ AF.createPattern(
          DF.namedNode('http://example/egbook'),
          DF.namedNode('http://ex.org/p'),
          DF.literal('A'),
        ) ]),
      });
    });

    it('should run with an overridden baseIRI', async() => {
      const result = await actor.run({
        query: 'BASE <http://example.org/book/> SELECT * WHERE { ?a a ?b }',
        context,
      });
      expect(result).toMatchObject({
        baseIRI: 'http://example.org/book/',
        operation: AF.createProject(AF.createBgp([ AF.createPattern(
          DF.variable('a'),
          DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          DF.variable('b'),
        ) ]), [ DF.variable('a'), DF.variable('b') ]),
      });
    });

    it('should run with a PREFIX declaration', async() => {
      const result = await actor.run({
        query: 'PREFIX ex: <http://example.org/> SELECT * WHERE { ?a a ?b }',
        context,
      });
      expect(result.baseIRI).toBeUndefined();
      expect(result.operation).toBeTruthy();
    });
  });
});
