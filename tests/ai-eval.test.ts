import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemoQuestions, buildDemoStructure } from "../src/lib/demoAi";
import {
  aiEvalCases,
  evaluateAiCase,
  runAiEval,
  validateEvalCaseInputs,
} from "../src/lib/aiEval";

const demoRunner = {
  providerLabel: "demo",
  generateQuestions: (input: Parameters<typeof buildDemoQuestions>[0]) =>
    Promise.resolve(buildDemoQuestions(input)),
  structureIdea: (
    input: Parameters<typeof buildDemoStructure>[0],
    answers: Record<string, string>,
  ) => Promise.resolve(buildDemoStructure(input, answers)),
};

describe("AI品質Eval（Golden Dataset・Issue #13）", () => {
  it("golden dataset inputs are schema-valid and survive masking", () => {
    const invalid = validateEvalCaseInputs();
    assert.deepEqual(invalid, []);
    assert.ok(aiEvalCases.length >= 5, "代表業務ケースを5件以上持つ");
  });

  it("all golden cases pass with the deterministic demo AI", async () => {
    const summary = await runAiEval(demoRunner);
    assert.equal(summary.totalCases, aiEvalCases.length);
    assert.equal(summary.passedCases, aiEvalCases.length, JSON.stringify(summary.results, null, 2));
    assert.equal(summary.passRate, 1);
    assert.equal(summary.executedWith, "demo");
    for (const result of summary.results) {
      assert.equal(result.ok, true, `${result.caseId}: ${result.failures.join(",")}`);
    }
  });

  it("per-case checks cover schema, PII, classification and completeness", async () => {
    const result = await evaluateAiCase(demoRunner, aiEvalCases[0]);
    assert.equal(result.checks.questionsSchemaValid, true);
    assert.equal(result.checks.questionsCount, true);
    assert.equal(result.checks.structureSchemaValid, true);
    assert.equal(result.checks.structureNoPii, true);
    assert.equal(result.checks.businessClassified, true);
    assert.equal(result.checks.structureComplete, true);
  });

  it("detects failures when the runner returns invalid output", async () => {
    const brokenRunner = {
      providerLabel: "broken",
      generateQuestions: () => Promise.resolve([{ id: "q1" }]), // 不完全
      structureIdea: () =>
        Promise.resolve({
          title: "",
          currentIssue: "",
          targetBusiness: "",
          targetUsers: "",
          currentWorkflow: "",
          improvementIdea: "",
          expectedEffects: "",
          requiredData: [],
          relatedSystems: [],
          implementationOptions: [],
          securityNotes: [],
          openQuestions: [],
          mvpCandidate: "",
          mvpDoneDefinition: "",
          department: "",
          submitterName: "",
          submitterEmail: "",
          coordinationNeeded: "",
        }),
    };
    const result = await evaluateAiCase(brokenRunner, aiEvalCases[0]);
    assert.equal(result.ok, false);
    assert.ok(result.failures.includes("questionsCount"));
    assert.ok(result.failures.includes("structureSchemaValid"));
    assert.ok(result.failures.includes("structureComplete"));
  });
});
