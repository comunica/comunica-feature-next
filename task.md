Within this branch I have already inserted some code required to implement the SPARQL LATERAL operation as part of [SEP 6](https://github.com/w3c-cg/sparql-dev/blob/main/SEP/SEP-0006/sep-0006.md).
The SEP also has some spec tests: https://github.com/apache/jena/tree/main/jena-arq/testing/ARQ/Lateral which can be added in the engine package.json .

The code I copied was also used in a proof of concept demo I created: https://github.com/jitsedesmet/demo-mixed-composability/tree/main/comunica/packages/actor-query-operation-lateral

Note that where possible, the code quality and typing should be increased and that the parser and algebra components should be constructed in a high quality as in accordance to how TRAQULA does it: https://github.com/comunica/traqula  
