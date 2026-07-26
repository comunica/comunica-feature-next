import type { IActionQueryOperation, IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTestVoid } from '@comunica/core';
import type {
  BindingsStream,
  IActionContext,
  IQueryOperationResult,
  IQueryOperationResultBindings,
  MetadataBindings,
  MetadataVariable,
} from '@comunica/types';
import { Algebra, AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { getSafeBindings, materializeOperation } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { MultiTransformIterator, TransformIterator } from 'asynciterator';

export type Lateral = {
  type: 'lateral';
  input: [Algebra.Operation, Algebra.Operation];
};

export const lateralDisableKey = new ActionContextKey<boolean>('@comunica/actor-query-operation-lateral:disable');

/**
 * Collect the variables of `node` that are visible for LATERAL correlation, i.e. into which a
 * left-hand solution mapping may be substituted.
 *
 * The traversal descends into every sub-operation, except it treats a sub-SELECT (a `project`
 * operation) as a scope boundary: only the projected variables of a sub-SELECT are exposed, while
 * its internal, non-projected variables live in a separate scope and must not be correlated.
 * This implements SPARQL sub-query variable scoping for LATERAL (SEP-6): a variable hidden by a
 * sub-SELECT projection is a different variable and is therefore not substituted, whereas a variable
 * merely referenced (e.g. in a `FILTER`) at the LATERAL body scope is.
 */
export function collectCorrelatableVariables(node: unknown, variables: Set<string>): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectCorrelatableVariables(item, variables);
    }
    return;
  }
  if ((<RDF.Term> node).termType === 'Variable') {
    variables.add((<RDF.Variable> node).value);
    return;
  }
  const operation = <{ type?: string; variables?: RDF.Variable[] }> node;
  if (operation.type === Algebra.Types.PROJECT) {
    // Scope boundary: only the projected variables are visible; do not descend into the sub-SELECT.
    for (const variable of operation.variables ?? []) {
      variables.add(variable.value);
    }
    return;
  }
  for (const [ key, value ] of Object.entries(node)) {
    // Skip runtime bookkeeping (e.g. operation metadata), which is not part of the query scope
    // and may contain cyclic references.
    if (key !== 'metadata') {
      collectCorrelatableVariables(value, variables);
    }
  }
}

/**
 * A comunica lateral Query Operation Actor.
 */
export class ActorQueryOperationLateral extends ActorQueryOperationTypedMediated<Lateral> {
  public constructor(args: IActorQueryOperationLateralArgs) {
    super(args, 'lateral');
  }

  public override async test(action: IActionQueryOperation): Promise<TestResult<IActorTest>> {
    // Reject test if actor has been disabled
    if (action.context.get(lateralDisableKey) ?? false) {
      return failTest('');
    }
    return super.test(action);
  }

  public async testOperation(_operation: Lateral, _context: IActionContext): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async runOperation(operation: Lateral, context: IActionContext): Promise<IQueryOperationResult> {
    // Evaluate the LHS to get a stream of bindings
    const leftResult: IQueryOperationResultBindings = getSafeBindings(
      await this.mediatorQueryOperation.mediate({ operation: operation.input[0], context }),
    );

    // Get factories needed for materializing RHS with LHS bindings
    const dataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new AlgebraFactory(dataFactory);
    const bindingsFactory = new BindingsFactory(dataFactory);

    // Only variables that are visible in the RHS scope may be correlated (substituted) with the LHS
    // solution. Variables of the LHS hidden by a RHS sub-SELECT projection live in a different scope
    // and must NOT be injected, otherwise LATERAL would incorrectly correlate them (see SEP-6).
    const rhsCorrelatableVariables = new Set<string>();
    collectCorrelatableVariables(operation.input[1], rhsCorrelatableVariables);

    // For each LHS binding, inject it into the RHS pattern, evaluate, and merge results
    const bindingsStream: BindingsStream = new MultiTransformIterator(leftResult.bindingsStream, {
      autoStart: false,
      multiTransform: (lhsBinding: RDF.Bindings) => {
        // Restrict the injected solution to the variables that are visible in the RHS scope.
        const correlatedBinding = lhsBinding.filter(
          (_value: RDF.Term, key: RDF.Variable) => rhsCorrelatableVariables.has(key.value),
        );
        const materializedRhs = materializeOperation(
          operation.input[1],
          correlatedBinding,
          algebraFactory,
          bindingsFactory,
        );
        return new TransformIterator<RDF.Bindings>(
          async() => {
            const rhsResult: IQueryOperationResultBindings = getSafeBindings(
              await this.mediatorQueryOperation.mediate({ operation: materializedRhs, context }),
            );
            // Merge each RHS binding with the LHS binding (null means skip on conflict)
            return rhsResult.bindingsStream.map(
              (rhsBinding: RDF.Bindings) => lhsBinding.merge(rhsBinding) ?? null,
            );
          },
          { maxBufferSize: 128, autoStart: false },
        );
      },
    });

    // Compute metadata: cardinality is LHS × RHS, variables are LHS ∪ RHS (RHS all canBeUndef)
    const metadata: () => Promise<MetadataBindings> = () => Promise.all([
      leftResult.metadata(),
      this.mediatorQueryOperation
        .mediate({ operation: operation.input[1], context })
        .then((r: IQueryOperationResult) => getSafeBindings(r).metadata()),
    ]).then(([ lhsMeta, rhsMeta ]: MetadataBindings[]) => {
      const cardinality = {
        type: (lhsMeta.cardinality.type === 'exact' && rhsMeta.cardinality.type === 'exact') ?
          <const> 'exact' :
          <const> 'estimate',
        value: lhsMeta.cardinality.value * rhsMeta.cardinality.value,
      };

      // LHS variables keep their canBeUndef; RHS variables are always canBeUndef in lateral
      const lhsVarNames = new Set(lhsMeta.variables.map((v: MetadataVariable) => v.variable.value));
      const rhsVarsCanBeUndef: MetadataVariable[] = rhsMeta.variables
        .filter((v: MetadataVariable) => !lhsVarNames.has(v.variable.value))
        .map((v: MetadataVariable) => ({ variable: v.variable, canBeUndef: true }));
      const variables: MetadataVariable[] = [ ...lhsMeta.variables, ...rhsVarsCanBeUndef ];

      const state = new MetadataValidationState();
      lhsMeta.state.addInvalidateListener(() => state.invalidate());
      rhsMeta.state.addInvalidateListener(() => state.invalidate());

      return { ...lhsMeta, variables, cardinality, state };
    });

    return { type: 'bindings', bindingsStream, metadata };
  }
}

export interface IActorQueryOperationLateralArgs extends IActorQueryOperationTypedMediatedArgs {}
