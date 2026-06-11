import { expect, test } from '@playwright/test';

declare const Comunica: any;

const browserBundlePath = 'engines/query-sparql/comunica-browser.js';

test.describe('System test: QuerySparql', () => {
  test.beforeEach(async({ page }) => {
    await page.addScriptTag({ path: browserBundlePath });
  });

  test.describe('instantiated multiple times', () => {
    test('should contain different actors', async({ page }) => {
      const result = await page.evaluate(() => {
        const engine = new Comunica.QueryEngine();
        const engine2 = new Comunica.QueryEngine();
        const actorInitQuery1 = engine.actorInitQuery;
        const actorInitQuery2 = engine2.actorInitQuery;

        return {
          differentActors: actorInitQuery1 !== actorInitQuery2,
          sameActor1: actorInitQuery1 === engine.actorInitQuery,
          sameActor2: actorInitQuery2 === engine2.actorInitQuery,
        };
      });

      expect(result.sameActor1).toBe(true);
      expect(result.sameActor2).toBe(true);
      expect(result.differentActors).toBe(true);
    });
  });

  test(
    'query simple SPO on a raw RDF document should return the valid result with a turtle data source',
    async({ page }) => {
      const query = 'CONSTRUCT WHERE { ?s ?p ?o }';

      const turtleValue = '<http://example.org/s> <http://example.org/p> <http://example.org/o>. <http://example.org/s> <http://example.org/p2> <http://example.org/o2>.';
      const context = { sources: [
        { type: 'serialized', value: turtleValue, mediaType: 'text/turtle', baseIRI: 'http://example.org/' },
      ]};

      const result = await page.evaluate(async({ query, context }) => {
        const engine = new Comunica.QueryEngine();
        const quads = await (await engine.queryQuads(query, context)).toArray();
        return quads.map((quad: any) => ({
          graph: { termType: quad.graph.termType, value: quad.graph.value },
          object: { termType: quad.object.termType, value: quad.object.value },
          predicate: { termType: quad.predicate.termType, value: quad.predicate.value },
          subject: { termType: quad.subject.termType, value: quad.subject.value },
        }));
      }, { query, context });

      expect(result).toHaveLength(expectedResult.length);
      expect(result).toMatchObject(expectedResult);
    },
  );
});
