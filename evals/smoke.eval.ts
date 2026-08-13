import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Blank-canvas cofounder identifies as Adzo for Aki.",
  async test(t) {
    await t.send("Who are you, and who do you work with?");
    t.succeeded();
    t.check(t.reply, includes("Adzo"));
    t.check(t.reply, includes("cofounder"));
  },
});
