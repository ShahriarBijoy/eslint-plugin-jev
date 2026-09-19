import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;
RuleTester.itOnly = it.only as unknown as typeof RuleTester.itOnly;
(RuleTester as unknown as { afterAll: typeof afterAll }).afterAll = afterAll;
