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
import type { Algebra } from '@comunica/utils-algebra';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { getSafeBindings, materializeOperation } from '@comunica/utils-query-operation';
import type * as RDF from '@rdfjs/types';
import { MultiTransformIterator, TransformIterator } from 'asynciterator';

export type Lateral = {
  type: 'lateral';
  input: [Algebra.Operation, Algebra.Operation];
};

export const lateralDisableKey = new ActionContextKey<boolean>('@local/actor-query-operation-lateral:disable');

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

    // For each LHS binding, inject it into the RHS pattern, evaluate, and merge results
    const bindingsStream: BindingsStream = new MultiTransformIterator(leftResult.bindingsStream, {
      autoStart: false,
      multiTransform: (lhsBinding: RDF.Bindings) => {
        const materializedRhs = materializeOperation(
          operation.input[1],
          lhsBinding,
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
