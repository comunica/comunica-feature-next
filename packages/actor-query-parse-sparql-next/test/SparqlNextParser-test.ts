import fs from 'node:fs';
import path from 'node:path';
import type { BaseQuad } from '@rdfjs/types';
import type { Algebra } from '@traqula/algebra-transformations-1-2';
import { AstFactory, lex as l12 } from '@traqula/rules-sparql-1-2';
import { positiveTest, importSparql11NoteTests, negativeTest, getStaticFilePath } from '@traqula/test-utils';
import { DataFactory } from 'rdf-data-factory';
import { SparqlNextParser, sparqlNextParserBuilder, toAlgebra, toAst } from '../lib';
import type { QueryConstruct } from '../lib/astTypes';

describe('a SPARQL 1.2 parser', () => {
  const astFactory = new AstFactory({ tracksSourceLocation: false });
  const sourceTrackingAstFactory = new AstFactory();
  const sourceTrackingParser = new SparqlNextParser({
    defaultContext: { astFactory: sourceTrackingAstFactory },
    lexerConfig: { positionTracking: 'full' },
  });
  const noSourceTrackingParser = new SparqlNextParser({ defaultContext: { astFactory }});
  const context = { prefixes: { ex: 'http://example.org/' }};

  beforeEach(() => {
    astFactory.resetBlankNodeCounter();
    sourceTrackingAstFactory.resetBlankNodeCounter();
  });

  function _sinkAst(suite: string, test: string, response: object): void {
    const dir = getStaticFilePath();
    const fileLoc = path.join(dir, 'ast', 'ast-source-tracked', suite, `${test}.json`);

    fs.writeFileSync(fileLoc, JSON.stringify(response, null, 2));
  }

  /**
   * The SPARQL Next parser represents a CONSTRUCT template as a `Quads[]` list
   * (`CONSTRUCT { QUAD ... { ... } } WHERE { ... }`) instead of the single
   * `PatternBgp` used by the upstream SPARQL 1.1/1.2 grammar. The shared AST
   * fixtures still encode the old shape, so those CONSTRUCT cases are skipped
   * here until the fixtures are regenerated for the new template representation.
   */
  function usesSparql12ConstructTemplateAst(suite: string, name: string): boolean {
    const query = fs.readFileSync(getStaticFilePath('ast', 'sparql', suite, `${name}.sparql`), 'utf8');
    return /\bconstruct\b/iu.test(query);
  }

  it('passes chevrotain validation', () => {
    sparqlNextParserBuilder.build({
      tokenVocabulary: l12.sparql12LexerBuilder.tokenVocabulary,
      lexerConfig: {
        skipValidations: false,
        ensureOptimizations: true,
      },
      parserConfig: {
        skipValidations: false,
      },
    });
  });

  describe('positive sparql 1.1', () => {
    const tests = [ ...positiveTest('sparql-1-1', name => !usesSparql12ConstructTemplateAst('sparql-1-1', name)) ];
    it.each(tests)('can parse $name', async({ statics }) => {
      const { query, astWithSource } = await statics();
      const astNoSource = astFactory.forcedAutoGenTree(<object> astWithSource);
      const res: unknown = sourceTrackingParser.parse(query, context);
      expect(res)
        .toEqualParsedQueryIgnoring(obj => astFactory.isTriple(obj), [ 'annotations' ], astWithSource);
      const resNoSource = noSourceTrackingParser.parse(query, context);
      expect(resNoSource)
        .toEqualParsedQueryIgnoring(obj => astFactory.isTriple(obj), [ 'annotations' ], astNoSource);
    });
  });

  describe('negative SPARQL 1.1', () => {
    it.each([ ...negativeTest('sparql-1-1-invalid') ])('should NOT parse $name', async({ statics }) => {
      const { query } = await statics();
      expect(() => sourceTrackingParser.parse(query, context)).toThrow(/./u);
      expect(() => noSourceTrackingParser.parse(query, context)).toThrow(/./u);
    });
  });

  describe('positive sparql 1.2', () => {
    const tests = [ ...positiveTest('sparql-1-2', name => !usesSparql12ConstructTemplateAst('sparql-1-2', name)) ];
    it.each(tests)('can parse $name', async({ statics }) => {
      const { query, astWithSource } = await statics();
      const astNoSource = astFactory.forcedAutoGenTree(<object> astWithSource);
      const res: unknown = sourceTrackingParser.parse(query, context);
      // _sinkAst('sparql-1-2', name, <object> res);
      expect(res).toEqualParsedQuery(astWithSource);
      const resNoSource = noSourceTrackingParser.parse(query, context);
      expect(resNoSource)
        .toEqualParsedQuery(astNoSource);
    });
  });

  describe('negative sparql 1.2', () => {
    const skip = new Set([
      'sparql-1-2-syntax-compound-tripleterm-subject',
      'sparql-1-2-syntax-subject-tripleterm',
    ]);
    const negTests = negativeTest('sparql-1-2-invalid', name => !skip.has(name));
    it.each([ ...negTests ])('should NOT parse $name', async({ statics }) => {
      const { query } = await statics();
      expect(() => sourceTrackingParser.parse(query, context)).toThrow(/./u);
      expect(() => noSourceTrackingParser.parse(query, context)).toThrow(/./u);
    });
  });

  describe('specific sparql 1.1 with source tracking', () => {
    importSparql11NoteTests(sourceTrackingParser, new DataFactory<BaseQuad>());
  });

  describe('specific sparql 1.1 without source tracking', () => {
    importSparql11NoteTests(noSourceTrackingParser, new DataFactory<BaseQuad>());
  });

  it('can be instantiated without arguments', () => {
    const parser = new SparqlNextParser();
    expect(parser.parse('SELECT * WHERE { ?s ?p ?o }')).toBeDefined();
  });

  it('can convert algebra back to AST via toAst', () => {
    const parser = new SparqlNextParser();
    const parsed = parser.parse('SELECT * WHERE { ?s ?p ?o }');
    const algebra = toAlgebra(parsed);
    expect(toAst(algebra)).toBeDefined();
  });

  describe('GRAPH operators inside CONSTRUCT templates', () => {
    const parser = new SparqlNextParser();
    const graphContext = { prefixes: { ex: 'http://example.org/' }};

    it('parses a GRAPH block inside the CONSTRUCT template', () => {
      const query = 'CONSTRUCT { ?s ?p ?o . GRAPH ?g { ?a ?b ?c } } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      expect(parsed).toMatchObject({
        template: [
          { subType: 'bgp' },
          { type: 'graph', graph: { value: 'g' }},
        ],
      });
    });

    it('assigns the graph of a named GRAPH block to the CONSTRUCT quads', () => {
      const query =
        'CONSTRUCT { GRAPH <http://example.org/g> { ?a ?b ?c } } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'NamedNode', value: 'http://example.org/g' }},
        ],
      });
    });

    it('assigns the graph of a variable GRAPH block to the CONSTRUCT quads', () => {
      const query = 'CONSTRUCT { GRAPH ?g { ?a ?b ?c } } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'Variable', value: 'g' }},
        ],
      });
    });

    it('keeps triples outside GRAPH blocks in the default graph', () => {
      const query =
        'CONSTRUCT { ?s ?p ?o . GRAPH ?g { ?a ?b ?c } } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'DefaultGraph' }},
          { graph: { termType: 'Variable', value: 'g' }},
        ],
      });
    });

    it('applies the graph to every quad expanded from a collection', () => {
      const query =
        'CONSTRUCT { GRAPH ?g { ?s ex:p ( ex:a ex:b ) } } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'Variable', value: 'g' }},
          { graph: { termType: 'Variable', value: 'g' }},
          { graph: { termType: 'Variable', value: 'g' }},
          { graph: { termType: 'Variable', value: 'g' }},
          { graph: { termType: 'Variable', value: 'g' }},
        ],
      });
    });

    it('still produces default-graph quads when no GRAPH block is used', () => {
      const query = 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'DefaultGraph' }},
        ],
      });
    });

    it('supports the CONSTRUCT WHERE shorthand without a GRAPH block', () => {
      const query = 'CONSTRUCT WHERE { ?s ?p ?o }';
      const parsed = parser.parse(query, graphContext);
      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'DefaultGraph' }},
        ],
      });
    });

    it('supports a GRAPH block inside the CONSTRUCT WHERE shorthand', () => {
      const query = 'CONSTRUCT WHERE { GRAPH ?g { ?s ?p ?o } }';
      const parsed = <QueryConstruct> parser.parse(query, graphContext);
      expect(parsed).toMatchObject({
        template: [
          { type: 'graph', graph: { value: 'g' }},
        ],
      });

      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'Variable', value: 'g' }},
        ],
      });
    });

    it('supports mixing plain triples and a GRAPH block in the CONSTRUCT WHERE shorthand', () => {
      const query = 'CONSTRUCT WHERE { ?s ?p ?o . GRAPH ?g { ?a ?b ?c } }';
      const parsed = <QueryConstruct> parser.parse(query, graphContext);
      expect(parsed).toMatchObject({
        template: [
          { type: 'pattern' },
          { type: 'graph' },
        ],
      });

      const algebra = <Algebra.Construct> toAlgebra(parsed, { prefixes: graphContext.prefixes });
      expect(algebra).toMatchObject({
        template: [
          { graph: { termType: 'DefaultGraph' }},
          { graph: { termType: 'Variable', value: 'g' }},
        ],
      });
    });
  });
});
