import { toAlgebra, SparqlNextParser } from '@comunica/actor-query-parse-sparql-next';
import { ActionContext } from '@comunica/core';
import { ActorFunctionFactoryTermAdjust, adjustDisableKey } from '../lib';
import { runFuncTestTable, createFuncMediator } from './util';
import { dateTimeTyped, dateTyped, dayTimeDurationTyped, timeTyped } from './util/Aliases';
import { Notation } from './util/TestTable';

describe('evaluation of \'ADJUST\'', () => {
  const parser = new SparqlNextParser({ lexerConfig: { positionTracking: 'full' }});
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermAdjust(args),
    ],
    arity: 2,
    notation: Notation.Function,
    toAlgebraParse: query => toAlgebra(parser.parse(query)),
    operation: 'ADJUST',
    testTable: `
    '${dateTimeTyped('2002-03-07T10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTimeTyped('2002-03-07T10:00:00-10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTimeTyped('2002-03-07T07:00:00-10:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00-07:00')}' '${dayTimeDurationTyped('PT10H')}' = '${dateTimeTyped('2002-03-08T03:00:00+10:00')}'
    '${dateTimeTyped('2002-03-07T00:00:00+01:00')}' '${dayTimeDurationTyped('-PT8H')}' = '${dateTimeTyped('2002-03-06T15:00:00-08:00')}'
    '${dateTimeTyped('2002-03-07T10:00:00')}' '${dayTimeDurationTyped('PT0H')}' = '${dateTimeTyped('2002-03-07T10:00:00')}'
    
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-07-10:00')}'
    '${dateTyped('2002-03-07-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${dateTyped('2002-03-06-10:00')}'
    '${dateTyped('2002-03-07')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${dateTyped('2002-03-07-10:30')}'

    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('10:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('-PT10H')}' = '${timeTyped('07:00:00-10:00')}'
    '${timeTyped('10:00:00-07:00')}' '${dayTimeDurationTyped('PT10H')}' = '${timeTyped('03:00:00+10:00')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('-PT10H30M')}' = '${timeTyped('10:00:00-10:30')}'
    '${timeTyped('10:00:00')}' '${dayTimeDurationTyped('PT30M')}' = '${timeTyped('10:00:00+00:30')}'
  `,
  });

  it('returns failTest when adjustDisableKey is set in context', async() => {
    const mediator = createFuncMediator([ args => new ActorFunctionFactoryTermAdjust(args) ], {});
    const bus = (<any> mediator).bus;
    const actor: ActorFunctionFactoryTermAdjust = bus.actors[0];
    const testResult = await actor.test({
      functionName: 'adjust',
      requireTermExpression: false,
      context: new ActionContext().set(adjustDisableKey, true),
    });
    expect(testResult.isFailed()).toBe(true);
  });
});
