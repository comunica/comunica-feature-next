import type { Patch } from '@traqula/core';
import type * as T12 from '@traqula/rules-sparql-1-2';

export type SparqlNextNodes =
  | Exclude<T12.Sparql12Nodes, T12.Query>
  | Query;

export type SparqlQuery = Query | T12.Update;

export type Query =
  | Exclude<T12.Query, T12.QueryConstruct>
  | QueryConstruct;

export type QueryConstruct = Patch<T12.QueryConstruct, {
  template: T12.Quads[];
}>;
