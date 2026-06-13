import type {
  IActionFunctionFactory,
  IActorFunctionFactoryArgs,
  IActorFunctionFactoryOutput,
  IActorFunctionFactoryOutputTerm,
} from '@comunica/bus-function-factory';
import {
  ActorFunctionFactoryDedicated,
} from '@comunica/bus-function-factory';
import type { IActorTest, TestResult } from '@comunica/core';
import { ActionContextKey, failTest } from '@comunica/core';
import { TermFunctionAdjust } from './TermFunctionAdjust';

export const adjustDisableKey = new ActionContextKey<boolean>('@local/actor-function-factory-term-adjust:disable');

/**
 * A comunica TermFunctionDay Function Factory Actor.
 */
export class ActorFunctionFactoryTermAdjust extends ActorFunctionFactoryDedicated {
  public constructor(args: IActorFunctionFactoryArgs) {
    super({
      ...args,
      functionNames: [ 'adjust' ],
      termFunction: true,
    });
  }

  public override async test(action: IActionFunctionFactory): Promise<TestResult<IActorTest>> {
    if (action.context.get(adjustDisableKey) ?? false) {
      return failTest('');
    }
    return super.test(action);
  }

  public async run<T extends IActionFunctionFactory>(_: T):
  Promise<T extends { requireTermExpression: true } ? IActorFunctionFactoryOutputTerm : IActorFunctionFactoryOutput> {
    return new TermFunctionAdjust();
  }
}
