import { completeGeneratorContext } from '@traqula/rules-sparql-1-2';
import { SparqlNextParser, sparqlNextGeneratorBuilder, toAlgebra, toAst } from '../lib';
import type { PatternLateral } from '../lib/astTypes';

/**
 * End-to-end coverage of the SPARQL Next `LATERAL` support: parsing to AST,
 * translating to algebra (including variable-scope handling), translating back
 * to AST, and regenerating the query string.
 */
describe('SPARQL Next LATERAL', () => {
  const parser = new SparqlNextParser();
  const generator = sparqlNextGeneratorBuilder.build();

  function generate(ast: Parameters<typeof generator.queryOrUpdate>[0]): string {
    return generator.queryOrUpdate(ast, completeGeneratorContext({})).trim();
  }

  // Recursively find the first algebra/AST node with the given `type`.
  function findByType(node: unknown, type: string): any {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    if ((<{ type?: unknown }> node).type === type) {
      return node;
    }
    for (const value of Object.values(node)) {
      const found = findByType(value, type);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  describe('parsing', () => {
    it('parses a LATERAL graph pattern into a lateral AST node', () => {
      const ast: any = parser.parse('SELECT * WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 } }');
      const lateral: PatternLateral = ast.where.patterns.find((p: any) => p.subType === 'lateral');
      expect(lateral).toBeDefined();
      expect(lateral.type).toBe('pattern');
      expect(lateral.patterns).toHaveLength(1);
    });

    it('parses a LATERAL nested inside another LATERAL', () => {
      const ast: any = parser.parse('SELECT * WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 LATERAL { ?o2 ?p3 ?o3 } } }');
      const outer: any = ast.where.patterns.find((p: any) => p.subType === 'lateral');
      expect(outer).toBeDefined();
      expect(findByType(outer.patterns, 'pattern')).toBeDefined();
    });
  });

  describe('toAlgebra', () => {
    it('translates LATERAL to a dedicated lateral algebra node', () => {
      const algebra: any = toAlgebra(parser.parse('SELECT ?s ?o2 WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 } }'));
      const lateral = findByType(algebra, 'lateral');
      expect(lateral).toBeDefined();
      expect(lateral.input).toHaveLength(2);
    });

    it('exposes variables bound inside LATERAL to a wildcard projection', () => {
      const algebra: any = toAlgebra(parser.parse('SELECT * WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 } }'));
      const project = findByType(algebra, 'project');
      const projected = project.variables.map((v: any) => v.value).sort();
      expect(projected).toEqual([ 'o', 'o2', 'p', 'p2', 's' ]);
    });

    it('exposes variables bound inside a nested LATERAL to a wildcard projection', () => {
      const algebra: any = toAlgebra(
        parser.parse('SELECT * WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 LATERAL { ?o2 ?p3 ?o3 } } }'),
      );
      const project = findByType(algebra, 'project');
      const projected = project.variables.map((v: any) => v.value).sort();
      expect(projected).toEqual([ 'o', 'o2', 'o3', 'p', 'p2', 'p3', 's' ]);
    });

    it('handles LATERAL nested inside OPTIONAL', () => {
      const algebra: any = toAlgebra(parser.parse('SELECT * WHERE { ?s ?p ?o OPTIONAL { LATERAL { ?o ?p2 ?o2 } } }'));
      expect(findByType(algebra, 'lateral')).toBeDefined();
      const project = findByType(algebra, 'project');
      expect(project.variables.map((v: any) => v.value)).toContain('o2');
    });
  });

  describe('toAst and generation (round-trip)', () => {
    it('regenerates a LATERAL query from its algebra', () => {
      const query = 'SELECT ?s ?o2 WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 } }';
      const generated = generate(<any> toAst(toAlgebra(parser.parse(query))));
      expect(generated).toContain('LATERAL');
      // The regenerated query should parse back into an equivalent algebra with a lateral node.
      expect(findByType(toAlgebra(parser.parse(generated)), 'lateral')).toBeDefined();
    });

    it('regenerates a query with a non-lateral graph pattern (OPTIONAL) unchanged', () => {
      const query = 'SELECT * WHERE { ?s ?p ?o OPTIONAL { ?o ?p2 ?o2 } }';
      const generated = generate(<any> toAst(toAlgebra(parser.parse(query))));
      expect(generated).toContain('OPTIONAL');
      expect(generated).not.toContain('LATERAL');
    });

    it('regenerates a nested LATERAL query from its algebra', () => {
      const query = 'SELECT * WHERE { ?s ?p ?o LATERAL { ?o ?p2 ?o2 LATERAL { ?o2 ?p3 ?o3 } } }';
      const generated = generate(<any> toAst(toAlgebra(parser.parse(query))));
      expect(generated.match(/LATERAL/gu)).toHaveLength(2);
    });
  });
});
