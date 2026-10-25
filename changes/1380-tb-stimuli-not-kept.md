In short:
- SSim: a test bench always runs its own inputs: stimuli drawn on it apply in that simulation only, so a correct self-checking bench no longer fails.

In detail:
- SSim: Edit Stimuli on a test bench forces its unit under test's inputs in that simulation only; they are no longer saved for the bench nor forced again in its next simulations (whose own vectors then failed their checks), and stimuli kept for a bench before are dropped (#1380).
