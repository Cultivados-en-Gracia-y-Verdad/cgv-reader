export type DependentThoughtIntroducer = {
  surface: string;
  tokenIds?: string[];
};

export const dependentThoughtIntroducers: DependentThoughtIntroducer[] = [
  { surface: "ἵνα" },
  { surface: "ὅτι" },
  { surface: "εἰ" },
  { surface: "ἐάν" },
  { surface: "ὅταν" },
  { surface: "ἐπειδή" },
  { surface: "ἐπεί" },
  { surface: "καθώς" },
  { surface: "ὡς", tokenIds: ["170105-80", "170107-106"] },
  { surface: "πρίν" }
];
