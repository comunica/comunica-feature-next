/**
 * We redefine our algebra components to use interfaces instead of type unions.
 * Thereby opening up the algebra for unknown extensions
 */

import type { Algebra } from '@comunica/utils-algebra';
import type { TypesNext } from './TypesNext';

// Redefinitions of types
export type KnownOperation = Algebra.KnownOperation | Lateral;
export type KnownExpression = Algebra.KnownExpression;
export type KnownPropertyPathSymbol = Algebra.KnownPropertyPathSymbol;
export type KnownUpdate = Algebra.KnownUpdate;

export type TypedOperation<T extends Algebra.Types> = Extract<KnownOperation, { type: T }>;
export type TypedExpression<T extends Algebra.ExpressionTypes> = Extract<KnownOperation, { subType: T }>;

export type Lateral = {
  type: TypesNext.LATERAL;
  input: [Algebra.Operation, Algebra.Operation];
};
