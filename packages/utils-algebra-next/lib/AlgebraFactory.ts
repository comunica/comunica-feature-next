import { AlgebraFactory as AlgebraFactoryBase } from '@comunica/utils-algebra';
import type { Operation } from '@comunica/utils-algebra/lib/Algebra';
import type { Lateral } from './Algebra';
import { TypesNext } from './TypesNext';

export class AlgebraFactory extends AlgebraFactoryBase {
  public createLateral(left: Operation, right: Operation): Lateral {
    return {
      type: TypesNext.LATERAL,
      input: [ left, right ],
    };
  }
}
